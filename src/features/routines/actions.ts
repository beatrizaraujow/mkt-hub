"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  companies,
  routineOccurrences,
  routines,
  workItemStages,
  workItems,
} from "@/db/schema";
import {
  assertCanManage,
  assertCompanyAccess,
  requireUserAction,
  type CurrentUser,
} from "@/lib/auth";
import { describeError } from "@/lib/errors";

export type RoutineState = { error?: string; ok?: boolean };

function fail(message: string): RoutineState {
  return { error: message };
}

/**
 * Erro nosso vai para a tela; erro do banco, nao.
 *
 * O driver embrulha a falha do Postgres com o SQL inteiro colado (ver
 * lib/errors). Mostrar isso joga um `insert into` na cara de quem so queria
 * criar uma rotina. O texto tecnico fica no log; a pessoa le a frase curta.
 */
function problem(err: unknown, fallback: string): RoutineState {
  const detail = describeError(err);
  if (err instanceof Error && !detail.includes("Failed query")) return fail(err.message);
  console.error("[rotinas]", detail);
  return fail(fallback);
}

function refresh() {
  revalidatePath("/rotinas");
  revalidatePath("/trabalho");
  revalidatePath("/");
}

const schema = z.object({
  companyId: z.string().uuid("Escolha a empresa."),
  platform: z.string().trim().min(2, "Informe a plataforma.").max(40, "Plataforma muito longa."),
  label: z.string().trim().min(2, "Informe o que sai.").max(60, "Nome muito longo."),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Escolha ao menos um dia."),
  assigneeId: z.string().uuid().nullish(),
});

async function loadRoutine(user: CurrentUser, id: string) {
  const [row] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, id), eq(routines.orgId, user.orgId)))
    .limit(1);

  if (!row) throw new Error("Rotina não encontrada.");
  assertCompanyAccess(user, row.companyId);
  return row;
}

/* ------------------------------------------------------------ configurar */

export async function createRoutine(input: {
  companyId: string;
  platform: string;
  label: string;
  weekdays: number[];
  assigneeId: string | null;
}): Promise<RoutineState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    assertCompanyAccess(user, parsed.data.companyId);

    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, parsed.data.companyId), eq(companies.orgId, user.orgId)))
      .limit(1);

    if (!company) return fail("Empresa não encontrada.");

    await db.insert(routines).values({
      orgId: user.orgId,
      companyId: parsed.data.companyId,
      platform: parsed.data.platform,
      label: parsed.data.label,
      weekdays: [...new Set(parsed.data.weekdays)].sort((a, b) => a - b),
      assigneeId: parsed.data.assigneeId ?? null,
    });

    refresh();
    return { ok: true };
  } catch (err) {
    return problem(err, "Não foi possível criar a rotina.");
  }
}

export async function updateRoutine(
  id: string,
  input: { platform: string; label: string; weekdays: number[]; assigneeId: string | null },
): Promise<RoutineState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);
    const current = await loadRoutine(user, id);

    const parsed = schema.safeParse({ ...input, companyId: current.companyId });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    await db
      .update(routines)
      .set({
        platform: parsed.data.platform,
        label: parsed.data.label,
        weekdays: [...new Set(parsed.data.weekdays)].sort((a, b) => a - b),
        assigneeId: parsed.data.assigneeId ?? null,
      })
      .where(eq(routines.id, id));

    refresh();
    return { ok: true };
  } catch (err) {
    return problem(err, "Não foi possível salvar a rotina.");
  }
}

/**
 * Desativar, nunca apagar.
 *
 * A rotina antiga é o que explica a ocorrência antiga. Apagando, a grade da
 * semana passada perde a linha e o histórico de publicação vira órfão.
 */
export async function setRoutineActive(id: string, active: boolean): Promise<RoutineState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);
    await loadRoutine(user, id);

    await db.update(routines).set({ isActive: active }).where(eq(routines.id, id));

    refresh();
    return { ok: true };
  } catch (err) {
    return problem(err, "Não foi possível mudar a rotina.");
  }
}

/* ------------------------------------------------------------- publicar */

/**
 * Marcar publicado é um clique na célula.
 *
 * Marca a ocorrência e leva a tarefa gerada para o fim do pipeline junto —
 * senão a grade diz "saiu" e a tarefa fica aberta na fila de alguém, e os
 * dois números do sistema passam a discordar.
 */
export async function togglePublished(
  occurrenceId: string,
  published: boolean,
): Promise<RoutineState> {
  try {
    const user = await requireUserAction();

    const [row] = await db
      .select({
        id: routineOccurrences.id,
        workItemId: routineOccurrences.workItemId,
        companyId: routines.companyId,
      })
      .from(routineOccurrences)
      .innerJoin(routines, eq(routines.id, routineOccurrences.routineId))
      .where(and(eq(routineOccurrences.id, occurrenceId), eq(routines.orgId, user.orgId)))
      .limit(1);

    if (!row) return fail("Ocorrência não encontrada.");
    assertCompanyAccess(user, row.companyId);

    await db
      .update(routineOccurrences)
      .set({
        publishedAt: published ? new Date() : null,
        publishedById: published ? user.id : null,
      })
      .where(eq(routineOccurrences.id, occurrenceId));

    if (row.workItemId) {
      const stages = await db
        .select({ id: workItemStages.id, kind: workItemStages.kind })
        .from(workItemStages)
        .where(and(eq(workItemStages.orgId, user.orgId), eq(workItemStages.type, "content")))
        .orderBy(asc(workItemStages.position));

      const target = published
        ? stages.find((s) => s.kind === "done")
        : (stages.find((s) => s.kind === "doing") ?? stages[0]);

      if (target) {
        await db
          .update(workItems)
          .set({
            stageId: target.id,
            completedAt: published ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(workItems.id, row.workItemId));
      }
    }

    refresh();
    return { ok: true };
  } catch (err) {
    return problem(err, "Não foi possível marcar.");
  }
}

/** Usado pela tela de configuração para listar quem pode ser responsável. */
export async function companiesForRoutines(user: CurrentUser) {
  if (!user.companyIds.length) return [];

  return db
    .select({ id: companies.id, name: companies.name, parentId: companies.parentId })
    .from(companies)
    .where(inArray(companies.id, user.companyIds))
    .orderBy(asc(companies.name));
}
