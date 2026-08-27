"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { coinLedger, snapshotEntries, weekSnapshots } from "@/db/schema";
import { assertCanManage, requireUserAction } from "@/lib/auth";
import { describeError } from "@/lib/errors";
import { semanaDe } from "@/lib/week";
import { reguasDaOrg, brutosDaSemana } from "./queries";
import { montarFechamento } from "./snapshot";

export type FechamentoState = { error?: string; ok?: boolean };

function fail(message: string): FechamentoState {
  return { error: message };
}

function problem(err: unknown, fallback: string): FechamentoState {
  const detail = describeError(err);
  if (err instanceof Error && !detail.includes("Failed query")) return fail(err.message);
  console.error("[desempenho]", detail);
  return fail(fallback);
}

/**
 * Calcula a semana e guarda como **pendente**.
 *
 * Recalcular uma semana pendente e seguro e desejavel: enquanto ninguem
 * fechou, ela e so uma proposta, e uma tarefa lancada depois deve entrar. O
 * que nao se recalcula e semana fechada — essa conta a historia de quando
 * fechou, e mexer nela mudaria pagamento ja feito.
 */
export async function calcularSemana(ymd: string): Promise<FechamentoState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const semana = semanaDe(ymd);

    const [existente] = await db
      .select({ id: weekSnapshots.id, status: weekSnapshots.status })
      .from(weekSnapshots)
      .where(and(eq(weekSnapshots.orgId, user.orgId), eq(weekSnapshots.weekId, semana.id)))
      .limit(1);

    if (existente?.status === "fechado") {
      return fail("Esta semana já foi fechada. Fechamento não se recalcula.");
    }

    const [reguas, brutos] = await Promise.all([reguasDaOrg(user), brutosDaSemana(user, semana)]);
    if (reguas.length === 0) return fail("Ninguém tem régua de desempenho cadastrada ainda.");

    const entradas = montarFechamento(reguas, brutos);

    await db.transaction(async (tx) => {
      const id =
        existente?.id ??
        (
          await tx
            .insert(weekSnapshots)
            .values({
              orgId: user.orgId,
              weekId: semana.id,
              weekStart: semana.inicio,
              weekEnd: semana.fim,
            })
            .returning({ id: weekSnapshots.id })
        )[0].id;

      if (existente) {
        await tx.update(weekSnapshots).set({ calculatedAt: new Date() }).where(eq(weekSnapshots.id, id));
        // Recalcular substitui as linhas. Coin validada ainda nao existe aqui:
        // validar so acontece depois, e fechar trava o recalculo.
        await tx.delete(snapshotEntries).where(eq(snapshotEntries.snapshotId, id));
      }

      await tx.insert(snapshotEntries).values(
        entradas.map((entrada) => ({
          snapshotId: id,
          userId: entrada.pessoaId,
          name: entrada.nome,
          jobTitle: entrada.cargo,
          rule: entrada.rule,
          points: entrada.pontos,
          deliveries: entrada.entregas,
          withoutPoints: entrada.semPonto,
          routinesDone: entrada.rotinasFeitas,
          routinesDue: entrada.rotinasCobradas,
          weeklyTarget: entrada.meta,
          weeklyTarget120: entrada.meta120,
          percent: entrada.percentual,
          position: entrada.posicao,
          coinsSuggested: entrada.coinsSugeridas,
        })),
      );
    });

    revalidatePath("/desempenho");
    return { ok: true };
  } catch (err) {
    return problem(err, "Não foi possível calcular a semana.");
  }
}

/** Ajusta a coin de uma pessoa antes de fechar, com o motivo escrito. */
export async function validarCoins(
  entryId: string,
  coins: number,
  nota: string,
): Promise<FechamentoState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    if (!Number.isInteger(coins) || coins < 0 || coins > 6) {
      return fail("Coins entre 0 e 6.");
    }

    const [entrada] = await db
      .select({ id: snapshotEntries.id, snapshotId: snapshotEntries.snapshotId })
      .from(snapshotEntries)
      .where(eq(snapshotEntries.id, entryId))
      .limit(1);

    if (!entrada) return fail("Linha não encontrada.");

    const [snapshot] = await db
      .select({ status: weekSnapshots.status, orgId: weekSnapshots.orgId })
      .from(weekSnapshots)
      .where(eq(weekSnapshots.id, entrada.snapshotId))
      .limit(1);

    if (!snapshot || snapshot.orgId !== user.orgId) return fail("Fechamento não encontrado.");
    if (snapshot.status === "fechado") return fail("Semana fechada não se edita.");

    await db
      .update(snapshotEntries)
      .set({ coinsValidated: coins, note: nota.trim().slice(0, 300) })
      .where(eq(snapshotEntries.id, entryId));

    revalidatePath("/desempenho");
    return { ok: true };
  } catch (err) {
    return problem(err, "Não foi possível ajustar.");
  }
}

/**
 * Fecha a semana e credita o extrato. **O momento em que numero vira coin.**
 *
 * Credita o que foi validado; onde ninguem mexeu, vale a sugestao — silencio
 * de quem revisou e concordancia, nao ausencia de decisao. Vai tudo numa
 * transacao com o indice unico parcial por tras: fechar duas vezes bate no
 * banco, nao numa checagem que alguem pode esquecer de fazer.
 */
export async function fecharSemana(snapshotId: string): Promise<FechamentoState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const [snapshot] = await db
      .select()
      .from(weekSnapshots)
      .where(and(eq(weekSnapshots.id, snapshotId), eq(weekSnapshots.orgId, user.orgId)))
      .limit(1);

    if (!snapshot) return fail("Fechamento não encontrado.");
    if (snapshot.status === "fechado") return fail("Esta semana já está fechada.");

    const linhas = await db
      .select()
      .from(snapshotEntries)
      .where(eq(snapshotEntries.snapshotId, snapshotId));

    await db.transaction(async (tx) => {
      for (const linha of linhas) {
        const coins = linha.coinsValidated ?? linha.coinsSuggested;
        // Congela o que foi pago, inclusive quando veio da sugestao.
        await tx
          .update(snapshotEntries)
          .set({ coinsValidated: coins })
          .where(eq(snapshotEntries.id, linha.id));

        if (coins <= 0) continue;

        await tx.insert(coinLedger).values({
          orgId: user.orgId,
          userId: linha.userId,
          weekId: snapshot.weekId,
          type: "semanal",
          amount: coins,
          description: `Fechamento de ${snapshot.weekId}`,
          createdById: user.id,
        });
      }

      await tx
        .update(weekSnapshots)
        .set({ status: "fechado", closedAt: new Date(), closedById: user.id })
        .where(eq(weekSnapshots.id, snapshotId));
    });

    revalidatePath("/desempenho");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return problem(err, "Não foi possível fechar a semana.");
  }
}
