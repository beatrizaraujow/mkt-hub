import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  reviewChecklistAnswers,
  reviewChecklistItems,
  type ReviewChecklistItem,
} from "@/db/schema";
import { companyChain } from "./rules";

/**
 * O checklist humano.
 *
 * É o que sobrou para a pessoa: as regras que ninguém consegue conferir
 * olhando o texto. Ele **não repete o que a máquina já confere** — se pedir
 * para alguém conferir o que o robô confere, em duas semanas essa pessoa marca
 * tudo no automático, e aí o checklist deixa de valer justamente nos poucos
 * itens em que ele era a única defesa.
 *
 * A exceção são os medidores (`isReliabilityProbe`): um ou dois itens que a
 * máquina também confere, para comparar. Se alguém marcou "revisei a
 * ortografia" e a máquina achou três erros logo depois, você aprendeu algo
 * sobre o processo.
 */

export type ChecklistLine = ReviewChecklistItem & { checked: boolean };

export async function checklistFor(item: {
  orgId: string;
  companyId: string;
  skill: string | null;
}): Promise<ReviewChecklistItem[]> {
  const chain = await companyChain(item.companyId);

  return db
    .select()
    .from(reviewChecklistItems)
    .where(
      and(
        eq(reviewChecklistItems.orgId, item.orgId),
        eq(reviewChecklistItems.isActive, true),
        or(isNull(reviewChecklistItems.companyId), inArray(reviewChecklistItems.companyId, chain)),
        or(
          isNull(reviewChecklistItems.skill),
          item.skill ? eq(reviewChecklistItems.skill, item.skill) : undefined,
        ),
      ),
    )
    .orderBy(asc(reviewChecklistItems.position));
}

/** O checklist da entrega, já com o que foi respondido. */
export async function checklistOf(item: {
  id: string;
  orgId: string;
  companyId: string;
  skill: string | null;
}): Promise<ChecklistLine[]> {
  const items = await checklistFor(item);
  if (items.length === 0) return [];

  const answers = await db
    .select()
    .from(reviewChecklistAnswers)
    .where(eq(reviewChecklistAnswers.workItemId, item.id));

  const checked = new Set(answers.filter((row) => row.checked).map((row) => row.itemId));

  return items.map((line) => ({ ...line, checked: checked.has(line.id) }));
}

/** Quantos itens ainda faltam. Zero significa que a etapa pode avançar. */
export async function pendingChecklist(item: {
  id: string;
  orgId: string;
  companyId: string;
  skill: string | null;
}): Promise<number> {
  const lines = await checklistOf(item);
  return lines.filter((line) => !line.checked).length;
}
