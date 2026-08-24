import "server-only";
import { cache } from "react";
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, timeEntries, users, workItems } from "@/db/schema";
import { brtToday, endOfBrtDay, startOfBrtDay } from "@/lib/date";

/**
 * Fecha timer que atravessou a virada do dia.
 *
 * Achado A5: todo controle de horas acaba gerando um registro de nove horas
 * em cima de uma tarefa de vinte minutos, porque alguem esqueceu de parar.
 * O corte acontece no fim do dia em que comecou, e o registro fica marcado
 * como `autoClosed` — a pessoa confirma ou ajusta no dia seguinte.
 *
 * E preguicoso de proposito: roda na leitura, sem cron e sem worker.
 */
export const closeStaleTimers = cache(async (userId: string) => {
  const startToday = startOfBrtDay(brtToday());

  const stale = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        isNull(timeEntries.endedAt),
        lt(timeEntries.startedAt, startToday),
      ),
    );

  for (const entry of stale) {
    const cut = endOfBrtDay(brtToday(entry.startedAt));
    const seconds = Math.max(0, Math.round((cut.getTime() - entry.startedAt.getTime()) / 1000));

    await db
      .update(timeEntries)
      .set({ endedAt: cut, durationSeconds: seconds, autoClosed: true })
      .where(eq(timeEntries.id, entry.id));
  }

  return stale.length;
});

export type RunningTimer = {
  id: string;
  startedAt: Date;
  workItemId: string | null;
  title: string | null;
  companyName: string | null;
};

/** O timer que está rodando agora. No máximo um por pessoa, garantido no banco. */
export const runningTimer = cache(async (userId: string): Promise<RunningTimer | null> => {
  await closeStaleTimers(userId);

  const [row] = await db
    .select({
      id: timeEntries.id,
      startedAt: timeEntries.startedAt,
      workItemId: timeEntries.workItemId,
      title: workItems.title,
      companyName: companies.name,
    })
    .from(timeEntries)
    .leftJoin(workItems, eq(workItems.id, timeEntries.workItemId))
    .leftJoin(companies, eq(companies.id, timeEntries.companyId))
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
    .limit(1);

  return row ?? null;
});

/** Registros fechados pelo corte automático e ainda não confirmados. */
export async function unconfirmedEntries(userId: string) {
  return db
    .select({
      id: timeEntries.id,
      startedAt: timeEntries.startedAt,
      durationSeconds: timeEntries.durationSeconds,
      title: workItems.title,
    })
    .from(timeEntries)
    .leftJoin(workItems, eq(workItems.id, timeEntries.workItemId))
    .where(
      and(
        eq(timeEntries.userId, userId),
        eq(timeEntries.autoClosed, true),
        isNull(timeEntries.confirmedAt),
      ),
    )
    .orderBy(desc(timeEntries.startedAt))
    .limit(5);
}

/** Total já registrado numa tarefa, por todo mundo, em segundos. */
export async function secondsOnItem(workItemId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(
        coalesce(${timeEntries.durationSeconds},
                 extract(epoch from (now() - ${timeEntries.startedAt}))::int)
      ), 0)::int`,
    })
    .from(timeEntries)
    .where(eq(timeEntries.workItemId, workItemId));

  return row?.total ?? 0;
}

/** Horas da pessoa no dia, quebradas por empresa. */
export async function todayByCompany(userId: string) {
  const today = brtToday();

  return db
    .select({
      companyName: companies.name,
      companyColor: companies.color,
      seconds: sql<number>`sum(
        coalesce(${timeEntries.durationSeconds},
                 extract(epoch from (now() - ${timeEntries.startedAt}))::int)
      )::int`,
    })
    .from(timeEntries)
    .leftJoin(companies, eq(companies.id, timeEntries.companyId))
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.startedAt, startOfBrtDay(today)),
        lt(timeEntries.startedAt, endOfBrtDay(today)),
      ),
    )
    .groupBy(companies.name, companies.color)
    .orderBy(desc(sql`2`));
}

export type TimeSummary = {
  own: number;
  subtasks: number;
  bySubtask: Record<string, number>;
};

/** Tempo da tarefa e das subtarefas dela, separados. */
export async function timeSummary(itemId: string): Promise<TimeSummary> {
  const rows = await db
    .select({
      itemId: timeEntries.workItemId,
      seconds: sql<number>`sum(
        coalesce(${timeEntries.durationSeconds},
                 extract(epoch from (now() - ${timeEntries.startedAt}))::int)
      )::int`,
    })
    .from(timeEntries)
    .innerJoin(workItems, eq(workItems.id, timeEntries.workItemId))
    .where(or(eq(workItems.id, itemId), eq(workItems.parentId, itemId)))
    .groupBy(timeEntries.workItemId);

  const summary: TimeSummary = { own: 0, subtasks: 0, bySubtask: {} };

  for (const row of rows) {
    if (row.itemId === itemId) summary.own += row.seconds;
    else if (row.itemId) {
      summary.subtasks += row.seconds;
      summary.bySubtask[row.itemId] = row.seconds;
    }
  }

  return summary;
}

export type TimeEntryRow = {
  id: string;
  startedAt: Date;
  durationSeconds: number | null;
  autoClosed: boolean;
  confirmedAt: Date | null;
  userName: string | null;
  fromTitle: string | null;
  isSubtask: boolean;
};

/** Registros da tarefa e das subtarefas, do mais recente para o mais antigo. */
export async function entriesForItem(itemId: string): Promise<TimeEntryRow[]> {
  return db
    .select({
      id: timeEntries.id,
      startedAt: timeEntries.startedAt,
      durationSeconds: timeEntries.durationSeconds,
      autoClosed: timeEntries.autoClosed,
      confirmedAt: timeEntries.confirmedAt,
      userName: users.name,
      fromTitle: workItems.title,
      isSubtask: sql<boolean>`${workItems.parentId} is not null`,
    })
    .from(timeEntries)
    .innerJoin(workItems, eq(workItems.id, timeEntries.workItemId))
    .leftJoin(users, eq(users.id, timeEntries.userId))
    .where(or(eq(workItems.id, itemId), eq(workItems.parentId, itemId)))
    .orderBy(desc(timeEntries.startedAt))
    .limit(50);
}
