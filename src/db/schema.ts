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
 * Escopo deste arquivo: MVP mais as rotinas da V1.5. Metas, coins e snapshot
 * entram nos blocos seguintes.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  smallint,
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

/**
 * O que a pessoa achou do parecer depois. Sem registrar isso nao existe taxa
 * de reversao — e a taxa de reversao e a metrica que decide se a ferramenta
 * fica ou sai.
 */
export const humanVerdict = pgEnum("review_human_verdict", ["concordou", "discordou"]);

/**
 * Como a semana da pessoa e medida.
 *
 * `pontos`: meta fixa em pontos por semana. `rotinas`: a meta e o que as
 * rotinas dela previam para aquela semana — quem faz story diario nao entrega
 * "pontos", entrega presenca, e cobrar pontos dessa pessoa mede a coisa errada.
 */
export const performanceRule = pgEnum("performance_rule", ["pontos", "rotinas"]);

/** Semana calculada espera gente; semana fechada nao muda mais sozinha. */
export const snapshotStatus = pgEnum("snapshot_status", ["pendente", "fechado"]);

/** De onde a coin veio. `semanal` e a unica que o sistema credita sozinho. */
export const coinEntryType = pgEnum("coin_entry_type", ["semanal", "ajuste", "gasto"]);

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

    /**
     * Nulo enquanto a pessoa foi convidada e ainda nao definiu a senha.
     * Quem cria a conta nunca escolhe a senha de ninguem: ela nasce vazia e
     * so a propria pessoa preenche, pelo link de convite.
     */
    passwordHash: text("password_hash"),

    /**
     * Guarda o **hash** do token, nunca o token. Se o banco vazar, o que
     * vazou nao abre conta nenhuma. O valor cru existe uma vez so, na tela de
     * quem convidou.
     */
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),

    /** Para a tela de pessoas distinguir "nunca entrou" de "parou de entrar". */
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    role: userRole("role").notNull().default("colaborador"),
    /** Valida fechamento de semana. Sempre checado no servidor. */
    isMaster: boolean("is_master").notNull().default(false),
    avatarUrl: text("avatar_url"),
    jobTitle: text("job_title"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_invite_idx").on(t.inviteTokenHash),
  ],
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

    /**
     * Identificador estavel da etapa. O `name` e livre e sera customizavel por
     * empresa; o slug nao muda, e e por ele que a cor, o icone e a regra de
     * papel sao encontrados em `lib/stages`. Slug desconhecido cai num cinza
     * neutro — falha visivel, nunca silenciosa.
     */
    slug: text("slug").notNull().default(""),

    kind: stageKind("kind").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    index("stages_scope_idx").on(t.orgId, t.type, t.companyId),
    /**
     * Duas etapas com o mesmo slug no mesmo pipeline padrao deixariam a cor e
     * a regra de papel ambiguas. O banco recusa em vez de o sistema escolher
     * uma em silencio. Parcial porque `company_id` nulo e o pipeline padrao —
     * em Postgres, nulos nao colidem entre si num indice unico comum.
     */
    uniqueIndex("stages_default_slug_unique")
      .on(t.orgId, t.type, t.slug)
      .where(sql`${t.companyId} is null`),
  ],
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

    /**
     * O texto **entregue** — legenda, roteiro, titulos do carrossel, CTA.
     *
     * Separado de `description` de proposito: aquela e o pedido de quem abriu
     * a tarefa. Julgar o briefing achando que e a peca faria o revisor apontar
     * erro de portugues no texto de quem pediu, e nenhuma correcao chegaria a
     * peca de verdade.
     */
    copy: text("copy"),

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

    /* ---------------------------------------- excecao de revisao automatica */

    /**
     * "Esta peca nao precisa de revisao automatica".
     *
     * E a UNICA porta que pula a esteira. Nasce sempre desmarcada e nunca vem
     * marcada por heranca: nem de template, nem de duplicacao, nem de import,
     * nem de automacao. Uma excecao herdada e uma excecao que ninguem decidiu.
     *
     * Marcada, a peca vai de "Em andamento" direto para "Aprovacao" — nunca
     * para "Publicar". Ela dispensa a maquina, jamais a pessoa.
     */
    reviewExempt: boolean("review_exempt").notNull().default(false),

    /** Motivo, da lista fechada em `lib/excecao`. Marcar sem motivo nao vale. */
    reviewExemptReason: text("review_exempt_reason"),

    /** So para o motivo "outro", e ai e obrigatorio. E o que o relatorio le. */
    reviewExemptNote: text("review_exempt_note"),

    /**
     * Qual das tres saidas foi: `declarada` (quem produz, antes da esteira) ou
     * `aprovacao_excecao` (o lider, depois de ela ter comecado).
     *
     * As duas usam o mesmo campo e medem coisas diferentes — uma diz se a
     * excecao virou atalho, a outra diz se a esteira esta atrapalhando. Guardar
     * as duas como "pulou a revisao" apagaria justamente a diferenca.
     */
    reviewExemptKind: text("review_exempt_kind"),

    /**
     * Quem marcou. E sempre alguem da lideranca: desde 01/09/2026 quem produz
     * nao marca, **pede**. Ver `reviewExemptRequestedById`.
     */
    reviewExemptById: uuid("review_exempt_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewExemptAt: timestamp("review_exempt_at", { withTimezone: true }),

    /* ------------------------------------------------ o pedido de excecao */

    /**
     * Quem pediu a excecao, quando quem pediu nao foi quem decidiu.
     *
     * Marcar a propria excecao e um poder que se auto-concede, e o campo mede
     * justamente se o time achou um atalho — quem mede nao pode ser quem usa. A
     * pessoa que produz escolhe o motivo e escreve a justificativa; a decisao e
     * de quem lidera. Quando o proprio lider marca direto, este campo fica nulo
     * e o pedido nunca existiu.
     *
     * Continua preenchido depois de aprovado: o relatorio precisa saber quem
     * pediu, nao so quem assinou embaixo.
     */
    reviewExemptRequestedById: uuid("review_exempt_requested_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewExemptRequestedAt: timestamp("review_exempt_requested_at", { withTimezone: true }),

    /**
     * A recusa, com motivo escrito.
     *
     * Recusa sem motivo e a mesma coisa que silencio, e silencio ensina o time
     * a parar de pedir — que nao e o mesmo que parar de precisar. Quem pediu
     * volta a peca para a esteira sabendo por que.
     *
     * Um pedido novo limpa estes tres campos: a recusa era daquele pedido.
     */
    reviewExemptDeniedById: uuid("review_exempt_denied_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewExemptDeniedAt: timestamp("review_exempt_denied_at", { withTimezone: true }),
    reviewExemptDeniedReason: text("review_exempt_denied_reason"),

    /**
     * A co-assinatura do lider, na aprovacao de uma peca marcada.
     *
     * Substitui o item "Li o laudo e assumo os pontos de atencao que sobraram",
     * que nao faz sentido quando nao existe laudo. Sem ela, quem aprova herda em
     * silencio a decisao de outra pessoa; com ela, assina junto.
     *
     * Mora aqui e nao em `review_checklist_answers` porque nao ha item de
     * checklist para responder: a linha e do proprio item, e inventar uma linha
     * falsa no catalogo para poder guardar a resposta seria mentir no schema.
     */
    reviewExemptCosignedById: uuid("review_exempt_cosigned_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewExemptCosignedAt: timestamp("review_exempt_cosigned_at", { withTimezone: true }),

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
    index("wi_exempt_idx").on(t.orgId, t.reviewExempt),
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

    /**
     * A regra de camada mais generica que esta aqui substitui.
     *
     * O conflito entre camadas e **declarado**, nunca adivinhado: duas regras
     * sobre o mesmo assunto nao tem como ser detectadas por texto, e um
     * sistema que tenta adivinhar acerta na demonstracao e erra em producao.
     * Declarada a sobreposicao, a mais especifica vence e o parecer registra
     * qual perdeu — conflito silencioso e bug.
     */
    overridesRuleId: uuid("overrides_rule_id").references((): AnyPgColumn => reviewRules.id, {
      onDelete: "set null",
    }),

    /** Sobe a cada edicao do texto. E o que o parecer cita como versao. */
    version: integer("version").notNull().default(1),

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

    /**
     * O item so faz sentido quando existe laudo.
     *
     * "Li o laudo e assumo os pontos de atencao que sobraram" e o caso: numa
     * peca marcada como sem revisao automatica nao ha laudo nenhum para ler, e
     * pedir que alguem marque isso ensina o time a marcar sem ler. Nessas
     * pecas o item some e no lugar entra a co-assinatura da excecao.
     */
    dependsOnReport: boolean("depends_on_report").notNull().default(false),

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
     * O que este parecer conferiu, congelado no momento em que rodou. Sem
     * isso ninguem sabe a cobertura de uma rodada depois que as regras
     * mudarem — e "o robo olhou tudo" e a suposicao que quebra a confianca no
     * dia em que ele nao olhou.
     */
    appliedRules: jsonb("applied_rules").$type<string[]>().notNull().default([]),

    /**
     * Regra que se aplicava e o revisor **nao teve como conferir**, com o
     * motivo. Fica visivel na tela de proposito: prometer cobertura que nao
     * existe faz cada lado achar que o outro esta olhando.
     */
    notVerified: jsonb("not_verified")
      .$type<Array<{ code: string; reason: string }>>()
      .notNull()
      .default([]),

    /**
     * Modo silencioso: o sistema emite parecer e nao move nada. Antes de
     * deixar decidir, roda um periodo assim para calibrar contra o que uma
     * pessoa acharia — e a unica calibragem honesta.
     */
    isSilent: boolean("is_silent").notNull().default(true),

    /**
     * Correcoes de portugues. Lista separada dos achados, e de proposito:
     * erro de virgula nao reprova entrega nenhuma. Vira conserto de trinta
     * segundos, nao veredito.
     */
    languageNotes: jsonb("language_notes")
      .$type<Array<{ trecho: string; correcao: string; tipo: string }>>()
      .notNull()
      .default([]),

    /**
     * Onde uma camada substituiu a outra neste parecer.
     *
     * Sem isto, a regra substituida simplesmente nao aparece na cobertura, e
     * quem le o parecer seis meses depois nao tem como saber se ela foi
     * trocada ou se nunca existiu. Conflito silencioso e bug.
     */
    overlaps: jsonb("overlaps")
      .$type<Array<{ winner: string; loser: string; applied: boolean; why: string }>>()
      .notNull()
      .default([]),

    /**
     * Impressao digital da entrada: a copy mais a versao das regras que se
     * aplicavam. Mesma entrada, mesmo parecer — reaproveita em vez de pagar a
     * chamada de novo e receber uma resposta ligeiramente diferente.
     */
    inputHash: text("input_hash"),
    reusedFromId: uuid("reused_from_id").references((): AnyPgColumn => reviewCycles.id, {
      onDelete: "set null",
    }),

    /**
     * Terceira reprovacao seguida: o sistema para de decidir e chama gente.
     * Ciclo infinito de IA reprovando e designer ajustando e pior que nao ter
     * revisao — cansa o time e o parecer vira ruido que se aprende a pular.
     */
    escalated: boolean("escalated").notNull().default(false),

    /**
     * O que a pessoa decidiu depois de ler o parecer. Preenchido quando alguem
     * tira o item de `ajustar` ou de `revisao_ia`.
     */
    humanVerdict: humanVerdict("human_verdict"),
    humanDecidedById: uuid("human_decided_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    humanDecidedAt: timestamp("human_decided_at", { withTimezone: true }),

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

/**
 * O que a pessoa respondeu no checklist, por entrega.
 *
 * Guardado por item e nao por ciclo: o checklist e da etapa de aprovacao, nao
 * da rodada de IA — a peca pode chegar la sem nunca ter passado pelo robo.
 */
export const reviewChecklistAnswers = pgTable(
  "review_checklist_answers",
  {
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => reviewChecklistItems.id, { onDelete: "cascade" }),

    checked: boolean("checked").notNull().default(false),

    answeredById: uuid("answered_by_id").references(() => users.id, { onDelete: "set null" }),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workItemId, t.itemId] })],
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

/* ------------------------------------------------------------ desempenho */

/**
 * A regua de cada pessoa. Uma linha por pessoa, e so quem tem meta aparece.
 *
 * **A meta de 120% e guardada, nao calculada.** Parece 1,2x a de 100% ate voce
 * conferir: 130 vira 156 e 80 vira 96, mas 60 vira 70 e nao 72. Sao numeros
 * negociados um a um, e derivar por formula reescreveria em silencio um acordo
 * que alguem fez com alguem.
 *
 * `metaSemanal` nulo significa **regua de rotinas**: a meta daquela semana e o
 * que as rotinas ativas previam, entao ela muda sozinha quando a grade muda e
 * nao ha numero fixo a guardar.
 *
 * Desativar, nunca apagar: o fechamento de marco cita a meta que valia em
 * marco, e apagar deixaria a historia apontando para o vazio.
 */
export const performanceGoals = pgTable(
  "performance_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    rule: performanceRule("rule").notNull().default("pontos"),

    /** Pontos por semana para 100%. Nulo quando a regua e de rotinas. */
    weeklyTarget: integer("weekly_target"),
    /** Pontos por semana para 120%. Guardado, nao derivado — ver acima. */
    weeklyTarget120: integer("weekly_target_120"),

    /**
     * Pontos por dia. Nulo desliga o placar diario para a pessoa.
     *
     * **Guardado, e nao `weeklyTarget / 5`.** Os numeros que a casa ja usa nao
     * sao divisiveis assim — no sistema antigo eram 26, 16, 16 e 6 por pessoa,
     * e o proprio arquivo registrava que sobem para 26 em dia de captacao de
     * manha. Derivar apagaria essa diferenca e passaria a cobrar de todo mundo
     * a mesma fatia da semana, que nao e como o trabalho acontece.
     *
     * Nulo, e nao zero: zero e uma meta de zero pontos, que qualquer um bate
     * sem fazer nada e que o placar mostraria como 100%.
     */
    dailyTarget: integer("daily_target"),

    /** Coins sugeridas ao bater cada faixa. O sistema sugere, alguem valida. */
    coinsAt100: smallint("coins_at_100").notNull().default(3),
    coinsAt120: smallint("coins_at_120").notNull().default(5),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Uma regua por pessoa. Duas linhas dariam dois fechamentos diferentes
    // para a mesma semana, e nenhum jeito de saber qual vale.
    uniqueIndex("performance_goal_user_unique").on(t.userId),
  ],
);

/**
 * O fechamento de uma semana.
 *
 * **Existe para congelar.** Sem ele, mexer numa tarefa de duas semanas atras
 * muda a pontuacao que ja foi paga — e coin pago nao se despaga. O snapshot e
 * a fotografia do que valia quando a semana fechou, e e ela que responde
 * qualquer pergunta sobre o passado.
 *
 * Nasce em `pendente`: o sistema calcula e **espera uma pessoa**. Fechar e ato
 * humano, com nome e hora, porque e o momento em que numero vira coin.
 */
export const weekSnapshots = pgTable(
  "week_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** `2026-W35`, pela ISO 8601. Ver `lib/week`. */
    weekId: text("week_id").notNull(),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),

    status: snapshotStatus("status").notNull().default("pendente"),

    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedById: uuid("closed_by_id").references(() => users.id, { onDelete: "set null" }),

    /** Toda edicao manual fica registrada: o que mudou, quem mudou, quando. */
    edits: jsonb("edits").$type<Array<Record<string, unknown>>>().notNull().default([]),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Uma semana fecha uma vez. Dois snapshots da mesma semana dariam duas
    // verdades sobre o mesmo passado.
    uniqueIndex("snapshot_org_week_unique").on(t.orgId, t.weekId),
  ],
);

/**
 * A linha de cada pessoa dentro do fechamento.
 *
 * **Os numeros sao copiados, nao referenciados** — de proposito. Meta, nome e
 * papel entram como estavam na hora do calculo. Se a meta de alguem mudar em
 * outubro, o fechamento de agosto continua contando a historia de agosto; se
 * apontasse para a tabela de metas, o passado mudaria sozinho toda vez que o
 * presente mudasse.
 *
 * `coinsValidated` nulo significa **ainda nao passou por uma pessoa**. E a
 * separacao mais importante desta tabela: o sistema sugere, alguem valida.
 */
export const snapshotEntries = pgTable(
  "snapshot_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => weekSnapshots.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Como estava na hora do calculo. */
    name: text("name").notNull(),
    jobTitle: text("job_title"),
    rule: performanceRule("rule").notNull(),

    points: integer("points").notNull().default(0),
    deliveries: integer("deliveries").notNull().default(0),
    /** Entregas concluidas sem ponto. O buraco, guardado tambem no passado. */
    withoutPoints: integer("without_points").notNull().default(0),

    /** Para a regua de rotinas: o que saiu sobre o que venceu. */
    routinesDone: integer("routines_done").notNull().default(0),
    routinesDue: integer("routines_due").notNull().default(0),

    weeklyTarget: integer("weekly_target"),
    weeklyTarget120: integer("weekly_target_120"),
    /** Nulo quando nao havia regua: diferente de zero por cento. */
    percent: integer("percent"),

    /** Posicao dentro do **mesmo grupo de regua**, nunca entre grupos. */
    position: integer("position"),

    coinsSuggested: smallint("coins_suggested").notNull().default(0),
    /** Nulo = ainda nao validado por uma pessoa. */
    coinsValidated: smallint("coins_validated"),

    note: text("note").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("snapshot_entry_unique").on(t.snapshotId, t.userId)],
);

/**
 * O extrato de coins. **Append-only**: nada aqui e editado nem apagado.
 *
 * Saldo e a soma das linhas, nunca um numero guardado. Numero guardado e
 * linhas guardadas divergem no primeiro erro, e a partir dai ninguem sabe qual
 * das duas mente. Somar sete linhas e barato; explicar um saldo que nao bate
 * com o proprio extrato, nao.
 *
 * `amount` negativo e gasto. Correcao de erro entra como linha nova de
 * `ajuste`, com o motivo escrito — nunca como edicao da linha errada, porque
 * apagar a historia e o que faz alguem perder a confianca no placar.
 */
export const coinLedger = pgTable(
  "coin_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** `2026-W35` quando a linha veio de um fechamento. Nulo em gasto e ajuste. */
    weekId: text("week_id"),

    type: coinEntryType("type").notNull(),
    amount: integer("amount").notNull(),
    description: text("description").notNull().default(""),

    /** Quem lancou. Nulo so quando a pessoa foi removida do sistema depois. */
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Uma semana credita uma vez por pessoa. E a linha de defesa que impede o
     * acidente mais caro do sistema: fechar a mesma semana duas vezes e pagar
     * em dobro. Parcial de proposito — gasto e ajuste podem repetir a vontade.
     */
    uniqueIndex("coin_ledger_weekly_unique")
      .on(t.userId, t.weekId)
      .where(sql`${t.type} = 'semanal'`),
    index("coin_ledger_user_idx").on(t.userId, t.createdAt),
  ],
);

/* ----------------------------------------------------------------- tipos */

/* --------------------------------------------------------------- rotinas */

/**
 * Rotina de publicacao: o que deveria sair, em que plataforma, em que dias.
 *
 * **Nao e entidade paralela.** Ela e um gerador: cada ocorrencia vira um
 * `work_items` de verdade, com responsavel, prazo, cronometro e historico
 * como qualquer outro. A grade semanal e uma leitura desses itens, nao um
 * mundo separado com regra propria.
 *
 * `weekdays` guarda 0 a 6 com **segunda = 0**, igual a `lib/month`. Story
 * diario e uma linha com os sete dias, nao sete linhas.
 */
export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    /** Instagram, TikTok, LinkedIn, YouTube. Texto livre: a lista muda sozinha. */
    platform: text("platform").notNull(),
    /** O que sai: "Reels", "Carrossel", "Story". Vira o titulo da tarefa. */
    label: text("label").notNull(),

    weekdays: jsonb("weekdays").$type<number[]>().notNull().default([]),

    /** Quem costuma fazer. A ocorrencia nasce com esta pessoa. */
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),

    /** Desativar, nunca apagar: a rotina antiga explica a ocorrencia antiga. */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("routines_company_idx").on(t.companyId, t.isActive)],
);

/**
 * Uma ocorrencia por rotina e por dia.
 *
 * O indice unico e o que torna a geracao idempotente: rodar duas vezes no
 * mesmo dia nao duplica nada, entao o gerador pode rodar na leitura da tela,
 * sem cron e sem fila.
 *
 * `publishedAt` e o unico estado guardado. "Previsto" e "atrasado" saem da
 * data comparada com hoje — guardar isso viraria linha que envelhece sozinha
 * e precisa de alguem para corrigir.
 */
export const routineOccurrences = pgTable(
  "routine_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),

    /** Dia previsto, em BRT, no formato YYYY-MM-DD. */
    day: date("day").notNull(),

    /** A tarefa gerada. Nula so se a criacao falhar no meio. */
    workItemId: uuid("work_item_id").references(() => workItems.id, { onDelete: "set null" }),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedById: uuid("published_by_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("occurrence_routine_day_unique").on(t.routineId, t.day),
    index("occurrence_day_idx").on(t.day),
  ],
);

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

export type Routine = typeof routines.$inferSelect;
export type RoutineOccurrence = typeof routineOccurrences.$inferSelect;

export type ReviewRule = typeof reviewRules.$inferSelect;
export type ReviewChecklistItem = typeof reviewChecklistItems.$inferSelect;
export type ReviewCycle = typeof reviewCycles.$inferSelect;
export type ReviewRun = typeof reviewRuns.$inferSelect;
export type ReviewFinding = typeof reviewFindings.$inferSelect;
export type ReviewChecklistAnswer = typeof reviewChecklistAnswers.$inferSelect;
export type HumanVerdict = (typeof humanVerdict.enumValues)[number];
export type RuleVerifier = (typeof ruleVerifier.enumValues)[number];
export type CycleStatus = (typeof cycleStatus.enumValues)[number];
export type CycleVerdict = (typeof cycleVerdict.enumValues)[number];
export type RunState = (typeof runState.enumValues)[number];
