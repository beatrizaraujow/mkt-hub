import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewSettings } from "@/db/schema";

/**
 * O que muda sem deploy.
 *
 * Três chaves, e as duas primeiras existem para a mesma coisa: poder segurar o
 * sistema sem pedir para ninguém subir código. Uma revisão automática que só
 * se desliga com deploy é uma revisão que fica ligada errada por um dia
 * inteiro.
 */

export type Mode = "silencioso" | "ativo";

const KEY_MODE = "modo";
const KEY_OFF = "marcas_desligadas";
const KEY_REVISORES = "revisores_designados";

async function readKey<T>(orgId: string, key: string): Promise<T | null> {
  const [row] = await db
    .select({ value: reviewSettings.value })
    .from(reviewSettings)
    .where(and(eq(reviewSettings.orgId, orgId), eq(reviewSettings.key, key)))
    .limit(1);

  return (row?.value as T) ?? null;
}

async function writeKey(orgId: string, key: string, value: unknown) {
  await db
    .insert(reviewSettings)
    .values({ orgId, key, value })
    .onConflictDoUpdate({
      target: [reviewSettings.orgId, reviewSettings.key],
      set: { value, updatedAt: new Date() },
    });
}

/**
 * O sistema nasce em silencioso e não sai de lá sozinho.
 *
 * Em silencioso ele emite parecer e **não move nada**: todo item fica onde
 * está para uma pessoa decidir, com o parecer ao lado. Só depois de comparar
 * um período de parecer com o que o time decidiu é que faz sentido virar a
 * chave — é a única calibragem honesta, e é barata comparada a reconstruir a
 * confiança do time depois de uma reprovação escandalosa.
 */
export async function reviewMode(orgId: string): Promise<Mode> {
  const value = await readKey<string>(orgId, KEY_MODE);
  return value === "ativo" ? "ativo" : "silencioso";
}

export async function setReviewMode(orgId: string, mode: Mode) {
  await writeKey(orgId, KEY_MODE, mode);
}

/** As marcas em que o revisor está desligado. Vale nos dois modos. */
export async function disabledCompanies(orgId: string): Promise<string[]> {
  return (await readKey<string[]>(orgId, KEY_OFF)) ?? [];
}

export async function setCompanyEnabled(orgId: string, companyId: string, enabled: boolean) {
  const current = await disabledCompanies(orgId);
  const next = enabled
    ? current.filter((id) => id !== companyId)
    : current.includes(companyId)
      ? current
      : [...current, companyId];

  await writeKey(orgId, KEY_OFF, next);
}

/**
 * Quem vê o Revisor sem gerenciar a casa.
 *
 * O Revisor era de gestor para cima, e ficar de fora dele não é uma questão de
 * papel: quem revisa peça precisa ver o parecer, e revisar peça não implica
 * convidar gente, mexer em empresa nem fechar semana. Promover alguém a gestor
 * para liberar uma tela abriria Time, Empresas, Ajustes, Rotinas e Desempenho
 * junto — teto largo demais para uma porta só.
 *
 * É o mesmo desenho das Rotinas: a seção aparece para quem gerencia **e** para
 * quem ela alcança. Papel continua sendo o teto; isto é alcance.
 *
 * **Só abre a lista e os pareceres.** Regras e Medição seguem em
 * `assertCanManage`: são as telas que decidem como o time inteiro é avaliado.
 *
 * Mora em `review_settings` e não numa coluna de `users` porque é configuração
 * do Revisor, muda sem deploy, e não exige mexer no schema de produção.
 */
export async function revisoresDesignados(orgId: string): Promise<string[]> {
  const ids = await readKey<string[]>(orgId, KEY_REVISORES);
  return Array.isArray(ids) ? ids : [];
}

export async function definirRevisores(orgId: string, ids: string[]) {
  await writeKey(orgId, KEY_REVISORES, [...new Set(ids)]);
}
