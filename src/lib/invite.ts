import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Convite de acesso.
 *
 * Sem `server-only` de proposito: o script de cadastro em lote (`npm run
 * invite`) precisa da mesma geracao de token, e duas copias da mesma logica
 * divergem no dia em que uma mudar. O `node:crypto` daqui ja impede o arquivo
 * de entrar num bundle de navegador — o marcador nao acrescentava protecao,
 * so bloqueava o uso legitimo.
 *
 * Quem cria a conta **nunca escolhe a senha de ninguém**. A conta nasce sem
 * senha e a pessoa define a dela pelo link — assim a senha não passa por um
 * chat, não fica na mão de quem convidou e não precisa ser trocada depois.
 *
 * O banco guarda só o hash do token. Se ele vazar, o que vazou não abre conta
 * nenhuma: para entrar é preciso o valor cru, que existe uma vez só, na tela
 * de quem convidou.
 */

/** Sete dias. Convite que não expira é conta aberta esperando ser achada. */
export const INVITE_DAYS = 7;

export function newInviteToken() {
  // 32 bytes: adivinhar isso por tentativa não é um ataque viável.
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInvite(token), expiresAt: inviteExpiry() };
}

export function hashInvite(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(from: Date = new Date()) {
  return new Date(from.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Comparação em tempo constante. O ganho aqui é pequeno — o token tem
 * entropia demais para um ataque de tempo valer a pena — mas custa uma linha
 * e evita a discussão.
 */
export function sameHash(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function inviteUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/convite/${token}`;
}
