"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries, workItems } from "@/db/schema";
import { assertCompanyAccess, requireUserAction, type CurrentUser } from "@/lib/auth";
import { dueDateFromInput } from "@/lib/date";
import { closeStaleTimers } from "./queries";

export type TimeState = { error?: string; ok?: boolean };

function fail(message: string): TimeState {
  return { error: message };
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/trabalho");
}

async function loadItem(user: CurrentUser, id: string) {
  const [item] = await db
    .select({ id: workItems.id, companyId: workItems.companyId, title: workItems.title })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.orgId, user.orgId)))
    .limit(1);

  if (!item) throw new Error("Tarefa não encontrada.");
  assertCompanyAccess(user, item.companyId);
  return item;
}

/** Para o timer que estiver rodando. Devolve quantos segundos foram gravados. */
async function stopRunning(userId: string): Promise<number | null> {
  const [running] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
    .limit(1);

  if (!running) return null;

  const now = new Date();
  const seconds = Math.max(0, Math.round((now.getTime() - running.startedAt.getTime()) / 1000));

  await db
    .update(timeEntries)
    .set({ endedAt: now, durationSeconds: seconds })
    .where(eq(timeEntries.id, running.id));

  return seconds;
}

/**
 * Começa a contar numa tarefa. Se já houver timer rodando, ele para antes —
 * uma pessoa faz uma coisa de cada vez, e o banco garante isso com índice
 * único. Trocar de tarefa é um clique, não dois.
 */
export async function startTimer(workItemId: string): Promise<TimeState> {
  try {
    const user = await requireUserAction();
    const item = await loadItem(user, workItemId);

    await closeStaleTimers(user.id);
    await stopRunning(user.id);

    await db.insert(timeEntries).values({
      userId: user.id,
      workItemId: item.id,
      companyId: item.companyId,
      startedAt: new Date(),
    });

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível iniciar.");
  }
}

export async function stopTimer(): Promise<TimeState> {
  try {
    const user = await requireUserAction();
    await closeStaleTimers(user.id);

    const seconds = await stopRunning(user.id);
    if (seconds === null) return fail("Nenhum timer rodando.");

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível parar.");
  }
}

/** Descarta o timer atual sem gravar nada. Para quando esqueceu ligado. */
export async function discardTimer(): Promise<TimeState> {
  try {
    const user = await requireUserAction();

    const [running] = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.endedAt)))
      .limit(1);

    if (!running) return fail("Nenhum timer rodando.");

    await db.delete(timeEntries).where(eq(timeEntries.id, running.id));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível descartar.");
  }
}

/** Lançamento manual: quem esqueceu de ligar o timer não fica sem registrar. */
export async function logManualTime(
  workItemId: string,
  minutes: string,
  date: string,
): Promise<TimeState> {
  try {
    const user = await requireUserAction();
    const item = await loadItem(user, workItemId);

    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return fail("Informe os minutos.");
    if (value > 24 * 60) return fail("Mais de 24 horas num lançamento só? Confira o número.");

    const day = dueDateFromInput(date);
    if (!day) return fail("Data inválida.");

    const seconds = Math.round(value * 60);
    const startedAt = new Date(day.getTime() - seconds * 1000);

    await db.insert(timeEntries).values({
      userId: user.id,
      workItemId: item.id,
      companyId: item.companyId,
      startedAt,
      endedAt: day,
      durationSeconds: seconds,
      confirmedAt: new Date(),
    });

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível lançar o tempo.");
  }
}

/** "Você registrou 6h em X — confirma?" Confirmar sem mexer no valor. */
export async function confirmEntry(entryId: string): Promise<TimeState> {
  try {
    const user = await requireUserAction();

    const result = await db
      .update(timeEntries)
      .set({ confirmedAt: new Date() })
      .where(and(eq(timeEntries.id, entryId), eq(timeEntries.userId, user.id)))
      .returning({ id: timeEntries.id });

    if (!result.length) return fail("Registro não encontrado.");

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível confirmar.");
  }
}

/** Corrige a duração de um registro fechado pelo corte automático. */
export async function adjustEntry(entryId: string, minutes: string): Promise<TimeState> {
  try {
    const user = await requireUserAction();

    const value = Number(minutes);
    if (!Number.isFinite(value) || value < 0) return fail("Informe os minutos.");
    if (value > 24 * 60) return fail("Mais de 24 horas num registro só? Confira o número.");

    const [entry] = await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.id, entryId), eq(timeEntries.userId, user.id)))
      .limit(1);

    if (!entry) return fail("Registro não encontrado.");

    const seconds = Math.round(value * 60);

    await db
      .update(timeEntries)
      .set({
        durationSeconds: seconds,
        endedAt: new Date(entry.startedAt.getTime() + seconds * 1000),
        confirmedAt: new Date(),
      })
      .where(eq(timeEntries.id, entryId));

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível ajustar.");
  }
}

/** Apaga um registro do corte automático que não corresponde a trabalho real. */
export async function discardEntry(entryId: string): Promise<TimeState> {
  try {
    const user = await requireUserAction();

    await db
      .delete(timeEntries)
      .where(and(eq(timeEntries.id, entryId), eq(timeEntries.userId, user.id)));

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível descartar.");
  }
}
