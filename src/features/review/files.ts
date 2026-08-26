import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, type Attachment } from "@/db/schema";
import { signedUrl } from "@/lib/storage";
import { extensionOf, isImage, mimeFor } from "@/lib/upload-rules";
import type { Block } from "./model";

/**
 * A leitura dos arquivos entregues — **desligada nesta versão**.
 *
 * Esta versão do revisor julga texto. O caminho abaixo funciona e está
 * testado (imagem e PDF chegam ao modelo em base64), e fica guardado atrás de
 * `REVIEW_READ_FILES=1` porque religar é ajustar o prompt, não reescrever o
 * download, o teto de bytes e o tratamento do que não dá para ler.
 *
 * Ligar isso sem ter regra escrita sobre peça visual só encareceria o parecer
 * sem mudar nenhuma conclusão.
 */

/** Teto de arquivos por parecer. Acima disso o custo cresce e a atenção cai. */
const MAX_FILES = 6;

/**
 * Teto de bytes mandados ao modelo por rodada. O upload já para em 4MB por
 * arquivo; isto aqui é o teto da soma, para seis anexos não virarem um pedido
 * de 24MB que estoura no meio.
 */
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

export type Loaded = {
  blocks: Block[];
  sent: string[];
  skipped: Array<{ name: string; why: string }>;
};

export async function filesOf(workItemId: string): Promise<Attachment[]> {
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.workItemId, workItemId), eq(attachments.kind, "file")));
}

/**
 * Baixa os anexos e transforma no que o modelo consegue ler.
 *
 * O que ele não consegue ler não vira problema nem é escondido: entra na lista
 * de ignorados, que aparece no parecer. Peça não lida virando "nenhum problema
 * encontrado" é a falha invisível deste sistema.
 */
export async function loadFiles(files: Attachment[]): Promise<Loaded> {
  const blocks: Block[] = [];
  const sent: string[] = [];
  const skipped: Array<{ name: string; why: string }> = [];
  let total = 0;

  for (const file of files) {
    if (sent.length >= MAX_FILES) {
      skipped.push({ name: file.filename, why: `acima do limite de ${MAX_FILES} arquivos` });
      continue;
    }

    const extension = extensionOf(file.filename);
    const readable = isImage(file.filename) || extension === "pdf";

    if (!readable) {
      skipped.push({ name: file.filename, why: `o revisor não lê arquivo .${extension || "?"}` });
      continue;
    }

    const url = await signedUrl(file.storageKey, 300);
    if (!url) {
      skipped.push({ name: file.filename, why: "não foi possível gerar o link do arquivo" });
      continue;
    }

    const response = await fetch(url);
    if (!response.ok) {
      skipped.push({ name: file.filename, why: `download falhou (${response.status})` });
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (total + bytes.length > MAX_TOTAL_BYTES) {
      skipped.push({ name: file.filename, why: "a soma dos arquivos passou do teto da rodada" });
      continue;
    }
    total += bytes.length;

    const data = bytes.toString("base64");
    const mime = file.mimeType || mimeFor(file.filename);

    blocks.push({ type: "text", text: `Arquivo: ${file.filename}` });
    blocks.push(
      extension === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: mime, data } },
    );
    sent.push(file.filename);
  }

  return { blocks, sent, skipped };
}
