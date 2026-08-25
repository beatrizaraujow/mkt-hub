import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, userCompanyAccess, users, type UserRole } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  role: UserRole;
  isActive: boolean;
  isMaster: boolean;
  /** Sem senha = convidada e ainda não entrou. */
  pending: boolean;
  inviteExpired: boolean;
  lastLoginAt: Date | null;
  companyIds: string[];
};

export async function listPeople(user: CurrentUser): Promise<PersonRow[]> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.orgId, user.orgId))
    .orderBy(asc(users.name));

  const access = await db
    .select({ userId: userCompanyAccess.userId, companyId: userCompanyAccess.companyId })
    .from(userCompanyAccess);

  const now = Date.now();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.jobTitle,
    role: row.role,
    isActive: row.isActive,
    isMaster: row.isMaster,
    pending: !row.passwordHash,
    inviteExpired:
      !row.passwordHash && (!row.inviteExpiresAt || row.inviteExpiresAt.getTime() < now),
    lastLoginAt: row.lastLoginAt,
    companyIds: access.filter((a) => a.userId === row.id).map((a) => a.companyId),
  }));
}

export async function companyOptions(user: CurrentUser) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      parentId: companies.parentId,
    })
    .from(companies)
    .where(eq(companies.orgId, user.orgId))
    .orderBy(asc(companies.name));
}
