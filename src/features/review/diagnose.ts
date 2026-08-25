import "server-only";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  companies,
  projects,
  reviewChecklistItems,
  reviewCycles,
  reviewRuns,
  workItemStages,
  workItems,
  type ReviewChecklistItem,
  type ReviewRule,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { runGate, type GateResult } from "./gate";
import { rulesFor } from "./rules";

/**
 * O que o revisor entendeu de uma entrega real, **antes** de ele poder fazer
 * qualquer coisa.
 *
 * Serve para conferir o que nenhum teste unitário pega: se a regra da empresa
 * mãe alcança a sub-marca, se a regra sem tipo vale para todos, se o porteiro
 * está barrando pelo motivo certo. Enquanto as regras são carregadas, é aqui
 * que se descobre que o recorte ficou errado — não depois, num parecer
 * absurdo que já custou a confiança do time.
 */

export type ScopedRule = ReviewRule & { scopeLabel: string };

export type Diagnosis = {
  item: {
    id: string;
    title: string;
    companyId: string;
    companyName: string;
    projectName: string | null;
    stageName: string;
    skill: string | null;
    format: string | null;
    done: boolean;
  };
  files: Array<{ id: string; filename: string; kind: string; sizeBytes: number }>;
  gate: GateResult;
  rules: ScopedRule[];
  checklist: ReviewChecklistItem[];
  cycles: Array<{
    id: string;
    round: number;
    status: string;
    verdict: string | null;
    gateMissing: string[];
    createdAt: Date;
    attempts: number;
    lastError: string | null;
  }>;
};

/** Em que camada a regra entrou. É o que revela recorte errado de longe. */
function scopeLabel(rule: ReviewRule, companyNames: Map<string, string>) {
  const parts: string[] = [];
  parts.push(rule.companyId ? (companyNames.get(rule.companyId) ?? "empresa") : "todas as empresas");
  if (rule.skill) parts.push(rule.skill);
  if (rule.format) parts.push(rule.format);
  return parts.join(" · ");
}

export async function diagnose(user: CurrentUser, workItemId: string): Promise<Diagnosis | null> {
  const [row] = await db
    .select({
      id: workItems.id,
      title: workItems.title,
      orgId: workItems.orgId,
      companyId: workItems.companyId,
      companyName: companies.name,
      projectName: projects.name,
      stageName: workItemStages.name,
      skill: workItems.skill,
      format: workItems.format,
      completedAt: workItems.completedAt,
    })
    .from(workItems)
    .innerJoin(companies, eq(companies.id, workItems.companyId))
    .innerJoin(workItemStages, eq(workItemStages.id, workItems.stageId))
    .leftJoin(projects, eq(projects.id, workItems.projectId))
    .where(eq(workItems.id, workItemId))
    .limit(1);

  if (!row || !user.companyIds.includes(row.companyId)) return null;

  const [files, rules, checklist, cycles] = await Promise.all([
    db
      .select({
        id: attachments.id,
        filename: attachments.filename,
        kind: attachments.kind,
        sizeBytes: attachments.sizeBytes,
      })
      .from(attachments)
      .where(eq(attachments.workItemId, row.id))
      .orderBy(asc(attachments.createdAt)),

    rulesFor({
      orgId: row.orgId,
      companyId: row.companyId,
      skill: row.skill,
      format: row.format,
    }),

    db
      .select()
      .from(reviewChecklistItems)
      .where(
        and(
          eq(reviewChecklistItems.orgId, row.orgId),
          eq(reviewChecklistItems.isActive, true),
          or(
            isNull(reviewChecklistItems.companyId),
            eq(reviewChecklistItems.companyId, row.companyId),
          ),
          or(
            isNull(reviewChecklistItems.skill),
            row.skill ? eq(reviewChecklistItems.skill, row.skill) : undefined,
          ),
        ),
      )
      .orderBy(asc(reviewChecklistItems.position)),

    db
      .select()
      .from(reviewCycles)
      .where(eq(reviewCycles.workItemId, row.id))
      .orderBy(desc(reviewCycles.round)),
  ]);

  // O porteiro roda de verdade: a tela mostra o que o cron veria, não uma
  // simulação parecida que diverge com o tempo.
  const gate = await runGate(row.id);

  const companyNames = new Map(
    (
      await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.orgId, row.orgId))
    ).map((c) => [c.id, c.name]),
  );

  const runs = cycles.length
    ? await db
        .select()
        .from(reviewRuns)
        .where(
          inArray(
            reviewRuns.cycleId,
            cycles.map((c) => c.id),
          ),
        )
        .orderBy(desc(reviewRuns.attempt))
    : [];

  return {
    item: {
      id: row.id,
      title: row.title,
      companyId: row.companyId,
      companyName: row.companyName,
      projectName: row.projectName,
      stageName: row.stageName,
      skill: row.skill,
      format: row.format,
      done: Boolean(row.completedAt),
    },
    files,
    gate,
    rules: rules.map((rule) => ({ ...rule, scopeLabel: scopeLabel(rule, companyNames) })),
    checklist,
    cycles: cycles.map((cycle) => {
      const own = runs.filter((run) => run.cycleId === cycle.id);
      return {
        id: cycle.id,
        round: cycle.round,
        status: cycle.status,
        verdict: cycle.verdict,
        gateMissing: cycle.gateMissing,
        createdAt: cycle.createdAt,
        attempts: own.length,
        lastError: own.find((run) => run.error)?.error ?? null,
      };
    }),
  };
}

/** Candidatos para apontar o revisor. Os mais recentes bastam. */
export async function diagnosableItems(user: CurrentUser) {
  if (!user.companyIds.length) return [];

  return db
    .select({
      id: workItems.id,
      title: workItems.title,
      companyName: companies.name,
      skill: workItems.skill,
    })
    .from(workItems)
    .innerJoin(companies, eq(companies.id, workItems.companyId))
    .where(
      and(eq(workItems.orgId, user.orgId), inArray(workItems.companyId, user.companyIds)),
    )
    .orderBy(desc(workItems.updatedAt))
    .limit(40);
}
