import "server-only";

/**
 * Supabase Storage pela API REST, sem SDK.
 *
 * O SDK traria dependência, versionamento e um cliente inteiro para usar três
 * chamadas: subir, assinar e apagar. Aqui é `fetch`.
 *
 * Precisa de duas variáveis:
 *   SUPABASE_URL          https://<projeto>.supabase.co
 *   SUPABASE_SERVICE_KEY  chave secreta (Project Settings > API Keys)
 *
 * Serve tanto a `sb_secret_...` do formato novo quanto a `service_role` legada,
 * em JWT. A publicável (`sb_publishable_...`, antiga `anon`) NÃO serve: ela
 * respeita RLS e o bucket é privado.
 *
 * A chave secreta passa por cima de RLS — por isso ela só existe no servidor e
 * nunca chega ao navegador. O acesso é conferido antes, em `assertCompanyAccess`.
 */

export const BUCKET = "anexos";

/**
 * As regras puras (tamanho, extensões aceitas, mime, mensagens de erro) moram
 * em `upload-rules.ts`, que o navegador também importa. Aqui só o que precisa
 * da chave. Reexportado para quem já importava daqui.
 */
export {
  ACCEPT_ATTRIBUTE,
  ALLOWED_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  UPLOAD_ERRORS,
  checkFile,
  extensionOf,
  isAllowedFile,
  isImage,
  mimeFor,
} from "./upload-rules";

/** Validade do link de miniatura. Cobre um card aberto por bastante tempo. */
export const PREVIEW_TTL_SECONDS = 60 * 30;

export function storageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

/**
 * Os dois cabeçalhos de propósito: a chave legada em JWT autentica pelo
 * `Authorization`, e a `sb_secret_` do formato novo é lida do `apikey`.
 * Mandar os dois faz os dois formatos funcionarem sem ramificação.
 */
function authHeaders(key: string) {
  return { Authorization: `Bearer ${key}`, apikey: key };
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

/**
 * Cria o bucket, privado, se ainda não existir. Idempotente.
 *
 * Pergunta antes em vez de criar e interpretar o erro: quando o bucket já
 * existe, o Storage responde **HTTP 400** com `"statusCode":"409"` dentro do
 * corpo. Confiar no status da resposta fazia o segundo upload em diante
 * falhar com "Não foi possível criar o bucket" — o primeiro criava, todos os
 * outros batiam no bucket já criado e explodiam.
 */
export async function ensureBucket() {
  const { url, key } = config();

  const found = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, {
    headers: authHeaders(key),
  });
  if (found.ok) return;

  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (response.ok) return;

  // Dois uploads ao mesmo tempo: um cria, o outro chega aqui. Também é sucesso.
  const body = await response.text();
  if (body.includes("BucketAlreadyExists") || body.includes("already exists")) return;

  throw new Error(`Não foi possível criar o bucket: ${body}`);
}

export async function uploadFile(path: string, file: File) {
  const { url, key } = config();

  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      ...authHeaders(key),
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
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
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
    headers: authHeaders(key),
  });
}
