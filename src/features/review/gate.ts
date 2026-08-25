import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, workItems } from "@/db/schema";
import { machineRules, rulesFor } from "./rules";

/**
 * O porteiro.
 *
 * Boa parte do que faz uma revisão automática dar errado não é a revisão: é
 * entrada incompleta. Falta a classificação, falta o arquivo, veio link em vez
 * de peça. Esta checagem é barata e determinística, roda **antes** de gastar
 * IA, e devolve exatamente o que falta.
 *
 * Isso economiza custo, evita parecer inventado, e ensina o time sem ninguém
 * precisar cobrar.
 */
export type GateResult =
  | { ok: true; ruleCount: number; skill: string; attachmentCount: number }
  | { ok: false; missing: string[] };

export async function runGate(workItemId: string): Promise<GateResult> {
  const [item] = await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
  if (!item) return { ok: false, missing: ["A tarefa não existe mais."] };

  const missing: string[] = [];

  // Sem o tipo de peça não há como escolher as regras: é o recorte.
  if (!item.skill) missing.push("Falta o tipo da peça (campo Tipo).");

  const files = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.workItemId, workItemId), eq(attachments.kind, "file")));

  if (files.length === 0) {
    missing.push("Nenhum arquivo anexado — só link não dá para revisar.");
  }

  const rules = item.skill
    ? machineRules(
        await rulesFor({
          orgId: item.orgId,
          companyId: item.companyId,
          skill: item.skill,
          format: item.format,
        }),
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
    attachmentCount: files.length,
  };
}
