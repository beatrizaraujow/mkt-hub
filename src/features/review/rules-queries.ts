import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  reviewChecklistItems,
  reviewRules,
  type ReviewChecklistItem,
  type ReviewRule,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";

export type CompanyOption = { id: string; name: string; parentId: string | null };

export type RuleRow = ReviewRule & { companyName: string | null };
export type ChecklistRow = ReviewChecklistItem & { companyName: string | null };

export type RulesData = {
  rules: RuleRow[];
  checklist: ChecklistRow[];
  companies: CompanyOption[];
  /** Quantas de cada balde. É o número que diz se a classificação avançou. */
  counts: { maquina: number; pessoa: number; fora: number };
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

  return {
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
