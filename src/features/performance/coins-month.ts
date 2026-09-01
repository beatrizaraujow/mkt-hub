import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { coinLedger, users, weekSnapshots } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { monthBounds, monthOf } from "@/lib/month";

/**
 * As coins de cada um no mes.
 *
 * **Soma o extrato; nao recalcula nada.** A coin nasce no fechamento semanal,
 * validada por uma pessoa, e vira linha no `coin_ledger`. Aqui e leitura pura.
 *
 * Isso e a licao mais cara do MKT Hub 1: la existiam duas implementacoes da
 * mesma regra, em arquivos diferentes, as duas gravando na mesma tabela — e
 * abrir a tela de Historico regravava por cima do que a admin tinha validado.
 * Quem gravou por ultimo vencia. Uma tela mensal que apurasse de novo repetiria
 * o erro com outro nome.
 *
 * **A que mes pertence uma semana.** Ao mes em que ela **comeca**, e nao ao dia
 * em que alguem fechou. Fechar com atraso nao pode mover coin de um mes para o
 * outro — o numero de agosto mudaria em setembro. A semana de 31/08 a 06/09
 * conta inteira em agosto; dividir por dia seria inventar uma precisao que a
 * coin nao tem, porque ela e semanal.
 *
 * Gasto e ajuste nao tem semana. Esses caem no mes em que foram lancados, que e
 * a unica data que eles tem.
 */

export type LinhaDoMes = {
  pessoaId: string;
  nome: string;
  /** Creditado por fechamento de semana. */
  semanal: number;
  /** Ajustes e gastos lancados no mes. Pode ser negativo. */
  outros: number;
  total: number;
  /** As semanas que compoem o `semanal`, da mais antiga para a mais nova. */
  semanas: Array<{ weekId: string; coins: number }>;
};

export type CoinsDoMes = {
  mes: string;
  linhas: LinhaDoMes[];
  total: number;
  /** Saldo acumulado de cada um, de todo o extrato. Nao so do mes. */
  saldo: Map<string, number>;
};

export async function coinsDoMes(user: CurrentUser, mes: string): Promise<CoinsDoMes> {
  const { from, to } = monthBounds(mes);

  /*
   * As semanas que comecam dentro do mes. E daqui que sai o vinculo entre
   * `weekId` e mes — o extrato guarda o `weekId`, nao a data da semana.
   */
  const semanas = await db
    .select({ weekId: weekSnapshots.weekId, inicio: weekSnapshots.weekStart })
    .from(weekSnapshots)
    .where(
      and(
        eq(weekSnapshots.orgId, user.orgId),
        gte(weekSnapshots.weekStart, from),
        lte(weekSnapshots.weekStart, to),
      ),
    )
    .orderBy(asc(weekSnapshots.weekStart));

  const idsDasSemanas = semanas.map((semana) => semana.weekId);

  const [pessoas, linhas, saldos] = await Promise.all([
    db
      .select({ id: users.id, nome: users.name })
      .from(users)
      .where(and(eq(users.orgId, user.orgId), eq(users.isActive, true)))
      .orderBy(asc(users.name)),

    db
      .select({
        userId: coinLedger.userId,
        weekId: coinLedger.weekId,
        amount: coinLedger.amount,
        createdAt: coinLedger.createdAt,
      })
      .from(coinLedger)
      .where(eq(coinLedger.orgId, user.orgId)),

    db
      .select({ userId: coinLedger.userId, saldo: sql<number>`sum(${coinLedger.amount})::int` })
      .from(coinLedger)
      .where(eq(coinLedger.orgId, user.orgId))
      .groupBy(coinLedger.userId),
  ]);

  const noMes = new Set(idsDasSemanas);

  const porPessoa = new Map<string, LinhaDoMes>(
    pessoas.map((pessoa) => [
      pessoa.id,
      { pessoaId: pessoa.id, nome: pessoa.nome, semanal: 0, outros: 0, total: 0, semanas: [] },
    ]),
  );

  const semanaisPorPessoa = new Map<string, Map<string, number>>();

  for (const linha of linhas) {
    const alvo = porPessoa.get(linha.userId);
    // Pessoa desativada depois de receber coin: o extrato dela nao entra na
    // lista, mas o saldo continua existindo no banco. Ver a nota da tela.
    if (!alvo) continue;

    if (linha.weekId) {
      if (!noMes.has(linha.weekId)) continue;
      alvo.semanal += linha.amount;

      const dela = semanaisPorPessoa.get(linha.userId) ?? new Map<string, number>();
      dela.set(linha.weekId, (dela.get(linha.weekId) ?? 0) + linha.amount);
      semanaisPorPessoa.set(linha.userId, dela);
      continue;
    }

    /*
     * `createdAt` e `timestamptz`; o mes tem de sair do dia em BRT, nao do dia
     * em UTC. Um ajuste lancado as 22h de 31/08 e 01/09 em UTC, e cairia no mes
     * errado se a conta fosse feita no fuso do servidor.
     */
    const diaBrt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(linha.createdAt);

    if (monthOf(diaBrt) === mes) alvo.outros += linha.amount;
  }

  for (const [pessoaId, dela] of semanaisPorPessoa) {
    const alvo = porPessoa.get(pessoaId);
    if (!alvo) continue;
    alvo.semanas = idsDasSemanas
      .filter((weekId) => dela.has(weekId))
      .map((weekId) => ({ weekId, coins: dela.get(weekId) ?? 0 }));
  }

  const resultado = [...porPessoa.values()];
  for (const linha of resultado) linha.total = linha.semanal + linha.outros;

  return {
    mes,
    linhas: resultado,
    total: resultado.reduce((soma, linha) => soma + linha.total, 0),
    saldo: new Map(saldos.map((linha) => [linha.userId, linha.saldo])),
  };
}

/** As semanas do mes, para o cabecalho dizer quantas entraram na conta. */
export async function semanasDoMes(user: CurrentUser, mes: string): Promise<string[]> {
  const { from, to } = monthBounds(mes);

  const linhas = await db
    .select({ weekId: weekSnapshots.weekId })
    .from(weekSnapshots)
    .where(
      and(
        eq(weekSnapshots.orgId, user.orgId),
        eq(weekSnapshots.status, "fechado"),
        gte(weekSnapshots.weekStart, from),
        lte(weekSnapshots.weekStart, to),
      ),
    )
    .orderBy(asc(weekSnapshots.weekStart));

  return linhas.map((linha) => linha.weekId);
}
