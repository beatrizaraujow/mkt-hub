"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { assertCanManage, requireUserAction } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2, "Nome muito curto.").max(60, "Nome muito longo."),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.")
    .default("#0d5c59"),
});

export type CompanyState = { error?: string; ok?: boolean };

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function createCompany(
  _prev: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  const user = await requireUserAction();
  assertCanManage(user);

  const parsed = schema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const slug = slugify(parsed.data.name);
  if (!slug) return { error: "Nome inválido." };

  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.orgId, user.orgId), eq(companies.slug, slug)))
    .limit(1);

  if (existing) return { error: "Já existe uma empresa com esse nome." };

  await db.insert(companies).values({
    orgId: user.orgId,
    name: parsed.data.name,
    slug,
    color: parsed.data.color,
  });

  revalidatePath("/empresas");
  return { ok: true };
}
