/**
 * O porteiro do deploy: recusa subir codigo novo contra banco velho.
 *
 * Nasceu de um estrago de verdade, em 31/08/2026. A migration `0015` adicionou
 * a coluna `number` em `work_items`; o codigo que a le foi para producao antes
 * de ela rodar, e **toda tela de tarefa caiu** — a consulta procurava uma
 * coluna que nao existia. A regra ja estava escrita no `CLAUDE.md` e mesmo
 * assim passou, porque regra escrita nao impede nada. Esta impede.
 *
 * A troca que ele faz: **build que falha nao promove**. O mesmo erro que antes
 * derrubava a producao agora vira um deploy que nao sai, e o site continua
 * servindo a versao anterior enquanto alguem roda a migration.
 *
 * A comparacao e por `created_at`, que e o `when` do `_journal.json`, e nao
 * pelo hash do arquivo. Hash mudaria a cada correcao de comentario numa
 * migration ja aplicada e o build passaria a falhar sozinho, sem nada de
 * errado no banco — alarme que dispara a toa e desligado na primeira semana.
 *
 *   npm run db:check
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

// Igual ao drizzle.config: `.env.local` primeiro, depois o ambiente. Na Vercel
// nao existe `.env.local` e o dotenv nao faz nada — as variaveis ja estao la.
config({ path: ".env.local" });
config();

type Journal = { entries: Array<{ tag: string; when: number }> };

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  /*
   * Sem banco a checagem nao tem o que dizer, e recusar aqui quebraria
   * `npm run build` de quem acabou de clonar o repositorio. Avisa e sai.
   */
  if (!url) {
    console.warn("[migrations] sem DATABASE_URL — checagem pulada.");
    return;
  }

  const journal: Journal = JSON.parse(
    readFileSync(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8"),
  );

  const client = postgres(url, { prepare: false, max: 1, idle_timeout: 5 });

  try {
    /*
     * `to_regclass` devolve nulo em vez de lancar quando a tabela nao existe —
     * e banco que nunca migrou e um caso legitimo, nao um erro de conexao.
     */
    const [existe] = await client<[{ tabela: string | null }]>`
      select to_regclass('drizzle.__drizzle_migrations')::text as tabela
    `;

    const aplicadas = existe.tabela
      ? await client<Array<{ created_at: string }>>`
          select created_at from drizzle.__drizzle_migrations
        `
      : [];

    const carimbos = new Set(aplicadas.map((linha) => String(linha.created_at)));
    const faltando = journal.entries.filter((entrada) => !carimbos.has(String(entrada.when)));

    if (faltando.length === 0) {
      console.log(
        `[migrations] ${journal.entries.length} de ${journal.entries.length} aplicadas. Pode subir.`,
      );
      return;
    }

    console.error("");
    console.error("  BUILD RECUSADO — migration pendente no banco de destino.");
    console.error("");
    console.error(`  Faltam ${faltando.length}:`);
    for (const entrada of faltando) console.error(`    · ${entrada.tag}`);
    console.error("");
    console.error("  O codigo desta build le colunas que o banco ainda nao tem.");
    console.error("  Subir assim derruba as telas que dependem delas.");
    console.error("");
    console.error("  Rode antes, com a string do session pooler (porta 5432):");
    console.error("    DIRECT_URL='<string>' npx drizzle-kit migrate");
    console.error("");

    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((erro) => {
  /*
   * Falha de conexao nao pode virar build liberado. O ponto todo desta
   * checagem e ser o que segura o deploy quando algo esta fora do lugar.
   */
  console.error("");
  console.error("  BUILD RECUSADO — nao deu para conferir as migrations.");
  console.error(`  ${erro instanceof Error ? erro.message : erro}`);
  console.error("");
  process.exit(1);
});
