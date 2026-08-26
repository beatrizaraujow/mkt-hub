import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workItems } from "@/db/schema";
import { minCopyFor } from "./copy";
import { applicableRules, machineRules } from "./rules";
import { disabledCompanies } from "./settings";

/**
 * O porteiro.
 *
 * Boa parte do que faz uma revisão automática dar errado não é a revisão: é
 * entrada incompleta. Falta a classificação, falta a copy, veio o briefing no
 * lugar da peça. Esta checagem é barata, determinística e roda **antes** de
 * gastar IA, e devolve exatamente o que falta.
 *
 * Toda vez que existir jeito barato e exato de saber uma coisa, é esse que se
 * usa. IA é cara, lenta e não repete a mesma resposta duas vezes — fica só
 * para o que exige julgamento.
 */
export type GateResult =
  | { ok: true; ruleCount: number; skill: string; copyLength: number }
  | { ok: false; missing: string[] };

export async function runGate(workItemId: string): Promise<GateResult> {
  const [item] = await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
  if (!item) return { ok: false, missing: ["A tarefa não existe mais."] };

  const missing: string[] = [];

  /**
   * O desligamento por marca vem primeiro e sozinho: se o revisor está
   * desligado para aquela empresa, o resto do diagnóstico é ruído — a pessoa
   * não precisa saber que também falta a copy de uma peça que ninguém vai
   * revisar.
   */
  if ((await disabledCompanies(item.orgId)).includes(item.companyId)) {
    return { ok: false, missing: ["A revisão automática está desligada para esta empresa."] };
  }

  // Sem o tipo de peça não há como escolher as regras: é o recorte.
  if (!item.skill) missing.push("Falta o tipo da peça (campo Tipo).");

  /**
   * A copy é a entrada desta versão. A descrição **não** serve de substituta:
   * ela é o pedido de quem abriu a tarefa, e revisar o pedido acharia erro em
   * texto que ninguém vai publicar.
   */
  const copy = item.copy?.trim() ?? "";
  const min = minCopyFor(item.skill, item.format);

  if (!copy) {
    missing.push("Falta a copy da entrega — é o texto que o revisor lê.");
  } else if (copy.length < min) {
    missing.push(
      `A copy tem ${copy.length} caracteres e este tipo de peça pede pelo menos ${min}. ` +
        "Parece rascunho ou link colado no campo errado.",
    );
  }

  const rules = item.skill
    ? machineRules(
        (
          await applicableRules({
            orgId: item.orgId,
            companyId: item.companyId,
            skill: item.skill,
            format: item.format,
          })
        ).rules,
      )
    : [];

  /**
   * Onde o manual não define nada, a tentação é preencher com boa prática de
   * mercado. Não fazemos: regra ruim aplicada em escala e com autoridade é
   * pior que regra ausente. O buraco vira pendência visível, e a área de
   * negócio decide.
   */
  if (item.skill && rules.length === 0) {
    missing.push(
      `Nenhuma regra de máquina cadastrada para "${item.skill}" nesta empresa. ` +
        "Enquanto não houver, o revisor não emite parecer.",
    );
  }

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    ruleCount: rules.length,
    skill: item.skill as string,
    copyLength: copy.length,
  };
}
