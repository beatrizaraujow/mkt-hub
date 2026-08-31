"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLog,
  checklistItems,
  comments,
  projects,
  workItemStages,
  workItems,
} from "@/db/schema";
import { assertCompanyAccess, requireUserAction, type CurrentUser } from "@/lib/auth";
import { dueDateFromInput } from "@/lib/date";
import { isFormat, isSkill } from "@/lib/catalog";
import { canLeaveStage, leaveDeniedMessage, presentationFor } from "@/lib/stages";
import { pendingChecklist } from "@/features/review/checklist";
import { REASON_MAX, REASON_MIN, needsReason } from "./rework";
import {
  FIX_STAGE,
  onEnterReviewStage,
  recordHumanDecision,
  REVIEW_STAGE,
} from "./review-bridge";

export type ActionState = { error?: string; ok?: boolean; id?: string };

function fail(message: string): ActionState {
  return { error: message };
}

/** Toda mudanca vira linha de historico. Sem excecao. */
async function log(
  orgId: string,
  workItemId: string,
  actorId: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  await db.insert(activityLog).values({ orgId, workItemId, actorId, action, payload });
}

/** Carrega o item e confere se a pessoa pode mexer nele. */
async function loadItem(user: CurrentUser, id: string) {
  const [item] = await db
    .select()
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.orgId, user.orgId)))
    .limit(1);

  if (!item) throw new Error("Tarefa não encontrada.");
  assertCompanyAccess(user, item.companyId);
  return item;
}

async function stagesOf(orgId: string, type: "task" | "content" | "capture") {
  return db
    .select()
    .from(workItemStages)
    .where(and(eq(workItemStages.orgId, orgId), eq(workItemStages.type, type)))
    .orderBy(asc(workItemStages.position));
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/trabalho");
}

/* ------------------------------------------------------------------ criar */

const createSchema = z.object({
  title: z.string().trim().min(2, "Escreva um título.").max(200, "Título muito longo."),
  companyId: z.string().uuid("Escolha a empresa."),
  projectId: z.string().uuid().nullish(),
  assigneeId: z.string().uuid().nullish(),
  dueDate: z.string().nullish(),
  priority: z.enum(["urgente", "alta", "media", "baixa"]).default("media"),
  type: z.enum(["task", "content", "capture"]).default("task"),
  skill: z.string().nullish(),
  format: z.string().nullish(),
  points: z.coerce.number().int().min(0).max(100).nullish(),
  description: z.string().nullish(),
});

function value(formData: FormData, name: string) {
  const raw = formData.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export async function createWorkItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUserAction();

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    companyId: value(formData, "companyId"),
    projectId: value(formData, "projectId"),
    assigneeId: value(formData, "assigneeId"),
    dueDate: value(formData, "dueDate"),
    priority: value(formData, "priority") ?? undefined,
    type: value(formData, "type") ?? undefined,
    skill: value(formData, "skill"),
    format: value(formData, "format"),
    points: value(formData, "points"),
    description: value(formData, "description"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "";
    return fail(/^[A-Z][a-z]+ input/.test(message) ? "Dados inválidos." : message);
  }

  const data = parsed.data;

  try {
    assertCompanyAccess(user, data.companyId);

    if (data.skill && !isSkill(data.skill)) return fail("Tipo de trabalho inválido.");
    if (data.format && !isFormat(data.format)) return fail("Formato inválido.");

    const stages = await stagesOf(user.orgId, data.type);
    // Criacao manual entra em "Pendente". "Solicitado" e a porta do formulario.
    const target = stages.find((s) => s.kind === "todo") ?? stages[0];
    if (!target) return fail("Nenhum estágio configurado para esse tipo.");

    // Projeto precisa ser da empresa escolhida — senão a tarefa nasce
    // pendurada em duas empresas ao mesmo tempo.
    if (data.projectId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, data.projectId), eq(projects.companyId, data.companyId)))
        .limit(1);
      if (!project) return fail("Esse projeto não é da empresa escolhida.");
    }

    const [created] = await db
      .insert(workItems)
      .values({
        orgId: user.orgId,
        companyId: data.companyId,
        projectId: data.projectId ?? null,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        stageId: target.id,
        priority: data.priority,
        assigneeId: data.assigneeId ?? user.id,
        createdById: user.id,
        dueDate: dueDateFromInput(data.dueDate),
        skill: data.skill ?? null,
        format: data.format ?? null,
        points: data.points ?? null,
      })
      .returning({ id: workItems.id });

    await log(user.orgId, created.id, user.id, "item.created", { title: data.title });

    refresh();
    return { ok: true, id: created.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível criar a tarefa.");
  }
}

/* ---------------------------------------------------------------- alterar */

export async function setStage(
  id: string,
  stageId: string,
  reason?: string | null,
): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    const item = await loadItem(user, id);

    const stages = await stagesOf(user.orgId, item.type);
    const target = stages.find((s) => s.id === stageId);
    if (!target) return fail("Estágio inválido para esse tipo de item.");

    const from = stages.find((s) => s.id === item.stageId);
    if (from?.id === target.id) return { ok: true };

    /**
     * O aval final é da liderança, e a trava é aqui.
     *
     * A tela também não oferece o arrasto, mas isso é conforto: quem chama a
     * action direto, ou arrasta antes da tela saber do papel, bate nesta
     * linha. Esconder o botão no cliente é experiência, nunca segurança.
     */
    if (!canLeaveStage(user.role, from?.slug)) {
      return fail(leaveDeniedMessage(from?.slug));
    }

    // A tela pergunta antes; aqui e a trava, nao o aviso.
    const clean = reason?.trim() ?? "";
    if (needsReason(from, target)) {
      if (clean.length < REASON_MIN) return fail("Escreva o motivo de voltar a tarefa.");
      if (clean.length > REASON_MAX) return fail("Motivo muito longo.");
    }

    const forward = from ? target.position > from.position : true;

    /**
     * O checklist da aprovacao trava a saida para frente, e so para frente.
     *
     * Mandar a peca de volta para ajuste nao precisa de checklist respondido —
     * quem devolveu ja viu o que estava errado. Exigir ali so ensinaria o time
     * a marcar tudo para conseguir devolver.
     */
    if (from?.slug === "aprovacao" && forward) {
      const faltam = await pendingChecklist(item);
      if (faltam > 0) {
        return fail(
          faltam === 1
            ? "Falta 1 item do checklist de aprovação."
            : `Faltam ${faltam} itens do checklist de aprovação.`,
        );
      }
    }

    await db
      .update(workItems)
      .set({
        stageId: target.id,
        // Concluir e sair de concluido sao a mesma acao vista de dois lados.
        completedAt: target.kind === "done" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(workItems.id, id));

    await log(user.orgId, id, user.id, "item.stage_changed", {
      de: from?.name ?? null,
      para: target.name,
      ...(needsReason(from, target) ? { motivo: clean } : {}),
    });

    /**
     * O revisor entra aqui, e so aqui: a etapa e o gatilho.
     *
     * Chamar do cliente daria duas portas para a mesma coisa, e a segunda
     * porta e sempre a que esquece de validar alguma coisa.
     */
    if (target.slug === REVIEW_STAGE) {
      await onEnterReviewStage(item, user.id);
    }

    // Saiu da revisao ou do ajuste pela mao de alguem: e a resposta ao parecer.
    if (from?.slug === REVIEW_STAGE || from?.slug === FIX_STAGE) {
      await recordHumanDecision(id, user.id, forward);
    }

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível mover a tarefa.");
  }
}

/** Botao de concluir: leva para o estagio final do tipo. */
export async function completeWorkItem(id: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    const item = await loadItem(user, id);
    const stages = await stagesOf(user.orgId, item.type);
    /**
     * A etapa terminal é o arquivo do que já rodou, não o destino de
     * "concluir" — sem esta exclusão, o botão jogaria a peça direto para o
     * banco de criativos e pularia a etapa em que ela é entregue.
     */
    const done = stages.find((s) => s.kind === "done" && !presentationFor(s.slug)?.terminal);
    if (!done) return fail("Esse tipo não tem estágio de conclusão.");
    return setStage(id, done.id);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível concluir.");
  }
}

/** Desfaz a conclusao: volta para "Em andamento". */
export async function reopenWorkItem(id: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    const item = await loadItem(user, id);
    const stages = await stagesOf(user.orgId, item.type);
    const back = stages.find((s) => s.kind === "doing") ?? stages.find((s) => s.kind === "todo");
    if (!back) return fail("Esse tipo não tem estágio para reabrir.");
    return setStage(id, back.id);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível reabrir.");
  }
}

export async function setAssignee(id: string, assigneeId: string | null): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    await db
      .update(workItems)
      .set({ assigneeId, updatedAt: new Date() })
      .where(eq(workItems.id, id));

    await log(user.orgId, id, user.id, "item.assignee_changed", { para: assigneeId });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível trocar o responsável.");
  }
}

export async function setDueDate(id: string, dueDate: string | null): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    await db
      .update(workItems)
      .set({ dueDate: dueDateFromInput(dueDate), updatedAt: new Date() })
      .where(eq(workItems.id, id));

    await log(user.orgId, id, user.id, "item.due_changed", { para: dueDate });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível mudar o prazo.");
  }
}

const prioritySchema = z.enum(["urgente", "alta", "media", "baixa"]);

export async function setPriority(id: string, priority: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    const parsed = prioritySchema.safeParse(priority);
    if (!parsed.success) return fail("Prioridade inválida.");

    await db
      .update(workItems)
      .set({ priority: parsed.data, updatedAt: new Date() })
      .where(eq(workItems.id, id));

    await log(user.orgId, id, user.id, "item.priority_changed", { para: parsed.data });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível mudar a prioridade.");
  }
}

/** Apagar de verdade, com o historico junto. So quem criou ou quem gerencia. */
export async function deleteWorkItem(id: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();

    /*
     * Chamado pelo que ele garante, nao pelo que devolve: `loadItem` recusa
     * tarefa de fora da organizacao e de empresa fora do alcance da pessoa.
     * Tirar esta linha deixaria o master apagar tarefa de empresa que ele nem
     * enxerga.
     */
    await loadItem(user, id);

    /*
     * Excluir e a unica acao do sistema que apaga trabalho sem deixar rastro:
     * some a tarefa, o tempo lancado nela, os comentarios e o historico. As
     * outras "destruicoes" da casa desativam em vez de apagar, justamente por
     * isso — regra do revisor, pessoa no Time, rotina.
     *
     * Por decisao de 31/08/2026, so o **admin master** exclui. Antes bastava
     * ter criado a tarefa, ou ser gestor: sete pessoas com poder de apagar
     * historico e, na pratica, sete chances de perde-lo por engano.
     *
     * `isMaster` e nao `role`: papel e o teto de acesso, e admin existe mais de
     * um. Master e o marcador de quem responde pelo que nao volta — e ja era o
     * criterio para fechar a semana e creditar coin.
     */
    if (!user.isMaster) {
      return fail("Só o admin master pode excluir tarefa. Peça a quem administra o sistema.");
    }

    const children = await db
      .select({ id: workItems.id })
      .from(workItems)
      .where(eq(workItems.parentId, id));

    if (children.length) {
      await db.delete(workItems).where(
        inArray(
          workItems.id,
          children.map((c) => c.id),
        ),
      );
    }

    await db.delete(workItems).where(eq(workItems.id, id));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível excluir.");
  }
}

/* ------------------------------------------------------ conteudo do item */

export async function setTitle(id: string, title: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    const clean = title.trim();
    if (clean.length < 2) return fail("Escreva um título.");
    if (clean.length > 200) return fail("Título muito longo.");

    await db.update(workItems).set({ title: clean, updatedAt: new Date() }).where(eq(workItems.id, id));
    await log(user.orgId, id, user.id, "item.title_changed", { para: clean });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível renomear.");
  }
}

/**
 * A copy entregue — o texto que vai ser publicado.
 *
 * Separada do briefing de proposito: e a unica coisa que a revisao automatica
 * le. Colar a peca no campo de descricao faria o revisor apontar erro no
 * pedido de quem abriu a tarefa, e nenhuma correcao chegaria a peca.
 */
export async function setCopy(id: string, copy: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    const clean = copy.trim();
    await db
      .update(workItems)
      .set({ copy: clean || null, updatedAt: new Date() })
      .where(eq(workItems.id, id));

    await log(user.orgId, id, user.id, "item.copy_changed");
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Nao foi possivel salvar a copy.");
  }
}

export async function setDescription(id: string, description: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    const clean = description.trim();
    await db
      .update(workItems)
      .set({ description: clean || null, updatedAt: new Date() })
      .where(eq(workItems.id, id));

    await log(user.orgId, id, user.id, "item.description_changed");
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível salvar a descrição.");
  }
}

/** Ponto de atividade MKT — a moeda de pontuacao do time. */
export async function setPoints(id: string, points: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    const clean = points.trim();
    const value = clean === "" ? null : Number(clean);

    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 100)) {
      return fail("Ponto precisa ser um número inteiro entre 0 e 100.");
    }

    await db.update(workItems).set({ points: value, updatedAt: new Date() }).where(eq(workItems.id, id));
    await log(user.orgId, id, user.id, "item.points_changed", { para: value });
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível mudar o ponto.");
  }
}

export async function setSkill(id: string, skill: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);
    if (skill && !isSkill(skill)) return fail("Tipo de trabalho inválido.");

    await db
      .update(workItems)
      .set({ skill: skill || null, updatedAt: new Date() })
      .where(eq(workItems.id, id));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível mudar o tipo.");
  }
}

export async function setFormat(id: string, format: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);
    if (format && !isFormat(format)) return fail("Formato inválido.");

    await db
      .update(workItems)
      .set({ format: format || null, updatedAt: new Date() })
      .where(eq(workItems.id, id));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível mudar o formato.");
  }
}

/* -------------------------------------------------------------- checklist */

export async function addChecklistItem(id: string, text: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    const clean = text.trim();
    if (!clean) return fail("Escreva o item.");

    const [last] = await db
      .select({ position: checklistItems.position })
      .from(checklistItems)
      .where(eq(checklistItems.workItemId, id))
      .orderBy(desc(checklistItems.position))
      .limit(1);

    await db.insert(checklistItems).values({
      workItemId: id,
      text: clean,
      position: (last?.position ?? 0) + 1000,
    });

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível adicionar.");
  }
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<ActionState> {
  try {
    const user = await requireUserAction();

    const [row] = await db
      .select({ workItemId: checklistItems.workItemId })
      .from(checklistItems)
      .where(eq(checklistItems.id, itemId))
      .limit(1);

    if (!row) return fail("Item não encontrado.");
    await loadItem(user, row.workItemId);

    await db.update(checklistItems).set({ isDone: done }).where(eq(checklistItems.id, itemId));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível marcar.");
  }
}

export async function removeChecklistItem(itemId: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();

    const [row] = await db
      .select({ workItemId: checklistItems.workItemId })
      .from(checklistItems)
      .where(eq(checklistItems.id, itemId))
      .limit(1);

    if (!row) return { ok: true };
    await loadItem(user, row.workItemId);

    await db.delete(checklistItems).where(eq(checklistItems.id, itemId));
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível remover.");
  }
}

/* ----------------------------------------------------------- comentarios */

export async function addComment(id: string, body: string): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    await loadItem(user, id);

    const clean = body.trim();
    if (!clean) return fail("Escreva alguma coisa.");
    if (clean.length > 4000) return fail("Comentário muito longo.");

    await db.insert(comments).values({ workItemId: id, authorId: user.id, body: clean });
    await log(user.orgId, id, user.id, "comment.created");
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível comentar.");
  }
}

/* ------------------------------------------------------------- subtarefas */

/**
 * Empresa, projeto e tipo de pipeline vêm sempre do pai — subtarefa de outra
 * empresa não existe. O resto é escolha: quem faz, para quando, prioridade,
 * ponto, tipo e formato. Quando o campo não vem, herda do pai, que é o que
 * acontece se a pessoa só digitar o título e apertar Enter.
 */
const subtaskSchema = z.object({
  title: z.string().trim().min(2, "Escreva o título da subtarefa.").max(200, "Título muito longo."),
  assigneeId: z.string().uuid().nullish(),
  dueDate: z.string().nullish(),
  priority: z.enum(["urgente", "alta", "media", "baixa"]).nullish(),
  points: z.coerce.number().int().min(0).max(100).nullish(),
  skill: z.string().nullish(),
  format: z.string().nullish(),
});

export type SubtaskInput = z.input<typeof subtaskSchema>;

export async function addSubtask(parentId: string, input: SubtaskInput): Promise<ActionState> {
  const parsed = subtaskSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "";
    return fail(/^[A-Z][a-z]+ input/.test(message) ? "Dados inválidos." : message);
  }

  const data = parsed.data;

  try {
    const user = await requireUserAction();
    const parent = await loadItem(user, parentId);

    if (parent.parentId) return fail("Subtarefa de subtarefa não existe. Um nível basta.");

    if (data.skill && !isSkill(data.skill)) return fail("Tipo de trabalho inválido.");
    if (data.format && !isFormat(data.format)) return fail("Formato inválido.");

    const stages = await stagesOf(user.orgId, parent.type);
    const target = stages.find((s) => s.kind === "todo") ?? stages[0];
    if (!target) return fail("Nenhum estágio configurado para esse tipo.");

    const [created] = await db
      .insert(workItems)
      .values({
        orgId: user.orgId,
        companyId: parent.companyId,
        projectId: parent.projectId,
        parentId: parent.id,
        type: parent.type,
        title: data.title,
        stageId: target.id,
        priority: data.priority ?? parent.priority,
        assigneeId: data.assigneeId ?? parent.assigneeId,
        createdById: user.id,
        // `dueDate` ausente herda; vindo vazio, a subtarefa fica sem prazo.
        dueDate: data.dueDate === undefined ? parent.dueDate : dueDateFromInput(data.dueDate),
        points: data.points ?? null,
        skill: data.skill ?? null,
        format: data.format ?? null,
      })
      .returning({ id: workItems.id });

    await log(user.orgId, parent.id, user.id, "subtask.created", { title: data.title });
    refresh();
    return { ok: true, id: created.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível criar a subtarefa.");
  }
}
