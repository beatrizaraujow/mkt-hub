import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  routineOccurrences,
  routines,
  users,
  workItemStages,
  workItems,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { brtToday } from "@/lib/date";
import { generatesFor, missingOccurrences, weekDays } from "./week";

export type RoutineRow = {
  id: string;
  companyId: string;
  companyName: string;
  companyColor: string;
  platform: string;
  label: string;
  weekdays: number[];
  assigneeId: string | null;
  assigneeName: string | null;
  isActive: boolean;
};

export type OccurrenceRow = {
  id: string;
  routineId: string;
  day: string;
  workItemId: string | null;
  publishedAt: Date | null;
  publishedByName: string | null;
};

/** As rotinas ativas das empresas que a pessoa enxerga. */
export async function listRoutines(
  user: CurrentUser,
  options: { includeInactive?: boolean; companyId?: string } = {},
): Promise<RoutineRow[]> {
  if (!user.companyIds.length) return [];

  const where = [
    eq(routines.orgId, user.orgId),
    inArray(routines.companyId, options.companyId ? [options.companyId] : user.companyIds),
  ];
  if (!options.includeInactive) where.push(eq(routines.isActive, true));

  return db
    .select({
      id: routines.id,
      companyId: routines.companyId,
      companyName: companies.name,
      companyColor: companies.color,
      platform: routines.platform,
      label: routines.label,
      weekdays: routines.weekdays,
      assigneeId: routines.assigneeId,
      assigneeName: users.name,
      isActive: routines.isActive,
    })
    .from(routines)
    .innerJoin(companies, eq(companies.id, routines.companyId))
    .leftJoin(users, eq(users.id, routines.assigneeId))
    .where(and(...where))
    .orderBy(asc(companies.name), asc(routines.platform), asc(routines.label));
}

/**
 * Cria as ocorrências que faltam na semana, e as tarefas junto.
 *
 * Roda na leitura da grade. Sem cron e sem fila: o índice único em
 * (rotina, dia) é o que segura duas abas abertas ao mesmo tempo, e a
 * comparação em memória evita a ida ao banco no caso comum, que é não
 * faltar nada.
 *
 * Semana que já terminou não gera nada: abrir a grade de três meses atrás é
 * leitura do que houve, não cobrança retroativa que ninguém tinha. O guarda
 * mora aqui, e não na tela, porque vale para qualquer chamador.
 */
export async function ensureWeek(user: CurrentUser, monday: string) {
  if (!generatesFor(monday, brtToday())) return;

  const active = await listRoutines(user);
  if (active.length === 0) return;

  const days = weekDays(monday);

  const existing = await db
    .select({ routineId: routineOccurrences.routineId, day: routineOccurrences.day })
    .from(routineOccurrences)
    .where(
      and(
        inArray(
          routineOccurrences.routineId,
          active.map((r) => r.id),
        ),
        gte(routineOccurrences.day, days[0]),
        lte(routineOccurrences.day, days[6]),
      ),
    );

  const missing = missingOccurrences(active, monday, existing);
  if (missing.length === 0) return;

  const byId = new Map(active.map((r) => [r.id, r]));

  // O estágio de entrada do pipeline de conteúdo. Uma consulta só para todos.
  const [entryStage] = await db
    .select({ id: workItemStages.id })
    .from(workItemStages)
    .where(and(eq(workItemStages.orgId, user.orgId), eq(workItemStages.type, "content")))
    .orderBy(asc(workItemStages.position))
    .limit(1);

  if (!entryStage) return;

  for (const item of missing) {
    const routine = byId.get(item.routineId);
    if (!routine) continue;

    const [created] = await db
      .insert(workItems)
      .values({
        orgId: user.orgId,
        companyId: routine.companyId,
        type: "content",
        title: `${routine.platform} · ${routine.label}`,
        stageId: entryStage.id,
        assigneeId: routine.assigneeId,
        // Prazo às 12h BRT, mesma convenção do resto do sistema.
        dueDate: new Date(`${item.day}T12:00:00-03:00`),
        skill: null,
        format: null,
      })
      .returning({ id: workItems.id });

    const [occurrence] = await db
      .insert(routineOccurrences)
      .values({ routineId: item.routineId, day: item.day, workItemId: created.id })
      .onConflictDoNothing()
      .returning({ id: routineOccurrences.id });

    if (occurrence) {
      // A tarefa só é de rotina depois que a ocorrência existe. Assim, se
      // duas abas correrem juntas, a que perdeu não deixa tarefa órfã
      // marcada como rotina.
      await db
        .update(workItems)
        .set({ sourceOccurrenceId: occurrence.id })
        .where(eq(workItems.id, created.id));
    } else {
      // Outra aba criou primeiro. Some com a tarefa duplicada.
      await db.delete(workItems).where(eq(workItems.id, created.id));
    }
  }
}

/** As ocorrências da semana, para pintar a grade. */
export async function occurrencesForWeek(
  user: CurrentUser,
  monday: string,
): Promise<OccurrenceRow[]> {
  if (!user.companyIds.length) return [];

  const days = weekDays(monday);

  return db
    .select({
      id: routineOccurrences.id,
      routineId: routineOccurrences.routineId,
      day: routineOccurrences.day,
      workItemId: routineOccurrences.workItemId,
      publishedAt: routineOccurrences.publishedAt,
      publishedByName: users.name,
    })
    .from(routineOccurrences)
    .innerJoin(routines, eq(routines.id, routineOccurrences.routineId))
    .leftJoin(users, eq(users.id, routineOccurrences.publishedById))
    .where(
      and(
        inArray(routines.companyId, user.companyIds),
        gte(routineOccurrences.day, days[0]),
        lte(routineOccurrences.day, days[6]),
      ),
    );
}

/** Quanto da semana saiu, para o cabeçalho da grade. */
export function weekProgress(rows: OccurrenceRow[], today = brtToday()) {
  const total = rows.length;
  const done = rows.filter((row) => row.publishedAt).length;
  const late = rows.filter((row) => !row.publishedAt && row.day < today).length;
  return { total, done, late };
}

/** Plataformas já usadas, para sugerir sem obrigar. */
export async function knownPlatforms(user: CurrentUser): Promise<string[]> {
  if (!user.companyIds.length) return [];

  const rows = await db
    .selectDistinct({ platform: routines.platform })
    .from(routines)
    .where(and(eq(routines.orgId, user.orgId), inArray(routines.companyId, user.companyIds)))
    .orderBy(asc(routines.platform));

  return rows.map((row) => row.platform);
}
