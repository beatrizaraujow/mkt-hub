/**
 * Cria ou atualiza uma pessoa. Enquanto a tela de Time nao existe, este e o
 * caminho oficial para dar acesso a alguem e para trocar senha.
 *
 *   npm run user -- --name "Fulano" --email fulano@empresa.com --password "..." --role colaborador
 *   npm run user -- --email fulano@empresa.com --password "nova-senha"        # so troca a senha
 *   npm run user -- --email fulano@empresa.com --companies seubone,weevo      # define o alcance
 *   npm run user -- --email fulano@empresa.com --inactive                     # revoga o acesso
 *
 * Papeis: admin | gestor | colaborador | observador
 * --master marca quem pode validar o fechamento da semana.
 */
import { and, eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { client, db } from "./index";
import {
  companies,
  organizations,
  userCompanyAccess,
  users,
  userRole,
  type UserRole,
} from "./schema";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  const password = arg("password");
  const name = arg("name");
  const role = arg("role") as UserRole | undefined;
  const jobTitle = arg("job");
  const companySlugs = arg("companies")?.split(",").map((s) => s.trim()).filter(Boolean);

  if (!email) throw new Error("Informe --email.");
  if (role && !userRole.enumValues.includes(role)) {
    throw new Error(`Papel invalido: ${role}. Use ${userRole.enumValues.join(" | ")}.`);
  }
  if (password && password.length < 8) {
    throw new Error("A senha precisa ter ao menos 8 caracteres.");
  }

  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("Nenhuma organizacao encontrada. Rode `npm run seed` antes.");

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let userId: string;

  if (existing) {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (name) patch.name = name;
    if (role) patch.role = role;
    if (jobTitle) patch.jobTitle = jobTitle;
    if (password) patch.passwordHash = await bcrypt.hash(password, 12);
    if (flag("master")) patch.isMaster = true;
    if (flag("no-master")) patch.isMaster = false;
    if (flag("inactive")) patch.isActive = false;
    if (flag("active")) patch.isActive = true;

    if (Object.keys(patch).length) {
      await db.update(users).set(patch).where(eq(users.id, existing.id));
      console.log(`= ${email} atualizado (${Object.keys(patch).join(", ")})`);
    } else {
      console.log(`= ${email} ja existe e nada foi passado para alterar`);
    }
    userId = existing.id;
  } else {
    if (!name || !password) {
      throw new Error("Para criar alguem novo, --name e --password sao obrigatorios.");
    }
    const [created] = await db
      .insert(users)
      .values({
        orgId: org.id,
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: role ?? "colaborador",
        isMaster: flag("master"),
        jobTitle: jobTitle ?? null,
      })
      .returning();
    userId = created.id;
    console.log(`+ ${email} criado como ${created.role}${created.isMaster ? " (master)" : ""}`);
  }

  // Alcance por empresa. Admin ja enxerga tudo, mas o vinculo explicito
  // evita surpresa se o papel mudar depois.
  const wanted = companySlugs?.length
    ? await db
        .select({ id: companies.id, slug: companies.slug })
        .from(companies)
        .where(and(eq(companies.orgId, org.id), inArray(companies.slug, companySlugs)))
    : await db.select({ id: companies.id, slug: companies.slug }).from(companies).where(eq(companies.orgId, org.id));

  if (companySlugs?.length && wanted.length !== companySlugs.length) {
    const achados = wanted.map((c) => c.slug);
    const faltando = companySlugs.filter((s) => !achados.includes(s));
    throw new Error(`Empresa nao encontrada: ${faltando.join(", ")}`);
  }

  if (companySlugs?.length) {
    await db.delete(userCompanyAccess).where(eq(userCompanyAccess.userId, userId));
  }

  for (const c of wanted) {
    await db
      .insert(userCompanyAccess)
      .values({ userId, companyId: c.id })
      .onConflictDoNothing();
  }

  console.log(`  acesso a ${wanted.length} empresa(s): ${wanted.map((c) => c.slug).join(", ")}`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error(`\n${err instanceof Error ? err.message : err}`);
    // Marcado antes do `await`: se `client.end()` nao resolver, o exit nunca roda
    // e o Node encerraria com 0 — falha silenciosa em script encadeado.
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
