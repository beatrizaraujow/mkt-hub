import "server-only";

/**
 * Supabase Storage pela API REST, sem SDK.
 *
 * O SDK traria dependência, versionamento e um cliente inteiro para usar três
 * chamadas: subir, assinar e apagar. Aqui é `fetch`.
 *
 * Precisa de duas variáveis:
 *   SUPABASE_URL          https://<projeto>.supabase.co
 *   SUPABASE_SERVICE_KEY  chave service_role (Project Settings > API)
 *
 * A service_role passa por cima de RLS — por isso ela só existe no servidor e
 * nunca chega ao navegador. O acesso é conferido antes, em `assertCompanyAccess`.
 */

export const BUCKET = "anexos";

/** Limite do corpo de uma server action na Vercel. Acima disso, use link. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
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

export function extensionOf(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function isAllowedFile(filename: string) {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

export function storageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "Storage não configurado. Falta SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente.",
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

/** Cria o bucket, privado, se ainda não existir. Idempotente. */
export async function ensureBucket() {
  const { url, key } = config();

  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });

  // 409 = já existe, que é o resultado desejado.
  if (!response.ok && response.status !== 409) {
    throw new Error(`Não foi possível criar o bucket: ${await response.text()}`);
  }
}

export async function uploadFile(path: string, file: File) {
  const { url, key } = config();

  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Falha no upload: ${await response.text()}`);
  }
}

/** Link temporário de download. O bucket é privado; nada fica exposto. */
export async function signedUrl(path: string, seconds = 60 * 10) {
  const { url, key } = config();

  const response = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: seconds }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { signedURL?: string };
  return data.signedURL ? `${url}/storage/v1${data.signedURL}` : null;
}

export async function deleteFile(path: string) {
  const { url, key } = config();

  await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
  });
}
