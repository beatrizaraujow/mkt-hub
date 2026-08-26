import "server-only";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  reviewChecklistItems,
  reviewRules,
  workItems,
  type ReviewChecklistItem,
  type ReviewRule,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { modelConfigured, modelName, provider, type Provider } from "./model";
import { disabledCompanies, reviewMode, type Mode } from "./settings";

export type CompanyOption = { id: string; name: string; parentId: string | null };

export type RuleRow = ReviewRule & { companyName: string | null };
export type ChecklistRow = ReviewChecklistItem & { companyName: string | null };

/** Um recorte que o time usa de verdade e para o qual não existe regra. */
export type Gap = {
  companyId: string;
  companyName: string;
  skill: string;
  items: number;
  hasChecklist: boolean;
};

export type RulesData = {
  rules: RuleRow[];
  checklist: ChecklistRow[];
  companies: CompanyOption[];
  /** Quantas de cada balde. É o número que diz se a classificação avançou. */
  counts: { maquina: number; pessoa: number; fora: number };
  /**
   * Onde falta regra. Só combinações que aparecem em entrega de verdade —
   * listar todas as empresas contra todos os tipos daria uma lista de
   * centenas de linhas que ninguém lê, e uma lista que ninguém lê esconde
   * exatamente o buraco que ela existia para mostrar.
   */
  gaps: Gap[];
  mode: Mode;
  /** As marcas com o revisor desligado. */
  disabled: string[];
  /**
   * Quem responde e se existe chave. É a primeira pergunta de quem abre esta
   * tela quando algo não saiu — e ela não se responde olhando o parecer.
   */
  model: { provider: Provider; name: string; configured: boolean };
};

export async function loadRules(user: CurrentUser): Promise<RulesData> {
  const list = await db
    .select({ id: companies.id, name: companies.name, parentId: companies.parentId })
    .from(companies)
    .where(eq(companies.orgId, user.orgId))
    .orderBy(asc(companies.name));

  const byId = new Map(list.map((company) => [company.id, company.name]));

  const rules = await db
    .select()
    .from(reviewRules)
    .where(eq(reviewRules.orgId, user.orgId))
    .orderBy(asc(reviewRules.position), asc(reviewRules.code));

  const checklist = await db
    .select()
    .from(reviewChecklistItems)
    .where(eq(reviewChecklistItems.orgId, user.orgId))
    .orderBy(asc(reviewChecklistItems.position));

  const counts = { maquina: 0, pessoa: 0, fora: 0 };
  for (const rule of rules) {
    if (rule.isActive) counts[rule.verifier] += 1;
  }

  const [gaps, mode, disabled] = await Promise.all([
    findGaps(user.orgId, rules, checklist, byId),
    reviewMode(user.orgId),
    disabledCompanies(user.orgId),
  ]);

  return {
    gaps,
    mode,
    disabled,
    model: { provider: provider(), name: modelName(), configured: modelConfigured() },
    rules: rules.map((rule) => ({
      ...rule,
      companyName: rule.companyId ? (byId.get(rule.companyId) ?? null) : null,
    })),
    checklist: checklist.map((item) => ({
      ...item,
      companyName: item.companyId ? (byId.get(item.companyId) ?? null) : null,
    })),
    companies: list,
    counts,
  };
}

/**
 * As combinações empresa × tipo que o time entrega e para as quais o revisor
 * não tem o que conferir.
 *
 * Onde não há regra, o sistema **não** preenche com boa prática de mercado:
 * regra ruim aplicada em escala e com autoridade é pior que regra ausente. O
 * buraco fica escrito aqui e quem decide é a área de negócio.
 */
async function findGaps(
  orgId: string,
  rules: ReviewRule[],
  checklist: ReviewChecklistItem[],
  companyNames: Map<string, string>,
): Promise<Gap[]> {
  const combos = await db
    .select({
      companyId: workItems.companyId,
      skill: workItems.skill,
      items: sql<number>`count(*)::int`,
    })
    .from(workItems)
    .where(and(eq(workItems.orgId, orgId), isNotNull(workItems.skill)))
    .groupBy(workItems.companyId, workItems.skill);

  const parents = new Map(
    (
      await db
        .select({ id: companies.id, parentId: companies.parentId })
        .from(companies)
        .where(eq(companies.orgId, orgId))
    ).map((row) => [row.id, row.parentId]),
  );

  /** A empresa e a linha de mães dela: a regra da mãe alcança a sub-marca. */
  function chainOf(companyId: string): string[] {
    const chain: string[] = [];
    let current: string | null = companyId;
    for (let i = 0; current && i < 10; i++) {
      chain.push(current);
      current = parents.get(current) ?? null;
    }
    return chain;
  }

  const gaps: Gap[] = [];

  for (const combo of combos) {
    if (!combo.skill) continue;
    const chain = chainOf(combo.companyId);

    const covers = (scopeCompany: string | null, scopeSkill: string | null) =>
      (scopeCompany === null || chain.includes(scopeCompany)) &&
      (scopeSkill === null || scopeSkill === combo.skill);

    const hasMachine = rules.some(
      (rule) =>
        rule.isActive && rule.verifier === "maquina" && covers(rule.companyId, rule.skill),
    );

    if (hasMachine) continue;

    gaps.push({
      companyId: combo.companyId,
      companyName: companyNames.get(combo.companyId) ?? "—",
      skill: combo.skill,
      items: combo.items,
      hasChecklist: checklist.some(
        (item) => item.isActive && covers(item.companyId, item.skill),
      ),
    });
  }

  return gaps.sort((a, b) => b.items - a.items);
}
