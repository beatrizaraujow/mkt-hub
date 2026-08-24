"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, workItems } from "@/db/schema";
import { assertCompanyAccess, requireUserAction, type CurrentUser } from "@/lib/auth";
import {
  MAX_UPLOAD_BYTES,
  deleteFile,
  ensureBucket,
  extensionOf,
  isAllowedFile,
  signedUrl,
  storageConfigured,
  uploadFile,
} from "@/lib/storage";

export type AttachState = { error?: string; ok?: boolean };

function fail(message: string): AttachState {
  return { error: message };
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/trabalho");
}

async function loadItem(user: CurrentUser, id: string) {
  const [item] = await db
    .select({ id: workItems.id, companyId: workItems.companyId })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.orgId, user.orgId)))
    .limit(1);

  if (!item) throw new Error("Tarefa não encontrada.");
  assertCompanyAccess(user, item.companyId);
  return item;
}

/* ------------------------------------------------------------------ links */

export async function addLink(
  workItemId: string,
  rawUrl: string,
  label: string,
): Promise<AttachState> {
  try {
    const user = await requireUserAction();
    const item = await loadItem(user, workItemId);

    const value = rawUrl.trim();
    if (!value) return fail("Cole o link.");

    let parsed: URL;
    try {
      parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    } catch {
      return fail("Link inválido.");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fail("Só link http ou https.");
    }

    await db.insert(attachments).values({
      workItemId: item.id,
      companyId: item.companyId,
      uploadedById: user.id,
      kind: "link",
      filename: label.trim() || parsed.hostname.replace(/^www\./, ""),
      url: parsed.toString(),
    });

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível adicionar o link.");
  }
}

/* --------------------------------------------------------------- arquivos */

export async function uploadAttachment(
  workItemId: string,
  formData: FormData,
): Promise<AttachState> {
  try {
    const user = await requireUserAction();
    const item = await loadItem(user, workItemId);

    if (!storageConfigured()) {
      return fail(
        "Guardar arquivo ainda não está ligado. Enquanto isso, use link — funciona normalmente.",
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Escolha um arquivo.");

    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(
        `Arquivo acima de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB. Suba no Drive e cole o link aqui.`,
      );
    }

    if (!isAllowedFile(file.name)) {
      return fail("Tipo de arquivo não aceito. Imagem, documento, planilha, texto, md ou zip.");
    }

    await ensureBucket();

    // Caminho previsível e sem colisão: empresa/tarefa/timestamp-nome.
    const safeName = file.name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(-80);
    const path = `${item.companyId}/${item.id}/${Date.now()}-${safeName}`;

    await uploadFile(path, file);

    await db.insert(attachments).values({
      workItemId: item.id,
      companyId: item.companyId,
      uploadedById: user.id,
      kind: "file",
      filename: file.name,
      mimeType: file.type || `application/${extensionOf(file.name)}`,
      sizeBytes: file.size,
      storageKey: path,
    });

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível anexar.");
  }
}

/** Link de download com validade curta. O bucket é privado. */
export async function getDownloadUrl(attachmentId: string): Promise<string | null> {
  const user = await requireUserAction();

  const [row] = await db
    .select({ storageKey: attachments.storageKey, companyId: attachments.companyId })
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);

  if (!row || !row.storageKey) return null;
  assertCompanyAccess(user, row.companyId);

  return signedUrl(row.storageKey);
}

export async function removeAttachment(attachmentId: string): Promise<AttachState> {
  try {
    const user = await requireUserAction();

    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!row) return { ok: true };
    assertCompanyAccess(user, row.companyId);

    // Apaga o registro primeiro: um arquivo órfão no bucket é menos ruim que
    // uma linha apontando para um arquivo que não existe mais.
    await db.delete(attachments).where(eq(attachments.id, attachmentId));

    if (row.kind === "file" && row.storageKey && storageConfigured()) {
      await deleteFile(row.storageKey).catch(() => {});
    }

    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível remover.");
  }
}
