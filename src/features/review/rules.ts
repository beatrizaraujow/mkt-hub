import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { companies, reviewRules, type ReviewRule } from "@/db/schema";
import { resolveRules, type Overlap } from "./resolve";

/**
 * Quais regras se aplicam a uma entrega.
 *
 * As camadas se somam e nunca são copiadas: o que vale para todo mundo, o que
 * vale para a empresa (e para as mães dela), e o que vale para aquele tipo de
 * peça. Se a regra comum fosse copiada em cada recorte, elas divergiriam —
 * alguém corrige numa e esquece nas outras, e seis meses depois duas partes do
 * sistema aplicam versões diferentes da mesma regra sem ninguém perceber.
 *
 * A regra nunca é inventada: se não está na tabela, não é aplicada. Isso é
 * garantia, não limitação.
 */

/** A empresa e a linha de mães dela, para a regra da mãe valer na sub-marca. */
export async function companyChain(companyId: string): Promise<string[]> {
  const chain: string[] = [];
  let current: string | null = companyId;

  // A árvore tem dois níveis hoje; o teto evita laço infinito se ganhar mais.
  for (let i = 0; current && i < 10; i++) {
    chain.push(current);
    const [row] = await db
      .select({ parentId: companies.parentId })
      .from(companies)
      .where(eq(companies.id, current))
      .limit(1);
    current = row?.parentId ?? null;
  }

  return chain;
}

export async function rulesFor(input: {
  orgId: string;
  companyId: string;
  skill: string | null;
  format: string | null;
}): Promise<ReviewRule[]> {
  const chain = await companyChain(input.companyId);

  return db
    .select()
    .from(reviewRules)
    .where(
      and(
        eq(reviewRules.orgId, input.orgId),
        eq(reviewRules.isActive, true),
        // Empresa nula = universal; senão, precisa estar na linha da empresa.
        or(isNull(reviewRules.companyId), inArray(reviewRules.companyId, chain)),
        // Campo nulo na regra = vale para qualquer valor da entrega.
        or(isNull(reviewRules.skill), input.skill ? eq(reviewRules.skill, input.skill) : undefined),
        or(
          isNull(reviewRules.format),
          input.format ? eq(reviewRules.format, input.format) : undefined,
        ),
      ),
    )
    .orderBy(asc(reviewRules.position), asc(reviewRules.code));
}

/**
 * O conjunto que vale para a entrega, com as sobreposições já resolvidas.
 *
 * É por aqui que o resto do sistema pergunta — `rulesFor` sozinho devolve a
 * união crua das camadas, e usar a união crua faria a regra que a empresa
 * substituiu continuar valendo junto com a que a substituiu.
 */
export async function applicableRules(input: {
  orgId: string;
  companyId: string;
  skill: string | null;
  format: string | null;
}): Promise<{ rules: ReviewRule[]; overlaps: Overlap[] }> {
  const { applied, overlaps } = resolveRules(await rulesFor(input));
  return { rules: applied, overlaps };
}

/** Só o que a máquina consegue conferir olhando a entrega. */
export function machineRules(rules: ReviewRule[]) {
  return rules.filter((rule) => rule.verifier === "maquina");
}

/** O que continua sendo responsabilidade de uma pessoa. */
export function humanRules(rules: ReviewRule[]) {
  return rules.filter((rule) => rule.verifier === "pessoa");
}

/** O que não é sobre a peça: cadência, processo, configuração de conta. */
export function outOfScopeRules(rules: ReviewRule[]) {
  return rules.filter((rule) => rule.verifier === "fora");
}
