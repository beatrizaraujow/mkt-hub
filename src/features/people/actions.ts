"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, userCompanyAccess, users } from "@/db/schema";
import { assertCanManage, requireUserAction } from "@/lib/auth";
import { hashInvite, inviteUrl, newInviteToken, sameHash } from "@/lib/invite";
import { sendMail } from "@/lib/mail";
import { appOrigin } from "@/lib/origin";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { inviteEmail } from "./invite-email";

export type PeopleState = {
  error?: string;
  ok?: boolean;
  token?: string;
  name?: string;
  /** Para onde o convite foi mandado, quando foi. */
  sentTo?: string;
  /** Por que o envio falhou. O link continua válido — só não saiu daqui. */
  mailError?: string;
};

function fail(message: string): PeopleState {
  return { error: message };
}

/**
 * Manda o convite e conta o que aconteceu — **sem nunca derrubar quem chamou**.
 *
 * O convite já está gravado quando esta função roda. Se o SMTP recusar, o que
 * a gente perde é o envio, não o acesso: a tela mostra o link do mesmo jeito e
 * alguém entrega na mão, como era antes de existir e-mail nenhum. Trocar isso
 * por uma exceção transformaria "o e-mail não saiu" em "não consegui convidar".
 */
async function entregarConvite(destino: {
  name: string;
  email: string;
  token: string;
  expiresAt: Date;
  inviterName: string;
}): Promise<Pick<PeopleState, "sentTo" | "mailError">> {
  try {
    const url = inviteUrl(await appOrigin(), destino.token);
    const mensagem = inviteEmail({
      name: destino.name,
      inviterName: destino.inviterName,
      url,
      expiresAt: destino.expiresAt,
    });

    const resultado = await sendMail({ to: destino.email, ...mensagem });
    return resultado.sent ? { sentTo: destino.email } : { mailError: resultado.reason };
  } catch (error) {
    return { mailError: error instanceof Error ? error.message : "não foi possível enviar" };
  }
}

const ROLES = ["admin", "gestor", "colaborador", "observador"] as const;

const personSchema = z.object({
  name: z.string().trim().min(2, "Escreva o nome.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(160),
  jobTitle: z.string().trim().max(80).nullish(),
  role: z.enum(ROLES),
  companyIds: z.array(z.string().uuid()).default([]),
});

/** As empresas escolhidas precisam existir na organização de quem convida. */
async function validCompanies(orgId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.orgId, orgId), inArray(companies.id, ids)));
  return rows.map((row) => row.id);
}

function readForm(formData: FormData) {
  return personSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    jobTitle: (formData.get("jobTitle") as string)?.trim() || null,
    role: formData.get("role"),
    companyIds: formData.getAll("companyIds").filter((v): v is string => typeof v === "string"),
  });
}

/**
 * Cria a pessoa **sem senha**, manda o convite e devolve o link uma única vez.
 *
 * O link continua aparecendo na tela mesmo quando o e-mail sai: é o que
 * salva o dia em que a mensagem cair no spam de alguém.
 */
export async function createPerson(_prev: PeopleState, formData: FormData): Promise<PeopleState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const parsed = readForm(formData);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const data = parsed.data;

    // Só admin cria admin: gestor promovendo alguém ao próprio teto é escada.
    if (data.role === "admin" && user.role !== "admin") {
      return fail("Só um administrador pode criar outro administrador.");
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);
    if (existing) return fail("Já existe alguém com esse e-mail.");

    const invite = newInviteToken();

    const [created] = await db
      .insert(users)
      .values({
        orgId: user.orgId,
        name: data.name,
        email: data.email,
        jobTitle: data.jobTitle ?? null,
        role: data.role,
        passwordHash: null,
        inviteTokenHash: invite.hash,
        inviteExpiresAt: invite.expiresAt,
      })
      .returning({ id: users.id });

    const allowed = await validCompanies(user.orgId, data.companyIds);
    if (allowed.length) {
      await db
        .insert(userCompanyAccess)
        .values(allowed.map((companyId) => ({ userId: created.id, companyId })));
    }

    const entrega = await entregarConvite({
      name: data.name,
      email: data.email,
      token: invite.token,
      expiresAt: invite.expiresAt,
      inviterName: user.name,
    });

    revalidatePath("/time");
    return { ok: true, token: invite.token, name: data.name, ...entrega };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível criar a pessoa.");
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(ROLES),
  companyIds: z.array(z.string().uuid()).default([]),
});

export async function updatePerson(_prev: PeopleState, formData: FormData): Promise<PeopleState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const parsed = updateSchema.safeParse({
      id: formData.get("id"),
      role: formData.get("role"),
      companyIds: formData.getAll("companyIds").filter((v): v is string => typeof v === "string"),
    });
    if (!parsed.success) return fail("Dados inválidos.");
    const data = parsed.data;

    const [target] = await db
      .select({ id: users.id, orgId: users.orgId, role: users.role })
      .from(users)
      .where(eq(users.id, data.id))
      .limit(1);

    if (!target || target.orgId !== user.orgId) return fail("Pessoa não encontrada.");

    if ((data.role === "admin" || target.role === "admin") && user.role !== "admin") {
      return fail("Só um administrador mexe em outro administrador.");
    }

    await db.update(users).set({ role: data.role }).where(eq(users.id, data.id));

    const allowed = await validCompanies(user.orgId, data.companyIds);
    await db.delete(userCompanyAccess).where(eq(userCompanyAccess.userId, data.id));
    if (allowed.length) {
      await db
        .insert(userCompanyAccess)
        .values(allowed.map((companyId) => ({ userId: data.id, companyId })));
    }

    revalidatePath("/time");
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível salvar.");
  }
}

/**
 * Desativa em vez de apagar. Apagar levaria junto o histórico: quem fez o quê,
 * quem comentou, quanto tempo lançou. Conta desativada não entra e continua
 * explicando o passado.
 */
export async function setPersonActive(id: string, active: boolean): Promise<PeopleState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    if (id === user.id) return fail("Você não pode desativar a própria conta.");

    const [target] = await db
      .select({ orgId: users.orgId, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!target || target.orgId !== user.orgId) return fail("Pessoa não encontrada.");
    if (target.role === "admin" && user.role !== "admin") {
      return fail("Só um administrador mexe em outro administrador.");
    }

    // A organização não pode ficar sem ninguém que administre.
    if (!active && target.role === "admin") {
      const [row] = await db
        .select({ total: count() })
        .from(users)
        .where(
          and(eq(users.orgId, user.orgId), eq(users.role, "admin"), eq(users.isActive, true)),
        );
      if ((row?.total ?? 0) <= 1) return fail("Este é o último administrador ativo.");
    }

    await db.update(users).set({ isActive: active }).where(eq(users.id, id));
    revalidatePath("/time");
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível mudar o acesso.");
  }
}

/**
 * Gera um convite novo e manda por e-mail. O anterior deixa de valer no mesmo
 * instante.
 *
 * **Recusa quem já tem senha.** Convite para quem já entrou não substitui a
 * senha vigente — só acrescenta uma segunda porta para a mesma conta, aberta
 * por sete dias. Isso sempre foi errado; virou urgente quando o convite passou
 * a sair por e-mail, porque a segunda porta deixou de morrer na tela de quem
 * convidou e passou a ficar numa caixa de entrada, encaminhável. Quem esqueceu
 * a senha troca a dela em Ajustes; quem perdeu o acesso é caso de admin, e
 * então a conta é desativada e recriada.
 */
export async function resendInvite(id: string): Promise<PeopleState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const [target] = await db
      .select({
        orgId: users.orgId,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!target || target.orgId !== user.orgId) return fail("Pessoa não encontrada.");
    if (target.passwordHash) {
      return fail(`${target.name.split(" ")[0]} já definiu senha. Convite novo abriria uma segunda porta para a mesma conta.`);
    }
    if (!target.isActive) return fail("Conta desativada. Reative antes de convidar.");

    const invite = newInviteToken();
    await db
      .update(users)
      .set({ inviteTokenHash: invite.hash, inviteExpiresAt: invite.expiresAt })
      .where(eq(users.id, id));

    const entrega = await entregarConvite({
      name: target.name,
      email: target.email,
      token: invite.token,
      expiresAt: invite.expiresAt,
      inviterName: user.name,
    });

    revalidatePath("/time");
    return { ok: true, token: invite.token, name: target.name, ...entrega };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível gerar o convite.");
  }
}

/* ------------------------------------------------------- aceitar convite */

const acceptSchema = z
  .object({
    token: z.string().min(10).max(200),
    password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(200),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "As duas senhas não são iguais.",
  });

export type AcceptState = { error?: string };

/**
 * A pessoa define a própria senha e entra. O token é de uso único: aceito o
 * convite, ele some — link reencaminhado por engano não vira segunda porta.
 */
export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "";
    return { error: /^[A-Z][a-z]+ input/.test(message) ? "Dados inválidos." : message };
  }

  const { token, password } = parsed.data;
  const hash = hashInvite(token);

  const [person] = await db
    .select()
    .from(users)
    .where(and(eq(users.inviteTokenHash, hash), eq(users.isActive, true)))
    .limit(1);

  const expired = { error: "Este convite não vale mais. Peça um novo a quem administra." };
  if (!person || !person.inviteTokenHash || !sameHash(person.inviteTokenHash, hash)) return expired;
  if (!person.inviteExpiresAt || person.inviteExpiresAt.getTime() < Date.now()) return expired;

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      inviteTokenHash: null,
      inviteExpiresAt: null,
      lastLoginAt: new Date(),
    })
    .where(eq(users.id, person.id));

  await createSession({
    userId: person.id,
    orgId: person.orgId,
    role: person.role,
    isMaster: person.isMaster,
  });

  /**
   * Redireciona daqui, como o login faz. Sinalizar sucesso e deixar a tela
   * navegar sozinha nao serve: a resposta da action re-renderiza a pagina, o
   * convite ja foi consumido, e a pessoa ve "convite nao vale mais" logo
   * depois de ter definido a senha com sucesso.
   */
  redirect("/");
}

/** Confere o convite sem gastá-lo, para a tela saber o que mostrar. */
export async function inviteHolder(token: string) {
  const [person] = await db
    .select({ name: users.name, email: users.email, expiresAt: users.inviteExpiresAt })
    .from(users)
    .where(and(eq(users.inviteTokenHash, hashInvite(token)), eq(users.isActive, true)))
    .limit(1);

  if (!person || !person.expiresAt || person.expiresAt.getTime() < Date.now()) return null;
  return { name: person.name, email: person.email };
}

/** Troca da própria senha, em Ajustes. */
const changeSchema = z
  .object({
    current: z.string().min(1, "Informe a senha atual."),
    password: z.string().min(8, "A senha nova precisa de pelo menos 8 caracteres.").max(200),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, { message: "As duas senhas não são iguais." });

export async function changeOwnPassword(
  _prev: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  try {
    const user = await requireUserAction();

    const parsed = changeSchema.safeParse({
      current: formData.get("current"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!row?.passwordHash || !(await verifyPassword(parsed.data.current, row.passwordHash))) {
      return fail("Senha atual incorreta.");
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.password) })
      .where(eq(users.id, user.id));

    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível trocar a senha.");
  }
}
