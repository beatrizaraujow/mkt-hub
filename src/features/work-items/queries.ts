import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLog,
  attachments,
  checklistItems,
  comments,
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
import { PREVIEW_TTL_SECONDS, signedUrl, storageConfigured } from "@/lib/storage";
import { isImage } from "@/lib/upload-rules";

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
  stageSlug: string;
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
  stageSlug: workItemStages.slug,
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

/**
 * Itens com prazo dentro de uma faixa de dias. O calendario nao pode usar
 * `listWorkItems`: aquela consulta corta em 300 linhas ordenadas por prazo,
 * entao um mes distante viria vazio sem ninguem entender por que.
 *
 * Traz o concluido junto — calendario com buraco no lugar do que ja foi
 * entregue nao conta a historia do mes.
 */
export async function listInRange(
  user: CurrentUser,
  filters: Pick<WorkFilters, "companyId" | "assigneeId">,
  fromYmd: string,
  toYmd: string,
): Promise<WorkItemRow[]> {
  const where = [
    scope(user),
    gte(workItems.dueDate, startOfBrtDay(fromYmd)),
    lte(workItems.dueDate, endOfBrtDay(toYmd)),
  ];

  if (filters.companyId) where.push(eq(workItems.companyId, filters.companyId));
  if (filters.assigneeId) where.push(eq(workItems.assigneeId, filters.assigneeId));

  return baseQuery()
    .where(and(...where))
    .orderBy(asc(workItems.dueDate), asc(workItemStages.position))
    .limit(500);
}

/** Quantas tarefas abertas estao sem prazo — o que o calendario nao mostra. */
export async function countWithoutDueDate(
  user: CurrentUser,
  filters: Pick<WorkFilters, "companyId" | "assigneeId">,
): Promise<number> {
  const where = [scope(user), isNull(workItems.dueDate), isNull(workItems.completedAt)];
  if (filters.companyId) where.push(eq(workItems.companyId, filters.companyId));
  if (filters.assigneeId) where.push(eq(workItems.assigneeId, filters.assigneeId));

  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(workItems)
    .where(and(...where));

  return row?.total ?? 0;
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

/**
 * Todas as etapas padrão da organização, na ordem dos pipelines.
 *
 * A lista agrupada precisa das três: tarefa aparece sempre, e conteúdo e
 * captação aparecem quando têm item. Sem elas, um item de captação ficaria
 * fora de todos os grupos e sumiria da tela sem aviso.
 */
export async function allDefaultStages(orgId: string) {
  return db
    .select({
      id: workItemStages.id,
      name: workItemStages.name,
      slug: workItemStages.slug,
      type: workItemStages.type,
      kind: workItemStages.kind,
      position: workItemStages.position,
    })
    .from(workItemStages)
    .where(and(eq(workItemStages.orgId, orgId), isNull(workItemStages.companyId)))
    .orderBy(asc(workItemStages.type), asc(workItemStages.position));
}

/** Dados que a criação rápida precisa: empresas, projetos, pessoas e estágios. */
export async function quickCreateOptions(user: CurrentUser) {
  if (!user.companyIds.length) {
    return { companies: [], projects: [], people: [], stages: [] };
  }

  const [companyRows, projectRows, peopleRows, stageRows] = await Promise.all([
    db
      .select({
        id: companies.id,
        name: companies.name,
        color: companies.color,
        parentId: companies.parentId,
      })
      .from(companies)
      .where(and(inArray(companies.id, user.companyIds), eq(companies.isActive, true)))
      .orderBy(asc(companies.name)),
    db
      .select({ id: projects.id, name: projects.name, companyId: projects.companyId })
      .from(projects)
      .where(and(inArray(projects.companyId, user.companyIds), eq(projects.isArchived, false)))
      .orderBy(asc(projects.name)),
    peopleWithLoad(user),
    stagesFor(user.orgId, "task"),
  ]);

  // Empresa-mãe seguida das filhas dela. Ordem alfabética achatada colocaria
  // "Box Corporativo" antes de "SeuBoné", que é a dona dele.
  const parents = companyRows.filter((c) => !c.parentId);
  const ordered = parents.flatMap((parent) => [
    parent,
    ...companyRows.filter((c) => c.parentId === parent.id),
  ]);
  // Filha cuja mãe a pessoa não enxerga não pode sumir da lista.
  const orphans = companyRows.filter((c) => !ordered.includes(c));

  return {
    companies: [...ordered, ...orphans],
    projects: projectRows,
    people: peopleRows,
    stages: stageRows,
  };
}

/* --------------------------------------------------------------- detalhe */

export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItemDetail>>>;

/**
 * Tudo que o painel lateral mostra, numa ida só ao banco por bloco.
 * Devolve null quando o item nao existe ou esta fora do alcance da pessoa —
 * o painel trata os dois casos igual, de proposito: nao revela existencia.
 */
export async function getItemDetail(user: CurrentUser, id: string) {
  const [item] = await baseQuery()
    .where(and(eq(workItems.orgId, user.orgId), eq(workItems.id, id)))
    .limit(1);

  if (!item || !user.companyIds.includes(item.companyId)) return null;

  const [full] = await db.select().from(workItems).where(eq(workItems.id, id)).limit(1);

  const [checklist, commentRows, activity, stages, subtasks, files] = await Promise.all([
    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.workItemId, id))
      .orderBy(asc(checklistItems.position)),
    db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        authorName: users.name,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.workItemId, id))
      .orderBy(asc(comments.createdAt)),
    db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        payload: activityLog.payload,
        createdAt: activityLog.createdAt,
        actorName: users.name,
      })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.actorId))
      .where(eq(activityLog.workItemId, id))
      .orderBy(desc(activityLog.createdAt))
      .limit(20),
    stagesFor(user.orgId, item.type, item.companyId),
    db
      .select({
        id: workItems.id,
        title: workItems.title,
        completedAt: workItems.completedAt,
        assigneeName: users.name,
      })
      .from(workItems)
      .leftJoin(users, eq(users.id, workItems.assigneeId))
      .where(eq(workItems.parentId, id))
      .orderBy(asc(workItems.position), asc(workItems.createdAt)),
    db
      .select({
        id: attachments.id,
        kind: attachments.kind,
        filename: attachments.filename,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
        url: attachments.url,
        storageKey: attachments.storageKey,
        uploadedByName: users.name,
      })
      .from(attachments)
      .leftJoin(users, eq(users.id, attachments.uploadedById))
      .where(eq(attachments.workItemId, id))
      .orderBy(asc(attachments.createdAt)),
  ]);

  const filesWithPreview = await withPreviews(files);

  return {
    ...item,
    description: full?.description ?? null,
    points: full?.points ?? null,
    skill: full?.skill ?? null,
    format: full?.format ?? null,
    request: full ? requestOf(full) : null,
    checklist,
    subtasks,
    files: filesWithPreview,
    comments: commentRows,
    activity,
    stages,
  };
}

type AttachmentQueryRow = {
  id: string;
  kind: "file" | "link";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string | null;
  storageKey: string;
  uploadedByName: string | null;
};

/**
 * Miniatura de imagem.
 *
 * O bucket é privado, então a imagem só aparece com URL assinada. Assinar no
 * clique serve para baixar, não para mostrar: o card precisa da imagem já
 * pronta ao abrir. Uma assinatura por imagem, em paralelo, e o `storageKey`
 * não vai junto para o navegador — ele não serve para nada lá.
 */
async function withPreviews(rows: AttachmentQueryRow[]) {
  const configured = storageConfigured();

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      url: row.url,
      uploadedByName: row.uploadedByName,
      previewUrl:
        configured && row.kind === "file" && row.storageKey && isImage(row.filename)
          ? await signedUrl(row.storageKey, PREVIEW_TTL_SECONDS)
          : null,
    })),
  );
}

export type RequestInfo = {
  name: string;
  email: string | null;
  phone: string | null;
  type: string | null;
  objective: string | null;
  briefing: Array<[string, string]>;
  references: string | null;
  notes: string | null;
};

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * O que veio do formulario publico. Fica em `meta` porque cada tipo de
 * demanda pergunta uma coisa diferente e nada disso entra em calculo —
 * virar coluna seria uma tabela larga e quase toda nula.
 */
function requestOf(row: { requesterName: string | null; requesterEmail: string | null; requesterPhone: string | null; meta: Record<string, unknown> }): RequestInfo | null {
  if (!row.requesterName) return null;

  const raw = row.meta.briefing;
  const briefing =
    raw && typeof raw === "object"
      ? Object.entries(raw as Record<string, unknown>)
          .map(([key, value]) => [key, str(value)] as const)
          .filter((pair): pair is readonly [string, string] => pair[1] !== null)
          .map(([key, value]) => [key, value] as [string, string])
      : [];

  return {
    name: row.requesterName,
    email: row.requesterEmail,
    phone: row.requesterPhone,
    type: str(row.meta.requestType),
    objective: str(row.meta.objective),
    briefing,
    references: str(row.meta.references),
    notes: str(row.meta.notes),
  };
}

export type PersonLoad = { id: string; name: string; todayCount: number };

/**
 * Pessoas com a carga do dia: quantas tarefas abertas cada uma tem com prazo
 * para hoje ou ja vencido. Serve para atribuir sem abrir o painel do time —
 * dar mais uma tarefa para quem ja tem sete e uma decisao, nao um acidente.
 */
export async function peopleWithLoad(user: CurrentUser): Promise<PersonLoad[]> {
  const endToday = endOfBrtDay(brtToday());

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      todayCount: sql<number>`count(${workItems.id})::int`,
    })
    .from(users)
    .leftJoin(
      workItems,
      and(
        eq(workItems.assigneeId, users.id),
        isNull(workItems.completedAt),
        lt(workItems.dueDate, endToday),
      ),
    )
    .where(and(eq(users.orgId, user.orgId), eq(users.isActive, true)))
    .groupBy(users.id, users.name)
    .orderBy(asc(users.name));

  return rows;
}
