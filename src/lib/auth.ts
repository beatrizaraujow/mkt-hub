import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, userCompanyAccess, users, type UserRole } from "@/db/schema";
import { readSession } from "./session";

/**
 * Autorizacao — regra do projeto:
 * o papel define o teto, o acesso por empresa define o alcance.
 * Toda checagem acontece aqui, no servidor. Esconder item de menu no
 * front e experiencia, nunca seguranca.
 */

const RANK: Record<UserRole, number> = {
  observador: 0,
  colaborador: 1,
  gestor: 2,
  admin: 3,
};

export type CurrentUser = {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: UserRole;
  isMaster: boolean;
  avatarUrl: string | null;
  jobTitle: string | null;
  /** Empresas que esta pessoa enxerga. Admin enxerga todas da organizacao. */
  companyIds: string[];
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.isActive, true)))
    .limit(1);

  if (!row) return null;

  const companyIds =
    row.role === "admin"
      ? (
          await db
            .select({ id: companies.id })
            .from(companies)
            .where(and(eq(companies.orgId, row.orgId), eq(companies.isActive, true)))
        ).map((c) => c.id)
      : (
          await db
            .select({ id: userCompanyAccess.companyId })
            .from(userCompanyAccess)
            .where(eq(userCompanyAccess.userId, row.id))
        ).map((c) => c.id);

  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    email: row.email,
    role: row.role,
    isMaster: row.isMaster,
    avatarUrl: row.avatarUrl,
    jobTitle: row.jobTitle,
    companyIds,
  };
});

/** Uso em pages e layouts. Manda para o login quem nao tem sessao valida. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function hasRole(user: CurrentUser, min: UserRole) {
  return RANK[user.role] >= RANK[min];
}

export function canWrite(user: CurrentUser) {
  return hasRole(user, "colaborador");
}

export function canManage(user: CurrentUser) {
  return hasRole(user, "gestor");
}

export function canSeeCompany(user: CurrentUser, companyId: string) {
  return user.companyIds.includes(companyId);
}

/** Uso em server actions. Lanca em vez de redirecionar. */
export async function requireUserAction(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sessao expirada. Entre novamente.");
  return user;
}

export function assertCompanyAccess(user: CurrentUser, companyId: string) {
  if (!canSeeCompany(user, companyId)) {
    throw new Error("Você não tem acesso a esta empresa.");
  }
}

export function assertCanManage(user: CurrentUser) {
  if (!canManage(user)) {
    throw new Error("Ação restrita a gestores.");
  }
}
