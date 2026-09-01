import "server-only";
import { after } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewCycles, workItemStages, workItems, type WorkItem } from "@/db/schema";
import { drainReviewQueue } from "@/features/review/drain";
import { enqueueReview } from "@/features/review/queue";
import { reviewMode } from "@/features/review/settings";
import { humanReaction, type Verdict } from "@/features/review/verdict";

/**
 * A ponte entre a etapa e o revisor.
 *
 * A divisão é a que sustenta o resto: **o revisor julga e não move nada; o
 * transporte move e não julga nada.** Este arquivo é o transporte. Ele sabe o
 * que é uma coluna do quadro e sabe fazer `update` em `stage_id`; o que ele
 * nunca faz é decidir veredito.
 *
 * Se um dia o julgamento virar um serviço separado, é este arquivo que muda —
 * e nenhuma linha do raciocínio precisa ser reescrita.
 */

const STAGE_REVIEW = "revisao_ia";
const STAGE_FIX = "ajustar";

/**
 * O item entrou na revisão IA: enfileira e processa logo em seguida.
 *
 * O julgamento acontece depois da resposta, não dentro dela — quem arrastou o
 * cartão não fica olhando para uma tela travada por meio minuto. O cron
 * continua existindo como rede: se este processamento morrer no meio, a
 * reserva expira e a execução volta a ser pega.
 */
export async function onEnterReviewStage(
  item: Pick<WorkItem, "id" | "orgId" | "reviewExempt">,
  userId: string,
) {
  /*
   * Peça marcada não é revisada, e a checagem é aqui além de no porteiro: o
   * porteiro barra depois de o ciclo já existir, e um ciclo barrado numa peça
   * que ninguém queria revisar só polui o histórico da entrega.
   */
  if (item.reviewExempt) return;

  // Uma revisão já andando é a mesma resposta pelo dobro do preço.
  const [busy] = await db
    .select({ id: reviewCycles.id })
    .from(reviewCycles)
    .where(
      and(
        eq(reviewCycles.workItemId, item.id),
        eq(reviewCycles.status, "rodando"),
      ),
    )
    .limit(1);

  if (busy) return;

  const [waiting] = await db
    .select({ id: reviewCycles.id })
    .from(reviewCycles)
    .where(and(eq(reviewCycles.workItemId, item.id), eq(reviewCycles.status, "pendente")))
    .limit(1);

  if (!waiting) {
    const mode = await reviewMode(item.orgId);
    await enqueueReview({
      orgId: item.orgId,
      workItemId: item.id,
      requestedById: userId,
      isSilent: mode === "silencioso",
    });
  }

  after(async () => {
    const report = await drainReviewQueue();
    await applyVerdicts(report.emitidos);
  });
}

/**
 * O que fazer com os pareceres que saíram.
 *
 * Em silencioso, nada: o parecer fica ao lado da entrega e quem decide é
 * gente. Em ativo, **só a reprovação anda sozinha** — aprovado continua
 * parado esperando um clique humano, porque carimbar aprovação sem ninguém
 * olhar é o tipo de autonomia que ninguém pediu e que só se descobre errada
 * depois de publicada.
 */
export async function applyVerdicts(cycleIds: string[]) {
  for (const cycleId of cycleIds) {
    const [cycle] = await db
      .select()
      .from(reviewCycles)
      .where(eq(reviewCycles.id, cycleId))
      .limit(1);

    if (!cycle || cycle.verdict !== "reprovado") continue;
    if (cycle.isSilent) continue;

    // Terceira reprovação seguida: o sistema para de decidir e chama gente.
    if (cycle.escalated) continue;

    const [item] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, cycle.workItemId))
      .limit(1);

    if (!item) continue;

    const [current] = await db
      .select({ slug: workItemStages.slug })
      .from(workItemStages)
      .where(eq(workItemStages.id, item.stageId))
      .limit(1);

    // Alguém já mexeu no cartão enquanto o parecer saía: a pessoa manda.
    if (current?.slug !== STAGE_REVIEW) continue;

    const [target] = await db
      .select({ id: workItemStages.id })
      .from(workItemStages)
      .where(
        and(
          eq(workItemStages.orgId, item.orgId),
          eq(workItemStages.type, item.type),
          eq(workItemStages.slug, STAGE_FIX),
        ),
      )
      .limit(1);

    if (!target) continue;

    await db
      .update(workItems)
      .set({ stageId: target.id, updatedAt: new Date() })
      .where(eq(workItems.id, item.id));
  }
}

/**
 * Registra o que a pessoa decidiu depois de ler o parecer.
 *
 * Chamado quando a entrega sai de `revisao_ia` ou de `ajustar` pela mão de
 * alguém. Sem este registro não existe taxa de reversão — e a taxa de
 * reversão é a métrica que decide se a ferramenta fica ou sai.
 */
export async function recordHumanDecision(
  workItemId: string,
  userId: string,
  movedForward: boolean,
) {
  const [cycle] = await db
    .select({ id: reviewCycles.id, verdict: reviewCycles.verdict })
    .from(reviewCycles)
    .where(and(eq(reviewCycles.workItemId, workItemId), eq(reviewCycles.status, "emitido")))
    .orderBy(desc(reviewCycles.round))
    .limit(1);

  if (!cycle) return;

  const reaction = humanReaction(cycle.verdict as Verdict | null, movedForward);
  if (!reaction) return;

  await db
    .update(reviewCycles)
    .set({ humanVerdict: reaction, humanDecidedById: userId, humanDecidedAt: new Date() })
    .where(eq(reviewCycles.id, cycle.id));
}

export const REVIEW_STAGE = STAGE_REVIEW;
export const FIX_STAGE = STAGE_FIX;
