/**
 * Modelo de dados — MKT Hub 2
 *
 * Hierarquia: Organization > Company > Project > WorkItem > WorkItem (subitem)
 *
 * Decisao A1: tarefa, conteudo e captacao sao a MESMA entidade (`work_items`),
 * separadas por `type` e por pipeline (`work_item_stages`). Campos que variam
 * por tipo e nao entram em calculo ficam em `meta` (jsonb). Tudo que entra em
 * calculo — data, responsavel, estagio, tempo — e coluna real e indexada.
 *
 * Escopo deste arquivo: MVP. Rotinas, metas, coins e snapshots entram na V1.5.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const userRole = pgEnum("user_role", ["admin", "gestor", "colaborador", "observador"]);

export const workItemType = pgEnum("work_item_type", ["task", "content", "capture"]);

export const priority = pgEnum("priority", ["urgente", "alta", "media", "baixa"]);

/** Anexo pode ser arquivo guardado por nos ou link para fora. */
export const attachmentKind = pgEnum("attachment_kind", ["file", "link"]);

/** O nome do estagio e livre; `kind` e o que o sistema usa para calcular. */
export const stageKind = pgEnum("stage_kind", ["backlog", "todo", "doing", "review", "done"]);

/* ---------------------------------------------------------- organizacoes */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------------------- pessoas */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("colaborador"),
    /** Valida fechamento de semana. Sempre checado no servidor. */
    isMaster: boolean("is_master").notNull().default(false),
    avatarUrl: text("avatar_url"),
    jobTitle: text("job_title"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/* -------------------------------------------------------------- empresas */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /**
     * Sub-marca de uma empresa. Onevo Energia, Onevo Investimentos e
     * Cassio Maia P2P sao filhas de Onevo; Box Corporativo e filha de SeuBone;
     * Carbone Club e Pedro Galvao P2P sao filhas de Carbone Educacao.
     *
     * A tarefa aponta sempre para a empresa mais especifica que existir.
     * Quem tem acesso a mae alcança as filhas — a regra vive em `lib/auth`.
     */
    parentId: uuid("parent_id").references((): AnyPgColumn => companies.id, {
      onDelete: "cascade",
    }),
    /** Cor de identificacao na lista. Nunca usada para status. */
    color: text("color").notNull().default("#0d5c59"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_org_slug_unique").on(t.orgId, t.slug),
    index("companies_parent_idx").on(t.parentId),
  ],
);

/** O papel define o teto, o acesso por empresa define o alcance. */
export const userCompanyAccess = pgTable(
  "user_company_access",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

/* -------------------------------------------------------------- projetos */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_company_idx").on(t.companyId)],
);

/* -------------------------------------------------------------- estagios */

/**
 * Pipeline por tipo. `companyId` nulo = pipeline padrao da organizacao.
 * Customizacao por empresa entra na V2 (achado A6) — a coluna ja existe
 * porque adiciona-la depois custa migration em tabela viva.
 */
export const workItemStages = pgTable(
  "work_item_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    type: workItemType("type").notNull(),
    name: text("name").notNull(),
    kind: stageKind("kind").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("stages_scope_idx").on(t.orgId, t.type, t.companyId)],
);

/* ------------------------------------------------------------ work items */

export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),

    type: workItemType("type").notNull().default("task"),
    title: text("title").notNull(),
    description: text("description"),

    stageId: uuid("stage_id")
      .notNull()
      .references(() => workItemStages.id),
    priority: priority("priority").notNull().default("media"),

    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),

    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    estimateMinutes: integer("estimate_minutes"),

    /**
     * "Ponto de atividade MKT" — o unico campo obrigatorio do board antigo.
     * E a moeda de pontuacao do time e o que a ponte com o MKT Hub atual le.
     */
    points: integer("points"),

    /** "Tarefas SKILL" — que tipo de trabalho e. Opcoes em lib/catalog. */
    skill: text("skill"),
    /** "Formato SKILL" — formato da peca. Opcoes em lib/catalog. */
    format: text("format"),

    /**
     * Banco de criativos. No ClickUp isso era uma coluna do quadro, o que
     * misturava arquivo com fluxo: a peca ficava "parada" para sempre num
     * estagio. Aqui e uma marca em cima do item concluido.
     */
    isAsset: boolean("is_asset").notNull().default(false),

    /** Quem pediu, quando a demanda entra pelo formulario e nao pelo time. */
    requesterName: text("requester_name"),
    requesterEmail: text("requester_email"),
    requesterPhone: text("requester_phone"),

    /** Ordem dentro da coluna do quadro. Fracionaria: reordenar nao reescreve a lista. */
    position: doublePrecision("position").notNull().default(1000),

    completedAt: timestamp("completed_at", { withTimezone: true }),

    /** Origem, quando o item nao foi criado a mao (rotina, captacao). V1.5/V2. */
    sourceOccurrenceId: uuid("source_occurrence_id"),
    sourceItemId: uuid("source_item_id"),

    /** Campos que variam por tipo e nao entram em calculo. */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wi_assignee_due_idx").on(t.assigneeId, t.dueDate),
    index("wi_company_idx").on(t.companyId),
    index("wi_project_idx").on(t.projectId),
    index("wi_stage_idx").on(t.stageId),
    index("wi_parent_idx").on(t.parentId),
    index("wi_type_idx").on(t.orgId, t.type),
    index("wi_asset_idx").on(t.orgId, t.isAsset),
  ],
);

/* ------------------------------------------------------------- checklist */

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    isDone: boolean("is_done").notNull().default(false),
    position: doublePrecision("position").notNull().default(1000),
  },
  (t) => [index("checklist_item_idx").on(t.workItemId)],
);

/* ----------------------------------------------------------- comentarios */

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Ids de usuarios mencionados — alimenta notificacao. */
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("comments_item_idx").on(t.workItemId)],
);

/* --------------------------------------------------------------- anexos */

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id").references(() => workItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    kind: attachmentKind("kind").notNull().default("file"),
    /** Nome do arquivo, ou o rotulo do link. */
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default(""),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Caminho no bucket. Vazio quando e link. */
    storageKey: text("storage_key").notNull().default(""),
    /** Endereco de fora. Nulo quando e arquivo nosso. */
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachments_item_idx").on(t.workItemId)],
);

/* ------------------------------------------------------------ historico */

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").references(() => workItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** ex.: item.created, item.stage_changed, item.assignee_changed, comment.created */
    action: text("action").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_item_idx").on(t.workItemId, t.createdAt),
    index("activity_org_idx").on(t.orgId, t.createdAt),
  ],
);

/* ---------------------------------------------------------------- horas */

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").references(() => workItems.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    note: text("note"),
    /** Fechado pelo corte automatico de fim de expediente (achado A5). */
    autoClosed: boolean("auto_closed").notNull().default(false),
    /** Confirmado pela pessoa depois de um registro longo suspeito. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("time_user_started_idx").on(t.userId, t.startedAt),
    index("time_item_idx").on(t.workItemId),
    /** Um timer rodando por pessoa. */
    uniqueIndex("time_one_running_per_user")
      .on(t.userId)
      .where(sql`ended_at is null`),
  ],
);

/* -------------------------------------------------------- filtros salvos */

export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Serializacao dos filtros da tela Trabalho. */
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
    position: doublePrecision("position").notNull().default(1000),
  },
  (t) => [index("saved_views_user_idx").on(t.userId)],
);

/* ----------------------------------------------------------------- tipos */

export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type WorkItem = typeof workItems.$inferSelect;
export type WorkItemStage = typeof workItemStages.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type AttachmentKind = (typeof attachmentKind.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
export type WorkItemType = (typeof workItemType.enumValues)[number];
export type Priority = (typeof priority.enumValues)[number];
export type StageKind = (typeof stageKind.enumValues)[number];
