"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
  // formData.get devolve null quando o campo nao existe no HTML.
  next: z.string().nullish(),
});

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    // Nunca vazar mensagem tecnica do validador para a tela de login.
    const message = parsed.error.issues[0]?.message ?? "";
    return { error: /^[A-Z][a-z]+ input/.test(message) ? "Dados inválidos." : message };
  }

  const { email, password, next } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.isActive, true)))
    .limit(1);

  // Mensagem unica: nao revela se o e-mail existe.
  const invalid = { error: "E-mail ou senha incorretos." };
  if (!user) return invalid;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid;

  await createSession({
    userId: user.id,
    orgId: user.orgId,
    role: user.role,
    isMaster: user.isMaster,
  });

  redirect(next && next.startsWith("/") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
