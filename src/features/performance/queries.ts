import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  coinLedger,
  companies,
  performanceGoals,
  routineOccurrences,
  routines,
  snapshotEntries,
  users,
  weekSnapshots,
  workItemStages,
  workItems,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { diaDe, semanaDe, type Semana } from "@/lib/week";
import { pontuar, ETAPAS_QUE_PONTUAM } from "./score";
import { montarFechamento, type Bruto, type Entrada, type Regua } from "./snapshot";

/**
 * O que a tela de Desempenho precisa saber.
 *
 * A semana **corrente** e calculada ao vivo, a cada abertura. A semana
 * **fechada** vem do snapshot e nunca e recalculada — se recalculasse, o
 * passado mudaria toda vez que alguem mexesse numa tarefa antiga, que e
 * exatamente o que o fechamento existe para impedir.
 */

/** O dia BRT em que a entrega foi concluida. Convertido no banco, nao no JS. */
const DIA_BRT = sql<string>`(${workItems.completedAt} at time zone 'America/Sao_Paulo')::date::text`;

export async function reguasDaOrg(user: CurrentUser): Promise<Regua[]> {
  const linhas = await db
    .select({
      pessoaId: performanceGoals.userId,
      nome: users.name,
      cargo: users.jobTitle,
      rule: performanceGoals.rule,
      meta: performanceGoals.weeklyTarget,
      meta120: performanceGoals.weeklyTarget120,
      coinsAos100: performanceGoals.coinsAt100,
      coinsAos120: performanceGoals.coinsAt120,
    })
    .from(performanceGoals)
    .innerJoin(users, eq(users.id, performanceGoals.userId))
    .where(
      and(
        eq(performanceGoals.orgId, user.orgId),
        eq(performanceGoals.isActive, true),
        eq(users.isActive, true),
      ),
    )
    .orderBy(asc(users.name));

  return linhas;
}

/** O que aconteceu na semana, das duas reguas, ainda sem virar fechamento. */
export async function brutosDaSemana(user: CurrentUser, semana: Semana): Promise<Bruto[]> {
  const [entregas, rotinas] = await Promise.all([
    db
      .select({
        id: workItems.id,
        pessoaId: workItems.assigneeId,
        pontos: workItems.points,
        etapa: workItemStages.slug,
        concluidaEm: DIA_BRT,
      })
      .from(workItems)
      .innerJoin(workItemStages, eq(workItemStages.id, workItems.stageId))
      .where(
        and(
          eq(workItems.orgId, user.orgId),
          isNotNull(workItems.completedAt),
          gte(DIA_BRT, semana.inicio),
          lte(DIA_BRT, semana.fim),
        ),
      ),

    db
      .select({
        pessoaId: routines.assigneeId,
        dia: routineOccurrences.day,
        publicada: sql<boolean>`${routineOccurrences.publishedAt} is not null`,
      })
      .from(routineOccurrences)
      .innerJoin(routines, eq(routines.id, routineOccurrences.routineId))
      .where(
        and(
          eq(routines.orgId, user.orgId),
          gte(routineOccurrences.day, semana.inicio),
          lte(routineOccurrences.day, semana.fim),
        ),
      ),
  ]);

  const pontuacao = pontuar(entregas, semana, ETAPAS_QUE_PONTUAM);
  const porPessoa = new Map<string, Bruto>();

  const balde = (pessoaId: string) => {
    const atual = porPessoa.get(pessoaId);
    if (atual) return atual;
    const novo: Bruto = {
      pessoaId,
      pontos: 0,
      entregas: 0,
      semPonto: 0,
      rotinasFeitas: 0,
      rotinasCobradas: 0,
    };
    porPessoa.set(pessoaId, novo);
    return novo;
  };

  for (const linha of pontuacao.linhas) {
    const b = balde(linha.pessoaId);
    b.pontos = linha.pontos;
    b.entregas = linha.entregas;
    b.semPonto = linha.semPonto;
  }

  /**
   * O denominador da regua de rotinas e o que **venceu**: publicadas mais
   * vencidas e nao publicadas. A mesma conta que a grade pinta, para o numero
   * do fechamento nunca discordar dos quadradinhos.
   */
  const hoje = semana.fim;
  for (const oc of rotinas) {
    if (!oc.pessoaId) continue;
    const b = balde(oc.pessoaId);
    if (oc.publicada) {
      b.rotinasFeitas++;
      b.rotinasCobradas++;
    } else if (oc.dia < hoje) {
      b.rotinasCobradas++;
    }
  }

  return [...porPessoa.values()];
}

export type SemanaNaTela = {
  semana: Semana;
  entradas: Entrada[];
  /** `null` enquanto a semana nunca foi calculada. */
  fechamento: { id: string; status: "pendente" | "fechado"; fechadoEm: Date | null; fechadoPor: string | null } | null;
  /** Coins ja validadas por pessoa, quando existe fechamento. */
  validadas: Map<string, number | null>;
  /**
   * O motivo de cada correcao de coin, por pessoa.
   *
   * Vive separado de `validadas` porque responde outra pergunta: aquele diz
   * quanto ficou, este diz por que. Sem o porque, uma semana como a do corte —
   * feriado no meio, teto real de 80% — vira numero estranho que ninguem
   * explica seis meses depois.
   */
  motivos: Map<string, string>;
};

export async function semanaNaTela(user: CurrentUser, ymd: string): Promise<SemanaNaTela> {
  const semana = semanaDe(ymd);

  const [snapshot] = await db
    .select({
      id: weekSnapshots.id,
      status: weekSnapshots.status,
      fechadoEm: weekSnapshots.closedAt,
      fechadoPor: users.name,
    })
    .from(weekSnapshots)
    .leftJoin(users, eq(users.id, weekSnapshots.closedById))
    .where(and(eq(weekSnapshots.orgId, user.orgId), eq(weekSnapshots.weekId, semana.id)))
    .limit(1);

  // Semana fechada nao recalcula: ela conta a historia de quando fechou.
  if (snapshot && snapshot.status === "fechado") {
    const linhas = await db
      .select()
      .from(snapshotEntries)
      .where(eq(snapshotEntries.snapshotId, snapshot.id))
      .orderBy(asc(snapshotEntries.name));

    return {
      semana,
      entradas: linhas.map((linha) => ({
        pessoaId: linha.userId,
        nome: linha.name,
        cargo: linha.jobTitle,
        rule: linha.rule,
        pontos: linha.points,
        entregas: linha.deliveries,
        semPonto: linha.withoutPoints,
        rotinasFeitas: linha.routinesDone,
        rotinasCobradas: linha.routinesDue,
        meta: linha.weeklyTarget,
        meta120: linha.weeklyTarget120,
        percentual: linha.percent,
        posicao: linha.position,
        coinsSugeridas: linha.coinsSuggested,
        coinsDaMeta: null,
        coinsDoPodio: null,
        coinsAos100: null,
        coinsAos120: null,
      })),
      fechamento: snapshot,
      validadas: new Map(linhas.map((linha) => [linha.userId, linha.coinsValidated])),
      motivos: new Map(linhas.filter((l) => l.note).map((l) => [l.userId, l.note])),
    };
  }

  const [reguas, brutos] = await Promise.all([
    reguasDaOrg(user),
    brutosDaSemana(user, semana),
  ]);

  const validadas = new Map<string, number | null>();
  const motivos = new Map<string, string>();
  if (snapshot) {
    const linhas = await db
      .select({
        userId: snapshotEntries.userId,
        coins: snapshotEntries.coinsValidated,
        note: snapshotEntries.note,
      })
      .from(snapshotEntries)
      .where(eq(snapshotEntries.snapshotId, snapshot.id));
    for (const linha of linhas) {
      validadas.set(linha.userId, linha.coins);
      if (linha.note) motivos.set(linha.userId, linha.note);
    }
  }

  return {
    semana,
    entradas: montarFechamento(reguas, brutos),
    fechamento: snapshot ?? null,
    validadas,
    motivos,
  };
}

/** Saldo de coins: a soma do extrato, nunca um numero guardado. */
export async function saldoDeCoins(user: CurrentUser): Promise<Map<string, number>> {
  const linhas = await db
    .select({ userId: coinLedger.userId, saldo: sql<number>`sum(${coinLedger.amount})::int` })
    .from(coinLedger)
    .where(eq(coinLedger.orgId, user.orgId))
    .groupBy(coinLedger.userId);

  return new Map(linhas.map((linha) => [linha.userId, linha.saldo]));
}

/** As empresas que a pessoa enxerga, para a tela nao prometer o que nao mostra. */
export async function temAlgumaEmpresa(user: CurrentUser): Promise<boolean> {
  if (!user.companyIds.length) return false;
  const [linha] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(inArray(companies.id, user.companyIds))
    .limit(1);
  return Boolean(linha);
}

/* ------------------------------------------------------------- placar do dia */

export type MeuDia = {
  /** Pontos concluidos hoje, nas mesmas etapas que contam na semana. */
  pontos: number;
  /** Meta do dia. `null` desliga o placar para esta pessoa. */
  meta: number | null;
  /** Entregas concluidas hoje sem Ponto MKT. O buraco, contado. */
  semPonto: number;
};

/**
 * O placar do dia de quem esta olhando.
 *
 * Reusa `brutosDaSemana` com um intervalo de um dia so — o dia e uma semana de
 * um dia. Nao existe uma segunda conta de pontos no sistema, entao nao existe
 * o dia em que as duas discordam.
 *
 * **So a parcela de pontos.** O sistema antigo compunha a nota do dia com mais
 * duas: tarefas concluidas sobre o total, e horas sobre dezesseis. As duas sao
 * gamificacao por volume — a de horas se burla deixando o cronometro ligado, e
 * a de tarefas se burla fatiando o trabalho em cartoes pequenos. A regra da
 * casa e explicita sobre isso, entao elas nao atravessaram.
 */
export async function meuDia(user: CurrentUser, ymd: string): Promise<MeuDia | null> {
  const [linha] = await db
    .select({ meta: performanceGoals.dailyTarget, rule: performanceGoals.rule })
    .from(performanceGoals)
    .where(
      and(
        eq(performanceGoals.userId, user.id),
        eq(performanceGoals.orgId, user.orgId),
        eq(performanceGoals.isActive, true),
      ),
    )
    .limit(1);

  // Sem regua, ou com regua de rotinas: o placar de pontos nao diz nada.
  if (!linha || linha.rule !== "pontos") return null;

  const brutos = await brutosDaSemana(user, diaDe(ymd));
  const meu = brutos.find((b) => b.pessoaId === user.id);

  return {
    pontos: meu?.pontos ?? 0,
    meta: linha.meta,
    semPonto: meu?.semPonto ?? 0,
  };
}
