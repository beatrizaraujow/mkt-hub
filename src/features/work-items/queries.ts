import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  projects,
  users,
  workItemStages,
  workItems,
  type Priority,
  type WorkItemType,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { addDays, brtToday, endOfBrtDay, startOfBrtDay } from "@/lib/date";

export type WorkItemRow = {
  id: string;
  title: string;
  type: WorkItemType;
  priority: Priority;
  dueDate: Date | null;
  completedAt: Date | null;
  estimateMinutes: number | null;
  stageId: string;
  stageName: string;
  stageKind: string;
  companyId: string;
  companyName: string;
  companyColor: string;
  projectId: string | null;
  projectName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
};

const SELECTION = {
  id: workItems.id,
  title: workItems.title,
  type: workItems.type,
  priority: workItems.priority,
  dueDate: workItems.dueDate,
  completedAt: workItems.completedAt,
  estimateMinutes: workItems.estimateMinutes,
  stageId: workItems.stageId,
  stageName: workItemStages.name,
  stageKind: workItemStages.kind,
  companyId: workItems.companyId,
  companyName: companies.name,
  companyColor: companies.color,
  projectId: workItems.projectId,
  projectName: projects.name,
  assigneeId: workItems.assigneeId,
  assigneeName: users.name,
};

function baseQuery() {
  return db
    .select(SELECTION)
    .from(workItems)
    .innerJoin(workItemStages, eq(workItemStages.id, workItems.stageId))
    .innerJoin(companies, eq(companies.id, workItems.companyId))
    .leftJoin(projects, eq(projects.id, workItems.projectId))
    .leftJoin(users, eq(users.id, workItems.assigneeId));
}

/** Nenhuma consulta escapa do alcance de empresa da pessoa. */
function scope(user: CurrentUser) {
  return and(
    eq(workItems.orgId, user.orgId),
    isNull(workItems.parentId),
    user.companyIds.length
      ? inArray(workItems.companyId, user.companyIds)
      : sql`false`,
  );
}

export type WorkFilters = {
  type?: WorkItemType;
  companyId?: string;
  projectId?: string;
  assigneeId?: string;
  /** Por padrao esconde o que ja foi concluido. */
  includeDone?: boolean;
};

export async function listWorkItems(
  user: CurrentUser,
  filters: WorkFilters = {},
): Promise<WorkItemRow[]> {
  const where = [scope(user)];

  if (filters.type) where.push(eq(workItems.type, filters.type));
  if (filters.companyId) where.push(eq(workItems.companyId, filters.companyId));
  if (filters.projectId) where.push(eq(workItems.projectId, filters.projectId));
  if (filters.assigneeId) where.push(eq(workItems.assigneeId, filters.assigneeId));
  if (!filters.includeDone) where.push(isNull(workItems.completedAt));

  return baseQuery()
    .where(and(...where))
    .orderBy(
      // Sem prazo vai para o fim; entre os que tem prazo, o mais proximo primeiro.
      sql`${workItems.dueDate} asc nulls last`,
      asc(workItemStages.position),
      desc(workItems.createdAt),
    )
    .limit(300);
}

export type TodayBoard = {
  atrasado: WorkItemRow[];
  hoje: WorkItemRow[];
  depois: WorkItemRow[];
  semPrazo: WorkItemRow[];
};

/**
 * O painel Hoje: tres blocos, na ordem em que a pessoa precisa deles.
 * "Depois" para em 7 dias — prazo de mes que vem nao ajuda a decidir agora.
 */
export async function todayBoard(user: CurrentUser): Promise<TodayBoard> {
  const today = brtToday();
  const startToday = startOfBrtDay(today);
  const endToday = endOfBrtDay(today);
  const horizon = endOfBrtDay(addDays(today, 7));

  const rows = await baseQuery()
    .where(
      and(
        scope(user),
        eq(workItems.assigneeId, user.id),
        isNull(workItems.completedAt),
        or(isNull(workItems.dueDate), lt(workItems.dueDate, horizon)),
      ),
    )
    .orderBy(sql`${workItems.dueDate} asc nulls last`, asc(workItems.priority))
    .limit(200);

  const board: TodayBoard = { atrasado: [], hoje: [], depois: [], semPrazo: [] };

  for (const row of rows) {
    if (!row.dueDate) board.semPrazo.push(row);
    else if (row.dueDate < startToday) board.atrasado.push(row);
    else if (row.dueDate < endToday) board.hoje.push(row);
    else board.depois.push(row);
  }

  return board;
}

/** Quanto a pessoa ja registrou hoje, em segundos. */
export async function secondsTrackedToday(userId: string): Promise<number> {
  const today = brtToday();
  const [row] = await db.execute<{ total: string | null }>(sql`
    select coalesce(sum(
      coalesce(duration_seconds, extract(epoch from (now() - started_at))::int)
    ), 0)::text as total
    from time_entries
    where user_id = ${userId}
      and started_at >= ${startOfBrtDay(today).toISOString()}
      and started_at < ${endOfBrtDay(today).toISOString()}
  `);
  return Number(row?.total ?? 0);
}

/** Estagios de um tipo. Preferencia para o pipeline da empresa, se existir. */
export async function stagesFor(orgId: string, type: WorkItemType, companyId?: string) {
  const rows = await db
    .select()
    .from(workItemStages)
    .where(
      and(
        eq(workItemStages.orgId, orgId),
        eq(workItemStages.type, type),
        companyId
          ? or(eq(workItemStages.companyId, companyId), isNull(workItemStages.companyId))
          : isNull(workItemStages.companyId),
      ),
    )
    .orderBy(asc(workItemStages.position));

  const doCompany = rows.filter((s) => s.companyId === companyId);
  return doCompany.length ? doCompany : rows.filter((s) => s.companyId === null);
}

/** Dados que a criação rápida precisa: empresas, projetos, pessoas e estágios. */
export async function quickCreateOptions(user: CurrentUser) {
  if (!user.companyIds.length) {
    return { companies: [], projects: [], people: [], stages: [] };
  }

  const [companyRows, projectRows, peopleRows, stageRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name, color: companies.color })
      .from(companies)
      .where(and(inArray(companies.id, user.companyIds), eq(companies.isActive, true)))
      .orderBy(asc(companies.name)),
    db
      .select({ id: projects.id, name: projects.name, companyId: projects.companyId })
      .from(projects)
      .where(and(inArray(projects.companyId, user.companyIds), eq(projects.isArchived, false)))
      .orderBy(asc(projects.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, user.orgId), eq(users.isActive, true)))
      .orderBy(asc(users.name)),
    stagesFor(user.orgId, "task"),
  ]);

  return { companies: companyRows, projects: projectRows, people: peopleRows, stages: stageRows };
}
