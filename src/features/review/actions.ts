"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reviewChecklistAnswers, reviewCycles, reviewRuns, workItems } from "@/db/schema";
import { assertCompanyAccess, requireUserAction } from "@/lib/auth";
import { applyVerdicts } from "@/features/work-items/review-bridge";
import { drainReviewQueue } from "./drain";
import { enqueueReview } from "./queue";
import { reviewMode } from "./settings";

export type ReviewState = { error?: string; ok?: boolean; cycleId?: string; round?: number };

/**
 * Pede uma revisão. Devolve na hora com o identificador do ciclo — o
 * julgamento acontece depois, pelo cron.
 *
 * Não espera resposta de propósito: julgamento com IA leva de dezenas de
 * segundos a minutos e estouraria o tempo da server action.
 */
export async function requestReview(workItemId: string): Promise<ReviewState> {
  try {
    const user = await requireUserAction();

    const [item] = await db
      .select({ id: workItems.id, orgId: workItems.orgId, companyId: workItems.companyId })
      .from(workItems)
      .where(eq(workItems.id, workItemId))
      .limit(1);

    if (!item) return { error: "Tarefa não encontrada." };
    assertCompanyAccess(user, item.companyId);

    // Duas revisões da mesma entrega ao mesmo tempo gastariam IA em dobro
    // para dar a mesma resposta.
    const [running] = await db
      .select({ id: reviewCycles.id })
      .from(reviewCycles)
      .where(
        and(
          eq(reviewCycles.workItemId, item.id),
          eq(reviewCycles.status, "rodando"),
        ),
      )
      .limit(1);

    if (running) return { error: "Já existe uma revisão em andamento nesta tarefa." };

    const created = await enqueueReview({
      orgId: item.orgId,
      workItemId: item.id,
      requestedById: user.id,
      isSilent: (await reviewMode(item.orgId)) === "silencioso",
    });

    /**
     * Processa depois de responder, nao dentro da resposta: quem clicou nao
     * fica olhando para uma tela travada. O cron continua sendo a rede — se
     * este processamento morrer no meio, a reserva expira e a execucao volta
     * a ser pega.
     */
    after(async () => {
      const report = await drainReviewQueue();
      await applyVerdicts(report.emitidos);
    });

    revalidatePath("/trabalho");
    return { ok: true, cycleId: created.cycleId, round: created.round };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível pedir a revisão." };
  }
}

export type CycleSummary = {
  id: string;
  round: number;
  status: string;
  verdict: string | null;
  gateMissing: string[];
  createdAt: Date;
  finishedAt: Date | null;
  attempts: number;
  lastError: string | null;
};

/** O histórico de revisões de uma entrega, do mais recente para o mais antigo. */
export async function cyclesFor(workItemId: string): Promise<CycleSummary[]> {
  const user = await requireUserAction();

  const [item] = await db
    .select({ companyId: workItems.companyId })
    .from(workItems)
    .where(eq(workItems.id, workItemId))
    .limit(1);

  if (!item) return [];
  assertCompanyAccess(user, item.companyId);

  const cycles = await db
    .select()
    .from(reviewCycles)
    .where(eq(reviewCycles.workItemId, workItemId))
    .orderBy(desc(reviewCycles.round));

  if (cycles.length === 0) return [];

  const runs = await db
    .select()
    .from(reviewRuns)
    .where(
      inArray(
        reviewRuns.cycleId,
        cycles.map((cycle) => cycle.id),
      ),
    )
    .orderBy(desc(reviewRuns.attempt));

  return cycles.map((cycle) => {
    const own = runs.filter((run) => run.cycleId === cycle.id);
    return {
      id: cycle.id,
      round: cycle.round,
      status: cycle.status,
      verdict: cycle.verdict,
      gateMissing: cycle.gateMissing,
      createdAt: cycle.createdAt,
      finishedAt: cycle.finishedAt,
      attempts: own.length,
      lastError: own.find((run) => run.error)?.error ?? null,
    };
  });
}

/**
 * Marca ou desmarca um item do checklist humano.
 *
 * Guardado por entrega e nao por rodada de IA: o checklist e da etapa de
 * aprovacao, e a peca pode chegar la sem nunca ter passado pelo robo.
 */
export async function answerChecklist(
  workItemId: string,
  itemId: string,
  checked: boolean,
): Promise<ReviewState> {
  try {
    const user = await requireUserAction();

    const [item] = await db
      .select({ companyId: workItems.companyId })
      .from(workItems)
      .where(eq(workItems.id, workItemId))
      .limit(1);

    if (!item) return { error: "Tarefa nao encontrada." };
    assertCompanyAccess(user, item.companyId);

    await db
      .insert(reviewChecklistAnswers)
      .values({ workItemId, itemId, checked, answeredById: user.id })
      .onConflictDoUpdate({
        target: [reviewChecklistAnswers.workItemId, reviewChecklistAnswers.itemId],
        set: { checked, answeredById: user.id, answeredAt: new Date() },
      });

    revalidatePath("/trabalho");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Nao foi possivel responder." };
  }
}
