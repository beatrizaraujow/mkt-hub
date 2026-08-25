/**
 * Regras de upload, compartilhadas entre servidor e navegador.
 *
 * Mora fora do `storage.ts` de propósito: aquele arquivo é `server-only` por
 * causa da chave service_role, e o formulário precisa recusar arquivo grande
 * ou de tipo errado ANTES de subir. Uma lista só, checada dos dois lados.
 */

/**
 * Teto do corpo de uma server action.
 *
 * O Next corta em 1MB por padrão — por isso o `serverActions.bodySizeLimit`
 * no `next.config.ts` — e a Vercel corta o request em 4.5MB. 4MB é o maior
 * valor que passa nos dois. Acima disso o caminho é link.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

/** O que ganha miniatura no card em vez de virar linha com ícone. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

/**
 * `svg` ficou de fora: aberto em aba nova ele executa script no domínio do
 * storage, e arte do time não precisa de svg.
 */
export const ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "md",
  "zip",
  "rar",
] as const;

/** Valor do `accept` do input, montado da mesma lista. */
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function extensionOf(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function isAllowedFile(filename: string) {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

export function isImage(filename: string) {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  zip: "application/zip",
  rar: "application/vnd.rar",
};

/**
 * O navegador nem sempre manda `file.type`. Antes o fallback era
 * `application/${extensao}`, que produz coisas como `application/jpg` — tipo
 * que não existe e que atrapalha na hora de decidir preview.
 */
export function mimeFor(filename: string, reported?: string) {
  if (reported) return reported;
  return MIME_BY_EXTENSION[extensionOf(filename)] ?? "application/octet-stream";
}

export const UPLOAD_ERRORS = {
  empty: "Escolha um arquivo.",
  tooBig: `Arquivo acima de ${MAX_UPLOAD_MB}MB. Suba no Drive e cole o link aqui.`,
  badType: "Tipo de arquivo não aceito. Imagem, documento, planilha, texto, md ou zip.",
} as const;

/**
 * Mesma checagem no navegador e no servidor, para não existirem dois textos
 * diferentes para o mesmo erro. No cliente evita a espera do upload inteiro
 * para levar não; no servidor é o que vale, porque cliente se contorna.
 */
export function checkFile(file: { name: string; size: number }): string | null {
  if (!file.size) return UPLOAD_ERRORS.empty;
  if (file.size > MAX_UPLOAD_BYTES) return UPLOAD_ERRORS.tooBig;
  if (!isAllowedFile(file.name)) return UPLOAD_ERRORS.badType;
  return null;
}
