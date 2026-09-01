import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  companies,
  projects,
  reviewCycles,
  reviewFindings,
  reviewRuns,
  workItemStages,
  workItems,
  type ReviewChecklistItem,
  type ReviewRule,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { checklistFor } from "./checklist";
import { runGate, type GateResult } from "./gate";
import { assemble } from "./judge";
import { applicableRules } from "./rules";
import type { Overlap } from "./resolve";

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
    /** O texto entregue: e a unica entrada desta versao do revisor. */
    copy: string | null;
  };
  files: Array<{ id: string; filename: string; kind: string; sizeBytes: number }>;
  gate: GateResult;
  rules: ScopedRule[];
  /** Onde uma camada substituiu a outra, e onde a substituicao nao foi aceita. */
  overlaps: Overlap[];
  /**
   * O pedido exato que iria para o modelo, montado pela mesma funcao que o
   * julgamento usa. Nao e simulacao parecida: divergiriam com o tempo.
   */
  prompt: { system: string; briefing: string } | { error: string };
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
    model: string | null;
    /** Os códigos que este parecer conferiu, congelados. */
    applied: string[];
    /** O que se aplicava e não deu para conferir. Fica na tela de propósito. */
    notVerified: Array<{ code: string; reason: string }>;
    findings: Array<{
      id: string;
      ruleCode: string;
      ruleText: string;
      detail: string;
      isBlocking: boolean;
      file: string | null;
      excerpt: string | null;
    }>;
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

  const [files, applicable, checklist, cycles] = await Promise.all([
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

    applicableRules({
      orgId: row.orgId,
      companyId: row.companyId,
      skill: row.skill,
      format: row.format,
    }),

    /*
      O diagnóstico é sobre a Revisão IA, e o checklist que anda junto dela é o
      do operacional: é o que quem produz responde antes de a peça entrar na
      esteira. O da aprovação é de outra etapa e de outra pessoa.
     */
    checklistFor(
      { orgId: row.orgId, companyId: row.companyId, skill: row.skill, format: row.format },
      "operacional",
    ),

    db
      .select()
      .from(reviewCycles)
      .where(eq(reviewCycles.workItemId, row.id))
      .orderBy(desc(reviewCycles.round)),
  ]);

  const { rules, overlaps } = applicable;

  // O porteiro roda de verdade: a tela mostra o que o cron veria, não uma
  // simulação parecida que diverge com o tempo.
  const gate = await runGate(row.id);

  /**
   * O pedido montado, sem chamar ninguém. Ver o texto exato que vai para o
   * modelo paga o custo desta tela na primeira semana: recorte errado e regra
   * mal escrita aparecem aqui, antes de virarem parecer absurdo.
   */
  const [full] = await db.select().from(workItems).where(eq(workItems.id, row.id)).limit(1);
  const assembled = full ? await assemble(full, row.companyName) : { error: "Entrega sumiu." };
  const prompt =
    "error" in assembled
      ? { error: assembled.error }
      : { system: assembled.system, briefing: assembled.briefing };

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

  /**
   * Os achados vêm junto: um parecer sem o problema escrito ao lado da regra
   * que o originou é opinião de robô, e opinião de robô não se contesta.
   */
  const findings = cycles.length
    ? await db
        .select()
        .from(reviewFindings)
        .where(
          inArray(
            reviewFindings.cycleId,
            cycles.map((c) => c.id),
          ),
        )
        .orderBy(desc(reviewFindings.isBlocking), asc(reviewFindings.createdAt))
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
      copy: full?.copy ?? null,
    },
    files,
    gate,
    overlaps,
    prompt,
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
        model: own.find((run) => run.model)?.model ?? null,
        applied: cycle.appliedRules,
        notVerified: cycle.notVerified,
        findings: findings
          .filter((finding) => finding.cycleId === cycle.id)
          .map((finding) => ({
            id: finding.id,
            ruleCode: finding.ruleCode,
            ruleText: finding.ruleText,
            detail: finding.detail,
            isBlocking: finding.isBlocking,
            file: (finding.evidence.arquivo as string | null) ?? null,
            excerpt: (finding.evidence.trecho as string | null) ?? null,
          })),
      };
    }),
  };
}

/*
 * `diagnosableItems` morreu aqui em 31/08/2026: eram as 40 tarefas mais
 * recentes para encher um `<select>`. Quem escolhe entrega agora passa por
 * `pick.ts`, que busca por texto e filtra por empresa, etapa e dono.
 */
