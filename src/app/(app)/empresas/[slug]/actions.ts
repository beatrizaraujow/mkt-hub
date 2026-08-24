"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, projects } from "@/db/schema";
import { assertCanManage, assertCompanyAccess, requireUserAction } from "@/lib/auth";

const schema = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(2, "Nome muito curto.").max(80, "Nome muito longo."),
  dueDate: z.string().optional(),
});

export type ProjectState = { error?: string; ok?: boolean };

export async function createProject(
  _prev: ProjectState,
  formData: FormData,
): Promise<ProjectState> {
  const user = await requireUserAction();
  assertCanManage(user);

  const parsed = schema.safeParse({
    companyId: formData.get("companyId"),
    name: formData.get("name"),
    dueDate: formData.get("dueDate") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  assertCompanyAccess(user, parsed.data.companyId);

  const [company] = await db
    .select({ slug: companies.slug })
    .from(companies)
    .where(and(eq(companies.id, parsed.data.companyId), eq(companies.orgId, user.orgId)))
    .limit(1);

  if (!company) return { error: "Empresa não encontrada." };

  await db.insert(projects).values({
    companyId: parsed.data.companyId,
    name: parsed.data.name,
    ownerId: user.id,
    dueDate: parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T12:00:00-03:00`) : null,
  });

  revalidatePath(`/empresas/${company.slug}`);
  return { ok: true };
}
