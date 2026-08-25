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

/* --- revisor de entregas --- */

/**
 * Quem consegue conferir a regra. E a classificacao mais importante do
 * revisor: na duvida entre maquina e pessoa, e pessoa. Uma reprovacao errada
 * custa muito mais caro que uma verificacao a menos.
 */
export const ruleVerifier = pgEnum("rule_verifier", ["maquina", "pessoa", "fora"]);

/** Estado de uma rodada de revisao. `falhou` nunca e veredito. */
export const cycleStatus = pgEnum("review_cycle_status", [
  "pendente",
  "rodando",
  "emitido",
  "incompleto",
  "falhou",
]);

/**
 * O veredito. Binario e nomeavel: violou regra inegociavel, reprova. Nota nao
 * decide nada — ela oscila entre execucoes e ninguem consegue explicar por que
 * foi 6,8 e nao 7,1.
 */
export const cycleVerdict = pgEnum("review_verdict", ["aprovado", "ajustar", "reprovado"]);

/** Estado tecnico de uma execucao. Separado do veredito de proposito. */
export const runState = pgEnum("review_run_state", ["na_fila", "rodando", "concluida", "falhou"]);

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

/* ------------------------------------------------------- revisor: regras */

/**
 * As duas metades do revisor tem regras diferentes de vida.
 *
 * **Material aprovado** (`review_rules`, `review_checklist_items`) entra por
 * carga e e tratado como configuracao: quem sabe a regra e a area de negocio,
 * e ela precisa mudar sem abrir chamado de desenvolvimento.
 *
 * **Operacao** (`review_cycles`, `review_runs`, `review_findings`) nasce do
 * uso. Misturar as duas numa tabela so e o comeco da confusao.
 *
 * Duas tabelas do padrao original ficaram de fora de proposito:
 *
 * - `entregas`, que la era espelho do que estava sendo julgado. Aqui a entrega
 *   e o proprio `work_items` — espelhar seria copiar dado que ja e nosso.
 * - `recortes`, que la guardava as dimensoes que escolhem as regras. Aqui as
 *   dimensoes ja existem como dado de primeira classe: empresa (com heranca de
 *   sub-marca) e tipo/formato do catalogo. Criar a tabela seria duplica-las.
 */
export const reviewRules = pgTable(
  "review_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /**
     * As camadas que se somam, nunca copiadas. Empresa nula = vale para todo
     * mundo. `skill`/`format` nulos = vale para qualquer tipo de peca. Copiar
     * a regra comum para cada recorte faz elas divergirem: alguem corrige numa
     * e esquece nas outras.
     */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    skill: text("skill"),
    format: text("format"),

    /** Codigo curto e estavel. E o que aparece no parecer e o que se contesta. */
    code: text("code").notNull(),
    text: text("text").notNull(),
    /** Por que a regra existe. Sem isso ela vira supersticao em seis meses. */
    rationale: text("rationale"),

    verifier: ruleVerifier("verifier").notNull(),
    /** Violou inegociavel, reprova. O resto vira ajuste. */
    isBlocking: boolean("is_blocking").notNull().default(false),

    /** O que a maquina procura. So faz sentido com `verifier = maquina`. */
    machineHint: text("machine_hint"),

    isActive: boolean("is_active").notNull().default(true),
    position: doublePrecision("position").notNull().default(1000),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("review_rules_org_code_unique").on(t.orgId, t.code),
    index("review_rules_scope_idx").on(t.orgId, t.companyId, t.skill),
  ],
);

/**
 * O checklist humano cobre so o que a maquina nao pega. Se pedir para a pessoa
 * conferir o que o robo ja confere, em duas semanas ela marca tudo no
 * automatico — e ai o checklist deixa de valer para o que ele era a unica
 * defesa.
 */
export const reviewChecklistItems = pgTable(
  "review_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    skill: text("skill"),

    text: text("text").notNull(),
    /** A regra que o item cobre, quando cobre uma. */
    ruleId: uuid("rule_id").references((): AnyPgColumn => reviewRules.id, {
      onDelete: "set null",
    }),

    /**
     * Excecao deliberada ao paragrafo acima: um ou dois itens que a maquina
     * tambem confere, para medir confiabilidade. Se a pessoa marcou "revisei a
     * ortografia" e a maquina achou tres erros, voce aprendeu algo sobre o
     * processo, nao sobre o texto.
     */
    isReliabilityProbe: boolean("is_reliability_probe").notNull().default(false),

    isActive: boolean("is_active").notNull().default(true),
    position: doublePrecision("position").notNull().default(1000),
  },
  (t) => [index("review_checklist_scope_idx").on(t.orgId, t.companyId, t.skill)],
);

/* ----------------------------------------------------- revisor: operacao */

/**
 * Uma rodada de revisao de uma entrega. A terceira tentativa e uma linha nova,
 * nao uma atualizacao da primeira — sem isso nao da para saber se melhorou.
 */
export const reviewCycles = pgTable(
  "review_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),

    /** 1, 2, 3... dentro da mesma entrega. */
    round: integer("round").notNull().default(1),

    status: cycleStatus("status").notNull().default("pendente"),
    verdict: cycleVerdict("verdict"),

    /**
     * O porteiro roda antes de gastar IA e devolve o que falta. `incompleto`
     * nao e reprovacao: e entrada que ainda nao da para julgar.
     */
    gateMissing: jsonb("gate_missing").$type<string[]>().notNull().default([]),

    /**
     * Modo silencioso: o sistema emite parecer e nao move nada. Antes de
     * deixar decidir, roda um periodo assim para calibrar contra o que uma
     * pessoa acharia — e a unica calibragem honesta.
     */
    isSilent: boolean("is_silent").notNull().default(true),

    /** Quem pediu. Nulo quando veio de gatilho automatico. */
    requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("review_cycles_item_round_unique").on(t.workItemId, t.round),
    index("review_cycles_status_idx").on(t.status, t.createdAt),
  ],
);

/**
 * O log tecnico que sustenta o assincrono. Existe desde o primeiro dia porque
 * adaptar depois significa reescrever o miolo.
 *
 * Falha tecnica **nunca vira veredito**: se a chamada falhou, se o modelo nao
 * respondeu, se acabaram as tentativas, o ciclo termina em `falhou` e alguem e
 * avisado. Aprovacao silenciosa por erro de rede e a falha mais perigosa que
 * um sistema desses pode ter, porque e invisivel — ninguem investiga o que
 * passou, so o que barrou.
 */
export const reviewRuns = pgTable(
  "review_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => reviewCycles.id, { onDelete: "cascade" }),

    attempt: integer("attempt").notNull().default(1),
    state: runState("state").notNull().default("na_fila"),

    /** Qual modelo respondeu. Muda com o tempo e o parecer precisa dizer. */
    model: text("model"),
    /** Custo separado por entrada e saida: os precos sao diferentes. */
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),

    error: text("error"),

    /**
     * Quem pegou a execucao e ate quando. Duas invocacoes do cron ao mesmo
     * tempo nao podem processar a mesma linha; a reserva expira para a
     * execucao nao ficar presa se o processo morrer no meio.
     */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),

    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("review_runs_cycle_attempt_unique").on(t.cycleId, t.attempt),
    index("review_runs_queue_idx").on(t.state, t.createdAt),
  ],
);

/**
 * Cada problema encontrado, sempre citando a regra que o originou. E o que
 * torna o parecer contestavel — sem a regra, vira opiniao de robo.
 */
export const reviewFindings = pgTable(
  "review_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => reviewCycles.id, { onDelete: "cascade" }),
    /**
     * `set null` e nao `cascade`: apagar uma regra nao pode apagar a historia
     * de quando ela foi aplicada. Por isso o texto tambem fica congelado aqui.
     */
    ruleId: uuid("rule_id").references(() => reviewRules.id, { onDelete: "set null" }),
    ruleCode: text("rule_code").notNull(),
    ruleText: text("rule_text").notNull(),

    /** O que foi visto, nas palavras do parecer. */
    detail: text("detail").notNull(),
    /** Onde: nome do arquivo, trecho, coordenada. Livre por tipo de peca. */
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),

    /** Veio de regra inegociavel — e o que decide reprovar. */
    isBlocking: boolean("is_blocking").notNull().default(false),

    /** O anexo em que o problema apareceu, quando e de um so. */
    attachmentId: uuid("attachment_id").references(() => attachments.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_findings_cycle_idx").on(t.cycleId)],
);

/** O que muda sem deploy: datas de corte, limites, chaves de comportamento. */
export const reviewSettings = pgTable(
  "review_settings",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] })],
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

export type ReviewRule = typeof reviewRules.$inferSelect;
export type ReviewChecklistItem = typeof reviewChecklistItems.$inferSelect;
export type ReviewCycle = typeof reviewCycles.$inferSelect;
export type ReviewRun = typeof reviewRuns.$inferSelect;
export type ReviewFinding = typeof reviewFindings.$inferSelect;
export type RuleVerifier = (typeof ruleVerifier.enumValues)[number];
export type CycleStatus = (typeof cycleStatus.enumValues)[number];
export type CycleVerdict = (typeof cycleVerdict.enumValues)[number];
export type RunState = (typeof runState.enumValues)[number];
