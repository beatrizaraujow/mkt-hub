import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
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

/**
 * O resumo de uma rodada, para a faixa de histórico.
 *
 * Sem ela o parecer só sabe falar do presente, e "reprovado" pela terceira vez
 * lê igual a "reprovado" pela primeira — quando a diferença entre as duas é
 * exatamente o que decide se o problema é a peça ou a regra.
 */
export type ReviewRound = {
  id: string;
  round: number;
  status: string;
  verdict: string | null;
  /** Os códigos que reprovaram naquela rodada. */
  codes: string[];
  createdAt: Date;
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
    /** Quem respondeu. Parecer sem autor não se audita. */
    model: string | null;
  } | null;
  /** Todas as rodadas desta entrega, da primeira para a última. */
  rounds: ReviewRound[];
  findings: ReviewFindingLine[];
  language: Array<{ trecho: string; correcao: string; tipo: string }>;
  applied: string[];
  notVerified: Array<{ code: string; reason: string }>;
  overlaps: Array<{ winner: string; loser: string; applied: boolean; why: string }>;
  /** As regras que continuam sendo responsabilidade de gente. */
  notChecked: Array<{ code: string; text: string; who: "pessoa" | "fora" }>;
  /**
   * Os dois checklists, separados porque são de etapas e de pessoas diferentes.
   *
   * O do operacional é por marca e por formato, quem produz responde, e trava a
   * saída da Pré revisão. O da aprovação são os seis itens sobre a peça ser a
   * peça certa, quem lidera responde, e trava a saída da Aprovação. Mandar os
   * dois numa lista só devolveria o problema que existia até 01/09/2026.
   */
  checklist: ChecklistLine[];
  checklistAprovacao: ChecklistLine[];
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

  const todas = await db
    .select()
    .from(reviewCycles)
    .where(eq(reviewCycles.workItemId, item.id))
    .orderBy(asc(reviewCycles.round));

  const cycle = todas.at(-1);

  const [checklist, checklistAprovacao] = await Promise.all([
    checklistOf(item, "operacional"),
    checklistOf(item, "aprovacao"),
  ]);

  if (!cycle) {
    return {
      enabled: !off.includes(item.companyId),
      cycle: null,
      rounds: [],
      findings: [],
      language: [],
      applied: [],
      notVerified: [],
      overlaps: [],
      notChecked,
      checklist,
      checklistAprovacao,
    };
  }

  const [findings, runs, todosAchados] = await Promise.all([
    db.select().from(reviewFindings).where(eq(reviewFindings.cycleId, cycle.id)),
    db
      .select()
      .from(reviewRuns)
      .where(eq(reviewRuns.cycleId, cycle.id))
      .orderBy(desc(reviewRuns.attempt)),
    db
      .select({ cycleId: reviewFindings.cycleId, ruleCode: reviewFindings.ruleCode })
      .from(reviewFindings)
      .where(
        inArray(
          reviewFindings.cycleId,
          todas.map((row) => row.id),
        ),
      ),
  ]);

  return {
    enabled: !off.includes(item.companyId),
    rounds: todas.map((row) => ({
      id: row.id,
      round: row.round,
      status: row.status,
      verdict: row.verdict,
      codes: [
        ...new Set(
          todosAchados.filter((a) => a.cycleId === row.id).map((a) => a.ruleCode),
        ),
      ],
      createdAt: row.createdAt,
    })),
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
      model: runs.find((run) => run.model)?.model ?? null,
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
    checklistAprovacao,
  };
}
