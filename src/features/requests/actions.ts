"use server";

import { revalidatePath } from "next/cache";
import { and, asc, count, eq, gte, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, companies, projects, workItemStages, workItems } from "@/db/schema";
import { isRequestType, type RequestType } from "@/lib/catalog";
import { QUESTIONS, itemTypeFor } from "@/lib/request-questions";
import { dueDateFromInput } from "@/lib/date";

export type RequestState = { error?: string; ok?: boolean };

function fail(message: string): RequestState {
  return { error: message };
}

/**
 * Esta action nao tem sessao. Quem pede a demanda nao e do time e nao tem
 * conta — por isso tudo que chega aqui e tratado como texto de estranho:
 * tamanho limitado, empresa conferida pelo slug, projeto conferido contra a
 * empresa, e nada entra no fluxo do time sem alguem aceitar antes.
 *
 * A trava contra enxurrada e por e-mail e janela de tempo. Nao segura um
 * atacante decidido; segura o formulario enviado seis vezes por engano e o
 * robo preguicoso, que e o que acontece de verdade num formulario interno.
 */
const MAX_PER_WINDOW = 5;
const WINDOW_MINUTES = 10;

const schema = z.object({
  slug: z.string().min(1).max(80),
  companyId: z.string().uuid("Escolha a empresa."),
  projectId: z.string().uuid().nullish(),
  requestType: z.string().min(1, "Escolha o tipo de demanda."),

  requesterName: z.string().trim().min(2, "Escreva seu nome.").max(120),
  requesterEmail: z.string().trim().email("E-mail inválido.").max(160),
  requesterPhone: z.string().trim().max(40).nullish(),

  title: z.string().trim().min(4, "Diga em uma linha o que você precisa.").max(200),
  objective: z.string().trim().min(10, "Explique para que serve.").max(4000),
  dueDate: z.string().nullish(),
  references: z.string().trim().max(4000).nullish(),
  notes: z.string().trim().max(4000).nullish(),

  /**
   * Campo escondido. Navegador nao preenche; robo preenche. Aceita qualquer
   * texto de proposito: recusar no schema devolveria erro de validacao e
   * contaria ao robo que ele foi pego.
   */
  website: z.string().max(200).optional(),

  briefing: z.record(z.string(), z.string().max(2000)).default({}),
});

export async function submitRequest(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const briefing: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("q_") && typeof value === "string" && value.trim()) {
      briefing[key.slice(2)] = value.trim();
    }
  }

  const parsed = schema.safeParse({
    slug: formData.get("slug"),
    companyId: formData.get("companyId"),
    projectId: text(formData, "projectId"),
    requestType: formData.get("requestType"),
    requesterName: formData.get("requesterName"),
    requesterEmail: formData.get("requesterEmail"),
    requesterPhone: text(formData, "requesterPhone"),
    title: formData.get("title"),
    objective: formData.get("objective"),
    dueDate: text(formData, "dueDate"),
    references: text(formData, "references"),
    notes: text(formData, "notes"),
    website: formData.get("website") ?? "",
    briefing,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "";
    return fail(/^[A-Z][a-z]+ input|Required/.test(message) ? "Faltou preencher algum campo." : message);
  }

  const data = parsed.data;

  // Robo preencheu o campo escondido. Responde ok para ele nao tentar de novo.
  if (data.website) return { ok: true };

  if (!isRequestType(data.requestType)) return fail("Tipo de demanda inválido.");
  const requestType: RequestType = data.requestType;

  try {
    // A empresa vem do link, e a escolhida tem que pertencer a essa raiz.
    const [root] = await db
      .select({ id: companies.id, orgId: companies.orgId })
      .from(companies)
      .where(and(eq(companies.slug, data.slug), eq(companies.isActive, true)))
      .limit(1);

    if (!root) return fail("Esse link não existe mais. Peça um novo ao time de marketing.");

    const [target] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(
        and(
          eq(companies.id, data.companyId),
          eq(companies.orgId, root.orgId),
          eq(companies.isActive, true),
          or(eq(companies.id, root.id), eq(companies.parentId, root.id)),
        ),
      )
      .limit(1);

    if (!target) return fail("Empresa inválida para este formulário.");

    if (data.projectId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, data.projectId), eq(projects.companyId, target.id)))
        .limit(1);
      if (!project) return fail("Esse projeto não é da empresa escolhida.");
    }

    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
    const [recent] = await db
      .select({ total: count() })
      .from(workItems)
      .where(
        and(
          eq(workItems.orgId, root.orgId),
          eq(workItems.requesterEmail, data.requesterEmail),
          gte(workItems.createdAt, since),
        ),
      );

    if ((recent?.total ?? 0) >= MAX_PER_WINDOW) {
      return fail("Você já enviou vários pedidos agora há pouco. Aguarde alguns minutos.");
    }

    const type = itemTypeFor(requestType);

    // Pipeline da organizacao; por empresa entra na V2.
    const [stage] = await db
      .select({ id: workItemStages.id })
      .from(workItemStages)
      .where(
        and(
          eq(workItemStages.orgId, root.orgId),
          eq(workItemStages.type, type),
          eq(workItemStages.kind, "backlog"),
          isNull(workItemStages.companyId),
        ),
      )
      .orderBy(asc(workItemStages.position))
      .limit(1);

    if (!stage) return fail("Não foi possível registrar agora. Avise o time de marketing.");

    // So guarda resposta de pergunta que existe para o tipo escolhido.
    const allowed = new Set(QUESTIONS[requestType].map((q) => q.key));
    const answers = Object.fromEntries(
      Object.entries(data.briefing).filter(([key]) => allowed.has(key)),
    );

    const missing = QUESTIONS[requestType]
      .filter((q) => q.required && !answers[q.key])
      .map((q) => q.label);
    if (missing.length > 0) return fail(`Faltou responder: ${missing.join(", ")}.`);

    const [created] = await db
      .insert(workItems)
      .values({
        orgId: root.orgId,
        companyId: target.id,
        projectId: data.projectId ?? null,
        type,
        title: data.title,
        description: data.objective,
        stageId: stage.id,
        // Quem pede nao define urgencia. A triagem define.
        priority: "media",
        dueDate: dueDateFromInput(data.dueDate ?? null),
        requesterName: data.requesterName,
        requesterEmail: data.requesterEmail,
        requesterPhone: data.requesterPhone ?? null,
        meta: {
          requestType,
          // Copia intocada do que a pessoa escreveu. A `description` e a
          // versao de trabalho, que o time molda; esta fica como registro.
          objective: data.objective,
          briefing: answers,
          references: data.references ?? null,
          notes: data.notes ?? null,
        },
      })
      .returning({ id: workItems.id });

    // Sem ator: nao ha sessao. O historico registra a origem.
    await db.insert(activityLog).values({
      orgId: root.orgId,
      workItemId: created.id,
      actorId: null,
      action: "item.requested",
      payload: { por: data.requesterName, tipo: requestType },
    });

    revalidatePath("/");
    revalidatePath("/trabalho");
    return { ok: true };
  } catch {
    return fail("Não foi possível enviar agora. Tente de novo em instantes.");
  }
}

function text(formData: FormData, name: string) {
  const raw = formData.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}
