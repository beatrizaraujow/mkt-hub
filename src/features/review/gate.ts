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
/**
 * O motivo, identificado.
 *
 * O texto continua sendo o que a pessoa lê e o que fica gravado no ciclo. O
 * código existe só para a tela saber **para onde mandar quem quer resolver** —
 * "falta a copy" sem um caminho até o campo da copy é diagnóstico sem saída.
 * Casar por prefixo de frase resolveria hoje e quebraria no dia em que alguém
 * melhorasse a redação.
 */
export type GateCode = "sumiu" | "desligado" | "sem_tipo" | "sem_copy" | "copy_curta" | "sem_regra";

export type GateReason = { code: GateCode; text: string };

export type GateResult =
  | { ok: true; ruleCount: number; skill: string; copyLength: number }
  | { ok: false; pending: GateReason[]; missing: string[] };

/** O texto é a verdade gravada; o código só acompanha. */
function barra(pending: GateReason[]): GateResult {
  return { ok: false, pending, missing: pending.map((reason) => reason.text) };
}

export async function runGate(workItemId: string): Promise<GateResult> {
  const [item] = await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
  if (!item) return barra([{ code: "sumiu", text: "A tarefa não existe mais." }]);

  const pending: GateReason[] = [];

  /**
   * O desligamento por marca vem primeiro e sozinho: se o revisor está
   * desligado para aquela empresa, o resto do diagnóstico é ruído — a pessoa
   * não precisa saber que também falta a copy de uma peça que ninguém vai
   * revisar.
   */
  if ((await disabledCompanies(item.orgId)).includes(item.companyId)) {
    return barra([
      { code: "desligado", text: "A revisão automática está desligada para esta empresa." },
    ]);
  }

  // Sem o tipo de peça não há como escolher as regras: é o recorte.
  if (!item.skill) pending.push({ code: "sem_tipo", text: "Falta o tipo da peça (campo Tipo)." });

  /**
   * A copy é a entrada desta versão. A descrição **não** serve de substituta:
   * ela é o pedido de quem abriu a tarefa, e revisar o pedido acharia erro em
   * texto que ninguém vai publicar.
   */
  const copy = item.copy?.trim() ?? "";
  const min = minCopyFor(item.skill, item.format);

  if (!copy) {
    pending.push({
      code: "sem_copy",
      text: "Falta a copy da entrega — é o texto que o revisor lê.",
    });
  } else if (copy.length < min) {
    pending.push({
      code: "copy_curta",
      text:
        `A copy tem ${copy.length} caracteres e este tipo de peça pede pelo menos ${min}. ` +
        "Parece rascunho ou link colado no campo errado.",
    });
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
    pending.push({
      code: "sem_regra",
      text:
        `Nenhuma regra de máquina cadastrada para "${item.skill}" nesta empresa. ` +
        "Enquanto não houver, o revisor não emite parecer.",
    });
  }

  if (pending.length > 0) return barra(pending);

  return {
    ok: true,
    ruleCount: rules.length,
    skill: item.skill as string,
    copyLength: copy.length,
  };
}
