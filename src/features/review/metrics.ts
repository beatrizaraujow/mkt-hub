import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  reviewChecklistAnswers,
  reviewChecklistItems,
  reviewCycles,
  reviewFindings,
  reviewRuns,
  workItems,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { addDays, brtToday, startOfBrtDay } from "@/lib/date";

/**
 * A medição.
 *
 * Uma tabela resolve — gráfico aqui só atrasaria a leitura. O número que
 * importa é a **taxa de reversão**: das reprovações da IA, quantas uma pessoa
 * derrubou. É ele que decide se a ferramenta fica, e é ele que ninguém olha
 * quando a medição não existe.
 *
 * O outro número que vale é a lista de regras que mais reprovam. Regra que
 * reprova quase tudo quase sempre está mal escrita — não é o time que está
 * errado.
 */

export type Metrics = {
  days: number;
  companyId: string | null;
  totals: {
    cycles: number;
    aprovado: number;
    ajustar: number;
    reprovado: number;
    incompleto: number;
    falhou: number;
    reused: number;
    escalated: number;
  };
  /** Quantas decisões humanas foram registradas, e quantas derrubaram o parecer. */
  reversal: { decided: number; overturned: number };
  topRules: Array<{ code: string; text: string; findings: number; items: number }>;
  probes: Array<{ text: string; checked: number; withFindings: number }>;
  cost: { tokensIn: number; tokensOut: number; runs: number; avgSeconds: number | null };
  failures: Array<{ error: string; count: number }>;
};

export async function loadMetrics(
  user: CurrentUser,
  options: { days: number; companyId: string | null },
): Promise<Metrics> {
  const since = startOfBrtDay(addDays(brtToday(), -options.days));

  const reach = options.companyId ? [options.companyId] : user.companyIds;

  const empty: Metrics = {
    days: options.days,
    companyId: options.companyId,
    totals: {
      cycles: 0,
      aprovado: 0,
      ajustar: 0,
      reprovado: 0,
      incompleto: 0,
      falhou: 0,
      reused: 0,
      escalated: 0,
    },
    reversal: { decided: 0, overturned: 0 },
    topRules: [],
    probes: [],
    cost: { tokensIn: 0, tokensOut: 0, runs: 0, avgSeconds: null },
    failures: [],
  };

  if (reach.length === 0) return empty;

  const cycles = await db
    .select({
      id: reviewCycles.id,
      status: reviewCycles.status,
      verdict: reviewCycles.verdict,
      humanVerdict: reviewCycles.humanVerdict,
      escalated: reviewCycles.escalated,
      reusedFromId: reviewCycles.reusedFromId,
      workItemId: reviewCycles.workItemId,
    })
    .from(reviewCycles)
    .innerJoin(workItems, eq(workItems.id, reviewCycles.workItemId))
    .where(
      and(
        eq(reviewCycles.orgId, user.orgId),
        gte(reviewCycles.createdAt, since),
        inArray(workItems.companyId, reach),
      ),
    );

  if (cycles.length === 0) return empty;

  const totals = { ...empty.totals, cycles: cycles.length };
  const reversal = { decided: 0, overturned: 0 };

  for (const cycle of cycles) {
    if (cycle.verdict === "aprovado") totals.aprovado += 1;
    if (cycle.verdict === "ajustar") totals.ajustar += 1;
    if (cycle.verdict === "reprovado") totals.reprovado += 1;
    if (cycle.status === "incompleto") totals.incompleto += 1;
    if (cycle.status === "falhou") totals.falhou += 1;
    if (cycle.reusedFromId) totals.reused += 1;
    if (cycle.escalated) totals.escalated += 1;

    /**
     * Só entra na conta o parecer que pediu trabalho: reversão é a pessoa
     * derrubando uma reprovação, não concordando com uma aprovação.
     */
    if (cycle.verdict && cycle.verdict !== "aprovado" && cycle.humanVerdict) {
      reversal.decided += 1;
      if (cycle.humanVerdict === "discordou") reversal.overturned += 1;
    }
  }

  const ids = cycles.map((cycle) => cycle.id);

  const [findings, runs, probes] = await Promise.all([
    db
      .select({
        code: reviewFindings.ruleCode,
        text: sql<string>`min(${reviewFindings.ruleText})`,
        findings: sql<number>`count(*)::int`,
        items: sql<number>`count(distinct ${reviewCycles.workItemId})::int`,
      })
      .from(reviewFindings)
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviewFindings.cycleId))
      .where(inArray(reviewFindings.cycleId, ids))
      .groupBy(reviewFindings.ruleCode)
      .orderBy(desc(sql`count(*)`))
      .limit(12),

    db
      .select({
        tokensIn: sql<number>`coalesce(sum(${reviewRuns.tokensIn}), 0)::int`,
        tokensOut: sql<number>`coalesce(sum(${reviewRuns.tokensOut}), 0)::int`,
        runs: sql<number>`count(*)::int`,
        avgSeconds: sql<
          number | null
        >`avg(extract(epoch from (${reviewRuns.finishedAt} - ${reviewRuns.startedAt})))`,
      })
      .from(reviewRuns)
      .where(and(inArray(reviewRuns.cycleId, ids), eq(reviewRuns.state, "concluida"))),

    probeDivergence(
      user.orgId,
      cycles.map((cycle) => cycle.workItemId),
    ),
  ]);

  const failures = await db
    .select({
      error: sql<string>`left(coalesce(${reviewRuns.error}, ''), 120)`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviewRuns)
    .where(and(inArray(reviewRuns.cycleId, ids), eq(reviewRuns.state, "falhou")))
    .groupBy(sql`left(coalesce(${reviewRuns.error}, ''), 120)`)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  return {
    days: options.days,
    companyId: options.companyId,
    totals,
    reversal,
    topRules: findings,
    probes,
    cost: {
      tokensIn: runs[0]?.tokensIn ?? 0,
      tokensOut: runs[0]?.tokensOut ?? 0,
      runs: runs[0]?.runs ?? 0,
      avgSeconds: runs[0]?.avgSeconds ? Math.round(Number(runs[0].avgSeconds)) : null,
    },
    failures,
  };
}

/**
 * Os medidores: itens que a pessoa marca e que a máquina também confere.
 *
 * Se alguém marcou "revisei a ortografia" e o revisor achou três problemas na
 * mesma entrega, isso não diz que o texto estava ruim — diz alguma coisa sobre
 * o processo. É o único jeito de saber se o checklist está sendo respondido ou
 * clicado.
 */
async function probeDivergence(orgId: string, workItemIds: string[]) {
  if (workItemIds.length === 0) return [];

  const rows = await db
    .select({
      text: reviewChecklistItems.text,
      ruleId: reviewChecklistItems.ruleId,
      itemId: reviewChecklistAnswers.workItemId,
    })
    .from(reviewChecklistAnswers)
    .innerJoin(
      reviewChecklistItems,
      eq(reviewChecklistItems.id, reviewChecklistAnswers.itemId),
    )
    .where(
      and(
        eq(reviewChecklistItems.orgId, orgId),
        eq(reviewChecklistItems.isReliabilityProbe, true),
        eq(reviewChecklistAnswers.checked, true),
        inArray(reviewChecklistAnswers.workItemId, workItemIds),
      ),
    );

  if (rows.length === 0) return [];

  const touched = rows.map((row) => row.itemId);

  /**
   * Quando o medidor aponta para uma regra, a comparação é com **aquela**
   * regra: dizer que houve divergência porque o robô achou outra coisa
   * qualquer inflaria o número e destruiria a utilidade dele.
   */
  const findings = await db
    .select({ workItemId: reviewCycles.workItemId, ruleId: reviewFindings.ruleId })
    .from(reviewFindings)
    .innerJoin(reviewCycles, eq(reviewCycles.id, reviewFindings.cycleId))
    .where(inArray(reviewCycles.workItemId, touched));

  const byText = new Map<string, { checked: number; withFindings: number }>();

  for (const row of rows) {
    const current = byText.get(row.text) ?? { checked: 0, withFindings: 0 };
    current.checked += 1;

    const diverged = findings.some(
      (finding) =>
        finding.workItemId === row.itemId &&
        (row.ruleId === null || finding.ruleId === row.ruleId),
    );

    if (diverged) current.withFindings += 1;
    byText.set(row.text, current);
  }

  return [...byText.entries()]
    .map(([text, counts]) => ({ text, ...counts }))
    .sort((a, b) => b.withFindings - a.withFindings);
}

/** As empresas que a pessoa alcança, para o filtro. */
export async function metricCompanies(user: CurrentUser) {
  if (user.companyIds.length === 0) return [];

  return db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.orgId, user.orgId), inArray(companies.id, user.companyIds)))
    .orderBy(companies.name);
}
