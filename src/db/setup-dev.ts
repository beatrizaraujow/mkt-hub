/**
 * Prepara um banco de desenvolvimento novo.
 *
 *   npm run dev:setup
 *
 * Roda migrations e seed contra o que estiver em `.env.local`, **depois de
 * confirmar que o banco está vazio**.
 *
 * A confirmação existe por um motivo específico: o jeito mais fácil de perder
 * o trabalho de sete pessoas é rodar o seed com o `.env.local` ainda apontando
 * para produção. O script mostra o host, conta as linhas e para sozinho se
 * achar gente lá dentro.
 */
import { sql } from "drizzle-orm";
import { client, db } from "./index";

function hostOf(url: string | undefined) {
  if (!url) return "(vazio)";
  try {
    return new URL(url).host;
  } catch {
    return "(string ilegível)";
  }
}

async function count(table: string) {
  try {
    const rows = await db.execute(sql.raw(`select count(*)::int as n from ${table}`));
    return Number((rows as unknown as Array<{ n: number }>)[0]?.n ?? 0);
  } catch {
    // Tabela ainda não existe: banco novo, que é exatamente o esperado.
    return 0;
  }
}

async function main() {
  const direct = process.env.DIRECT_URL;
  const pooled = process.env.DATABASE_URL;

  console.log("\nBanco apontado pelo .env.local:");
  console.log("  aplicação (6543):", hostOf(pooled));
  console.log("  migrations (5432):", hostOf(direct));

  const people = await count("users");
  const items = await count("work_items");

  console.log("\nO que já existe lá:");
  console.log("  pessoas:", people);
  console.log("  tarefas:", items);

  if (people > 0 || items > 0) {
    console.error(
      "\nPAROU. Este banco tem dado dentro — não é um banco novo.\n" +
        "Se a intenção era preparar o de desenvolvimento, troque DATABASE_URL e\n" +
        "DIRECT_URL no .env.local para o projeto novo e rode de novo.\n",
    );
    process.exit(1);
  }

  console.log("\nBanco vazio. Rode, nesta ordem:\n");
  console.log("  npm run db:migrate");
  console.log("  npm run seed");
  console.log("  npm run user -- --email teste@mkthub.test --password <escolha uma>\n");
  console.log("O seed cria a organização, as 4 empresas com as sub-marcas e os pipelines.");
  console.log("Produção não é tocada: as variáveis dela vivem na Vercel, não neste arquivo.\n");

  await client.end();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  await client.end().catch(() => {});
  process.exit(1);
});
