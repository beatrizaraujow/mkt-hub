/**
 * Semente inicial. Idempotente: pode rodar de novo sem duplicar nada.
 *   npm run seed
 *
 * Empresas e estagios vem do levantamento do board antigo — ver
 * docs/02-clickup-house-quatro5.md.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { TASK_STAGES } from "@/lib/stages";
import { client, db } from "./index";
import {
  companies,
  organizations,
  userCompanyAccess,
  users,
  workItems,
  workItemStages,
  type StageKind,
  type WorkItemType,
} from "./schema";

const ORG = { name: "Grupo SB", slug: "grupo-sb" };

/**
 * Quatro empresas, cada uma com suas sub-marcas. A tarefa aponta sempre
 * para a mais especifica; quem tem acesso a mae alcança as filhas.
 */
const TREE: Array<{
  name: string;
  slug: string;
  color: string;
  children?: Array<{ name: string; slug: string }>;
}> = [
  {
    name: "SeuBoné",
    slug: "seubone",
    color: "#b3261e",
    children: [{ name: "Box Corporativo", slug: "box-corporativo" }],
  },
  {
    name: "Onevo",
    slug: "onevo",
    color: "#2e7d4f",
    children: [
      { name: "Onevo Energia", slug: "onevo-energia" },
      { name: "Onevo Investimentos", slug: "onevo-investimentos" },
      { name: "Cássio Maia P2P", slug: "cassio-maia-p2p" },
    ],
  },
  {
    name: "Carbone Educação",
    slug: "carbone-educacao",
    color: "#c98a2e",
    children: [
      { name: "Carbone Club", slug: "carbone-club" },
      { name: "Pedro Galvão P2P", slug: "pedro-galvao-p2p" },
    ],
  },
  { name: "Weevo", slug: "weevo", color: "#4a5bb5" },
];

/**
 * Estagios. O board antigo tinha 12 para tudo; aqui cada tipo tem o seu,
 * e nenhum estagio existe so para guardar coisa parada.
 *
 * O nome e livre; `kind` e o que o sistema usa para calcular.
 */
/**
 * Os pipelines padrão, como trincas [nome, slug, kind].
 *
 * O de tarefa vem de `lib/stages`, que é a fonte da ordem, da cor e da regra
 * de papel — duplicar a lista aqui faria as duas divergirem no dia em que uma
 * mudasse. Conteúdo e captação ainda não têm apresentação própria e vivem só
 * nesta tabela.
 */
const STAGES: Record<WorkItemType, Array<[string, string, StageKind]>> = {
  // Demanda de trabalho: arte, copy, tráfego, landing page, apresentação.
  task: TASK_STAGES.map((stage) => [stage.label, stage.slug, stage.kind]),
  // Peça de conteúdo, do briefing ao ar.
  content: [
    ["Briefing", "briefing", "backlog"],
    ["Roteiro", "roteiro", "todo"],
    ["Gravação", "gravacao", "doing"],
    ["Edição", "edicao", "doing"],
    ["Aprovação", "aprovacao", "review"],
    ["Publicado", "publicado", "done"],
  ],
  // Captação de vídeo e foto.
  capture: [
    ["Solicitado", "solicitado", "backlog"],
    ["Agendado", "agendado", "todo"],
    ["Captado", "captado", "doing"],
    ["Enviado", "enviado", "review"],
    ["Finalizado", "finalizado", "done"],
  ],
};

async function seedCompanies(orgId: string) {
  for (const parent of TREE) {
    let [row] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.orgId, orgId), eq(companies.slug, parent.slug)))
      .limit(1);

    if (!row) {
      [row] = await db
        .insert(companies)
        .values({ orgId, name: parent.name, slug: parent.slug, color: parent.color })
        .returning({ id: companies.id });
      console.log(`+ empresa ${parent.name}`);
    }

    for (const child of parent.children ?? []) {
      const [exists] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.orgId, orgId), eq(companies.slug, child.slug)))
        .limit(1);

      if (!exists) {
        await db.insert(companies).values({
          orgId,
          name: child.name,
          slug: child.slug,
          color: parent.color,
          parentId: row.id,
        });
        console.log(`  + ${child.name} (dentro de ${parent.name})`);
      }
    }
  }
}

async function seedStages(orgId: string) {
  for (const [type, wanted] of Object.entries(STAGES) as Array<
    [WorkItemType, Array<[string, string, StageKind]>]
  >) {
    const current = await db
      .select()
      .from(workItemStages)
      .where(
        and(
          eq(workItemStages.orgId, orgId),
          eq(workItemStages.type, type),
          isNull(workItemStages.companyId),
        ),
      );

    // Compara pelo slug, não pelo nome: o nome é livre e vai ser customizável
    // por empresa, então nome diferente não significa pipeline diferente.
    const same =
      current.length === wanted.length &&
      wanted.every(([, slug], i) =>
        current.some((s) => s.slug === slug && s.position === (i + 1) * 10),
      );

    if (same) continue;

    if (current.length) {
      // So troca o pipeline se nenhum item estiver usando os estagios atuais —
      // reescrever isso com trabalho em andamento perderia o estado do time.
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(workItems)
        .where(
          inArray(
            workItems.stageId,
            current.map((s) => s.id),
          ),
        );

      if (count > 0) {
        console.log(
          `! pipeline ${type} desatualizado, mas ${count} item(ns) em uso — nada alterado`,
        );
        continue;
      }

      await db.delete(workItemStages).where(
        inArray(
          workItemStages.id,
          current.map((s) => s.id),
        ),
      );
    }

    await db.insert(workItemStages).values(
      wanted.map(([name, slug, kind], i) => ({
        orgId,
        companyId: null,
        type,
        name,
        slug,
        kind,
        position: (i + 1) * 10,
      })),
    );
    console.log(`+ pipeline ${type}: ${wanted.map(([n]) => n).join(" > ")}`);
  }
}

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || password.length < 8) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (minimo 8 caracteres) no .env.local antes de rodar a semente.",
    );
  }

  let [org] = await db.select().from(organizations).where(eq(organizations.slug, ORG.slug)).limit(1);
  if (!org) {
    [org] = await db.insert(organizations).values(ORG).returning();
    console.log(`+ organizacao ${org.name}`);
  }

  await seedCompanies(org.id);
  await seedStages(org.id);

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

  const all = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.orgId, org.id));

  for (const c of all) {
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
    /*
     * O codigo de saida e marcado **antes** de esperar o fim da conexao. Com o
     * banco fora de alcance, `client.end()` pode nunca resolver — o `await`
     * abaixo trava, o `process.exit(1)` nunca roda, e o Node encerra sozinho
     * com codigo 0 quando o event loop esvazia. O erro aparece na tela e o
     * processo se declara bem-sucedido; quem chama este script em sequencia
     * segue para o passo seguinte como se nada tivesse acontecido.
     */
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
