/**
 * Semente inicial. Idempotente: pode rodar de novo sem duplicar nada.
 *   npm run seed
 */
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { client, db } from "./index";
import {
  companies,
  organizations,
  userCompanyAccess,
  users,
  workItemStages,
  type StageKind,
  type WorkItemType,
} from "./schema";

const ORG = { name: "Grupo SB", slug: "grupo-sb" };

const COMPANIES = [
  { name: "SeuBoné", slug: "seubone", color: "#b3261e" },
  { name: "Onevo", slug: "onevo", color: "#2e7d4f" },
  { name: "Carbone Educação", slug: "carbone-educacao", color: "#c98a2e" },
  { name: "Weevo", slug: "weevo", color: "#4a5bb5" },
];

/** O nome e livre; `kind` e o que o sistema usa para calcular. */
const STAGES: Record<WorkItemType, Array<[string, StageKind]>> = {
  task: [
    ["Backlog", "backlog"],
    ["A fazer", "todo"],
    ["Em andamento", "doing"],
    ["Em revisão", "review"],
    ["Concluído", "done"],
  ],
  content: [
    ["Briefing", "backlog"],
    ["Roteiro", "todo"],
    ["Gravação", "doing"],
    ["Edição", "doing"],
    ["Revisão", "review"],
    ["Aprovado", "review"],
    ["Publicado", "done"],
  ],
  capture: [
    ["Solicitado", "backlog"],
    ["Agendado", "todo"],
    ["Captado", "doing"],
    ["Enviado", "review"],
    ["Finalizado", "done"],
  ],
};

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || password.length < 8) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (minimo 8 caracteres) no .env.local antes de rodar a semente.",
    );
  }

  // Organizacao
  let [org] = await db.select().from(organizations).where(eq(organizations.slug, ORG.slug)).limit(1);
  if (!org) {
    [org] = await db.insert(organizations).values(ORG).returning();
    console.log(`+ organizacao ${org.name}`);
  }

  // Empresas
  for (const c of COMPANIES) {
    const [found] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.orgId, org.id), eq(companies.slug, c.slug)))
      .limit(1);
    if (!found) {
      await db.insert(companies).values({ ...c, orgId: org.id });
      console.log(`+ empresa ${c.name}`);
    }
  }

  // Pipelines padrao da organizacao (companyId nulo)
  for (const [type, list] of Object.entries(STAGES) as Array<
    [WorkItemType, Array<[string, StageKind]>]
  >) {
    const existing = await db
      .select({ id: workItemStages.id })
      .from(workItemStages)
      .where(and(eq(workItemStages.orgId, org.id), eq(workItemStages.type, type)));

    if (existing.length === 0) {
      await db.insert(workItemStages).values(
        list.map(([stageName, kind], i) => ({
          orgId: org.id,
          companyId: null,
          type,
          name: stageName,
          kind,
          position: (i + 1) * 10,
        })),
      );
      console.log(`+ pipeline ${type} (${list.length} estagios)`);
    }
  }

  // Administrador
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let userId = existingUser?.id;

  if (!existingUser) {
    const [created] = await db
      .insert(users)
      .values({
        orgId: org.id,
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: "admin",
        isMaster: true,
        jobTitle: "Gestão de marketing",
      })
      .returning();
    userId = created.id;
    console.log(`+ administrador ${email}`);
  } else {
    console.log(`= administrador ${email} ja existe (senha nao alterada)`);
  }

  // Acesso a todas as empresas (admin ja enxerga tudo, mas o vinculo
  // explicito evita surpresa se o papel mudar depois)
  const allCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.orgId, org.id));

  for (const c of allCompanies) {
    await db
      .insert(userCompanyAccess)
      .values({ userId: userId!, companyId: c.id })
      .onConflictDoNothing();
  }

  console.log("\nSemente concluida.");
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error(err);
    await client.end().catch(() => {});
    process.exit(1);
  });
