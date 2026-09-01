import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  reviewChecklistAnswers,
  reviewChecklistItems,
  type ReviewChecklistItem,
} from "@/db/schema";
import { CONFIRMACAO_DA_EXCECAO } from "@/lib/excecao";
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

/**
 * Uma linha do checklist como a tela a vê.
 *
 * Não é a linha do catálogo: numa peça marcada como sem revisão automática
 * uma das linhas não vem de `review_checklist_items` nenhuma — é a
 * co-assinatura da exceção, que é do próprio item. Por isso o tipo é próprio,
 * em vez de ser o da tabela com um campo a mais.
 */
export type ChecklistLine = {
  id: string;
  text: string;
  isReliabilityProbe: boolean;
  checked: boolean;
  /** A linha da co-assinatura. Responder nela grava no item, não em respostas. */
  isCosign: boolean;
};

/** O que o checklist precisa saber sobre a entrega. */
export type ItemDoChecklist = {
  id: string;
  orgId: string;
  companyId: string;
  skill: string | null;
  reviewExempt: boolean;
  reviewExemptCosignedAt: Date | null;
};

/**
 * O identificador da linha de co-assinatura.
 *
 * Fixo e sem par no banco de propósito: ele nunca vira `item_id` em
 * `review_checklist_answers` — a resposta mora no próprio item. É só o que a
 * tela precisa para saber qual botão chama qual action.
 */
export const COASSINATURA_ID = "coassinatura-da-excecao";

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

/**
 * O checklist da entrega, já com o que foi respondido.
 *
 * Numa peça marcada como sem revisão automática o checklist muda de uma linha:
 * os itens que dependem do laudo saem — não existe laudo para ler — e no lugar
 * entra a co-assinatura da exceção. Assim quem aprova assina junto a decisão,
 * em vez de herdar em silêncio a de outra pessoa. O resto continua igual: a
 * exceção dispensa a máquina, nunca a conferência de gente.
 */
export async function checklistOf(item: ItemDoChecklist): Promise<ChecklistLine[]> {
  const items = await checklistFor(item);
  const relevantes = item.reviewExempt ? items.filter((line) => !line.dependsOnReport) : items;

  const answers =
    relevantes.length > 0
      ? await db
          .select()
          .from(reviewChecklistAnswers)
          .where(eq(reviewChecklistAnswers.workItemId, item.id))
      : [];

  const checked = new Set(answers.filter((row) => row.checked).map((row) => row.itemId));

  const linhas: ChecklistLine[] = relevantes.map((line) => ({
    id: line.id,
    text: line.text,
    isReliabilityProbe: line.isReliabilityProbe,
    checked: checked.has(line.id),
    isCosign: false,
  }));

  if (item.reviewExempt) {
    linhas.push({
      id: COASSINATURA_ID,
      text: CONFIRMACAO_DA_EXCECAO,
      isReliabilityProbe: false,
      checked: item.reviewExemptCosignedAt !== null,
      isCosign: true,
    });
  }

  return linhas;
}

/** Quantos itens ainda faltam. Zero significa que a etapa pode avançar. */
export async function pendingChecklist(item: ItemDoChecklist): Promise<number> {
  const lines = await checklistOf(item);
  return lines.filter((line) => !line.checked).length;
}
