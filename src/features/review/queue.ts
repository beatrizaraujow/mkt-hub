import "server-only";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { reviewCycles, reviewRuns, type ReviewRun } from "@/db/schema";

/**
 * A fila do revisor.
 *
 * Julgamento com IA leva de dezenas de segundos a minutos e estoura o tempo de
 * espera de quem chamou. Então o pedido é aceito, responde na hora com um
 * identificador, e o processamento acontece depois — pelo cron.
 *
 * Isso obriga a ter registro de execução com estado, tentativa e motivo da
 * falha desde o primeiro dia. Parece cedo demais; não é. Adaptar depois
 * significa reescrever o miolo.
 */

/** Depois disso o ciclo termina em `falhou`, nunca em veredito. */
export const MAX_ATTEMPTS = 3;

/** Quanto tempo uma execução fica reservada antes de outro processo poder pegá-la. */
export const CLAIM_MINUTES = 5;

/** Quantas execuções cada passada do cron processa. */
export const BATCH_SIZE = 5;

/**
 * Cria o ciclo e a primeira execução. Devolve na hora, sem esperar nada —
 * é o que permite a tela responder enquanto o julgamento ainda não começou.
 *
 * A rodada é sempre a próxima daquela entrega: refazer a peça e pedir revisão
 * de novo vira ciclo 2, não sobrescreve o 1. Sem isso não dá para saber se a
 * terceira tentativa melhorou.
 */
export async function enqueueReview(input: {
  orgId: string;
  workItemId: string;
  requestedById: string | null;
  isSilent?: boolean;
}): Promise<{ cycleId: string; round: number }> {
  const [last] = await db
    .select({ round: reviewCycles.round })
    .from(reviewCycles)
    .where(eq(reviewCycles.workItemId, input.workItemId))
    .orderBy(sql`${reviewCycles.round} desc`)
    .limit(1);

  const round = (last?.round ?? 0) + 1;

  const [cycle] = await db
    .insert(reviewCycles)
    .values({
      orgId: input.orgId,
      workItemId: input.workItemId,
      requestedById: input.requestedById,
      round,
      status: "pendente",
      isSilent: input.isSilent ?? true,
    })
    .returning({ id: reviewCycles.id });

  await db.insert(reviewRuns).values({ cycleId: cycle.id, attempt: 1, state: "na_fila" });

  return { cycleId: cycle.id, round };
}

/**
 * Devolve execuções reservadas para este processo.
 *
 * `for update skip locked` porque duas invocações do cron podem se sobrepor:
 * sem isso, as duas pegam a mesma linha e o julgamento roda em dobro — caro e
 * com resultados divergentes para a mesma entrega.
 */
export async function claimRuns(limit = BATCH_SIZE): Promise<ReviewRun[]> {
  const now = new Date();
  const expires = new Date(now.getTime() + CLAIM_MINUTES * 60 * 1000);

  const rows = await db
    .update(reviewRuns)
    .set({ state: "rodando", claimedAt: now, claimExpiresAt: expires, startedAt: now })
    .where(
      inArray(
        reviewRuns.id,
        db
          .select({ id: reviewRuns.id })
          .from(reviewRuns)
          .where(eq(reviewRuns.state, "na_fila"))
          .orderBy(asc(reviewRuns.createdAt))
          .limit(limit)
          .for("update", { skipLocked: true }),
      ),
    )
    .returning();

  return rows;
}

/**
 * Execução que ficou reservada além do prazo: o processo morreu no meio.
 *
 * Vira falha explícita em vez de voltar para a fila calada — assim a tentativa
 * é contada e o teto de `MAX_ATTEMPTS` continua valendo. Uma execução que
 * volta para a fila sem contar tentativa fica girando para sempre.
 */
export async function reclaimExpired(): Promise<ReviewRun[]> {
  const now = new Date();

  return db
    .update(reviewRuns)
    .set({ state: "falhou", error: "Reserva expirou: o processo não terminou a tempo.", finishedAt: now })
    .where(
      and(
        eq(reviewRuns.state, "rodando"),
        or(isNull(reviewRuns.claimExpiresAt), lt(reviewRuns.claimExpiresAt, now)),
      ),
    )
    .returning();
}

export async function finishRun(
  runId: string,
  data: { model?: string | null; tokensIn?: number | null; tokensOut?: number | null } = {},
) {
  await db
    .update(reviewRuns)
    .set({
      state: "concluida",
      finishedAt: new Date(),
      model: data.model ?? null,
      tokensIn: data.tokensIn ?? null,
      tokensOut: data.tokensOut ?? null,
    })
    .where(eq(reviewRuns.id, runId));
}

/**
 * Marca a execução como falha e decide se tenta de novo.
 *
 * Falha técnica **nunca vira veredito**. Esgotadas as tentativas, o ciclo
 * termina em `falhou` e fica visível — o sistema não aprova por otimismo nem
 * reprova por precaução. Aprovação silenciosa por erro de rede é a falha mais
 * perigosa que um sistema desses pode ter, porque ninguém investiga o que
 * passou, só o que barrou.
 */
export async function failRun(
  run: ReviewRun,
  message: string,
  /**
   * Falha que tentar de novo nao resolve — configuracao ausente, codigo que
   * ainda nao existe. Repetir tres vezes so gasta tempo e enche o log.
   */
  options: { retry?: boolean } = {},
): Promise<{ retried: boolean }> {
  await db
    .update(reviewRuns)
    .set({ state: "falhou", error: message.slice(0, 2000), finishedAt: new Date() })
    .where(eq(reviewRuns.id, run.id));

  if (options.retry !== false && run.attempt < MAX_ATTEMPTS) {
    await db
      .insert(reviewRuns)
      .values({ cycleId: run.cycleId, attempt: run.attempt + 1, state: "na_fila" })
      .onConflictDoNothing();
    return { retried: true };
  }

  await db
    .update(reviewCycles)
    .set({ status: "falhou", finishedAt: new Date() })
    .where(eq(reviewCycles.id, run.cycleId));

  return { retried: false };
}

/** Entrada incompleta: o porteiro barrou antes de gastar IA. Não é reprovação. */
export async function markIncomplete(cycleId: string, missing: string[]) {
  await db
    .update(reviewCycles)
    .set({ status: "incompleto", gateMissing: missing, finishedAt: new Date() })
    .where(eq(reviewCycles.id, cycleId));
}

export async function markRunning(cycleId: string) {
  await db.update(reviewCycles).set({ status: "rodando" }).where(eq(reviewCycles.id, cycleId));
}
