import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewCycles, reviewFindings, reviewRuns, type WorkItem } from "@/db/schema";
import { checklistOf, type ChecklistLine } from "./checklist";
import { applicableRules, humanRules, outOfScopeRules } from "./rules";
import { disabledCompanies } from "./settings";

/**
 * O que a tela da entrega mostra sobre a revisão.
 *
 * Inclui, de propósito, o que o robô **não** confere. Quando um sistema desses
 * entra no ar, todo mundo assume que ele cuida de tudo, e as regras que
 * continuaram humanas param de ser conferidas por qualquer um — cada lado
 * achando que o outro está olhando. Isso precisa estar na tela, não numa
 * documentação que ninguém abre.
 */

export type ReviewFindingLine = {
  id: string;
  ruleCode: string;
  ruleText: string;
  detail: string;
  excerpt: string | null;
  suggestion: string | null;
  isBlocking: boolean;
};

export type ReviewPanel = {
  enabled: boolean;
  cycle: {
    id: string;
    round: number;
    status: string;
    verdict: string | null;
    gateMissing: string[];
    isSilent: boolean;
    escalated: boolean;
    reused: boolean;
    createdAt: Date;
    finishedAt: Date | null;
    attempts: number;
    lastError: string | null;
  } | null;
  findings: ReviewFindingLine[];
  language: Array<{ trecho: string; correcao: string; tipo: string }>;
  applied: string[];
  notVerified: Array<{ code: string; reason: string }>;
  overlaps: Array<{ winner: string; loser: string; applied: boolean; why: string }>;
  /** As regras que continuam sendo responsabilidade de gente. */
  notChecked: Array<{ code: string; text: string; who: "pessoa" | "fora" }>;
  checklist: ChecklistLine[];
};

export async function reviewPanelFor(item: WorkItem | undefined): Promise<ReviewPanel | null> {
  if (!item) return null;

  const off = await disabledCompanies(item.orgId);
  const { rules } = await applicableRules({
    orgId: item.orgId,
    companyId: item.companyId,
    skill: item.skill,
    format: item.format,
  });

  const notChecked = [
    ...humanRules(rules).map((rule) => ({ code: rule.code, text: rule.text, who: "pessoa" as const })),
    ...outOfScopeRules(rules).map((rule) => ({ code: rule.code, text: rule.text, who: "fora" as const })),
  ];

  const [cycle] = await db
    .select()
    .from(reviewCycles)
    .where(eq(reviewCycles.workItemId, item.id))
    .orderBy(desc(reviewCycles.round))
    .limit(1);

  const checklist = await checklistOf(item);

  if (!cycle) {
    return {
      enabled: !off.includes(item.companyId),
      cycle: null,
      findings: [],
      language: [],
      applied: [],
      notVerified: [],
      overlaps: [],
      notChecked,
      checklist,
    };
  }

  const [findings, runs] = await Promise.all([
    db.select().from(reviewFindings).where(eq(reviewFindings.cycleId, cycle.id)),
    db
      .select()
      .from(reviewRuns)
      .where(eq(reviewRuns.cycleId, cycle.id))
      .orderBy(desc(reviewRuns.attempt)),
  ]);

  return {
    enabled: !off.includes(item.companyId),
    cycle: {
      id: cycle.id,
      round: cycle.round,
      status: cycle.status,
      verdict: cycle.verdict,
      gateMissing: cycle.gateMissing,
      isSilent: cycle.isSilent,
      escalated: cycle.escalated,
      reused: cycle.reusedFromId !== null,
      createdAt: cycle.createdAt,
      finishedAt: cycle.finishedAt,
      attempts: runs.length,
      lastError: runs.find((run) => run.error)?.error ?? null,
    },
    findings: findings.map((row) => ({
      id: row.id,
      ruleCode: row.ruleCode,
      ruleText: row.ruleText,
      detail: row.detail,
      excerpt: (row.evidence?.trecho as string | undefined) ?? null,
      suggestion: (row.evidence?.sugestao as string | undefined) ?? null,
      isBlocking: row.isBlocking,
    })),
    language: cycle.languageNotes,
    applied: cycle.appliedRules,
    notVerified: cycle.notVerified,
    overlaps: cycle.overlaps,
    notChecked,
    checklist,
  };
}
