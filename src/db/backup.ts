/**
 * Copia de seguranca do banco inteiro, em JSON.
 *
 *   npm run db:backup                      copia o banco do `.env.local`
 *   npm run db:backup -- ../mkt-prod.env   copia o banco daquele arquivo
 *
 * Nasceu em 01/09/2026, antes da migracao do ClickUp: o painel do Supabase
 * mostra "No backups" no projeto de producao, e a migracao escreve mais de
 * quatro mil linhas de uma vez. Escrever em volume num banco sem backup e
 * apostar que nada da errado na primeira vez que muita coisa muda junto.
 *
 * **Nao substitui backup de verdade.** E um retrato em JSON, sem indices, sem
 * sequencias, sem permissoes — serve para conferir o que havia e para repor
 * dado a mao, nao para restaurar o banco com um comando. Enquanto o projeto
 * nao tiver PITR ou backup diario, e o que existe.
 *
 * O `pg_dump` seria melhor e nao esta instalado nesta maquina. Depender de uma
 * ferramenta ausente na hora do aperto e o mesmo que nao ter nada.
 *
 * As tabelas saem do banco (`information_schema`), nao do `schema.ts`: o que
 * interessa e o que existe la, incluindo o que o Drizzle mantem por fora, como
 * o controle de migrations. Copiar so o que o codigo declara deixaria de fora
 * justamente o que diverge — que e onde mora o problema.
 */
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { anunciarDestino, lerAmbienteDoArgumento, refDaConexao } from "./destino";

type Tabela = { schemaName: string; nome: string };

/*
 * O ambiente e lido e o destino anunciado antes de abrir conexao. Este script
 * nao importa `./index` de proposito: em ESM os imports sao avaliados antes das
 * instrucoes, entao o cliente comum nasceria apontando para o banco do
 * `.env.local` — desenvolvimento — mesmo com um arquivo de producao na linha
 * de comando.
 */
lerAmbienteDoArgumento();
anunciarDestino();

const client = postgres(process.env.DATABASE_URL as string, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
});

async function main() {
  const tabelas = (await client`
    select table_schema as "schemaName", table_name as "nome"
      from information_schema.tables
     where table_type = 'BASE TABLE'
       and table_schema in ('public', 'drizzle')
     order by table_schema, table_name
  `) as unknown as Tabela[];

  const retrato: Record<string, unknown[]> = {};
  let total = 0;

  console.log("");
  for (const t of tabelas) {
    const chave = t.schemaName === "public" ? t.nome : `${t.schemaName}.${t.nome}`;

    // O nome da tabela vem do proprio banco, nunca de entrada externa.
    const linhas = (await client.unsafe(
      `select * from "${t.schemaName}"."${t.nome}"`,
    )) as unknown as unknown[];

    retrato[chave] = linhas;
    total += linhas.length;
    console.log(`  ${String(linhas.length).padStart(6)}  ${chave}`);
  }

  /*
   * O arquivo leva o ref do projeto no nome. Dois retratos de bancos diferentes
   * com o mesmo nome, na mesma pasta, e um erro que so aparece na hora de
   * restaurar — tarde demais para descobrir qual era qual.
   */
  const ref = refDaConexao(process.env.DATABASE_URL);
  const destino = process.env.BACKUP_OUT ?? `../mkt-backup-${ref ?? "sem-ref"}.json`;
  writeFileSync(destino, JSON.stringify(retrato, null, 1), "utf8");

  console.log(`\n${total} linhas em ${tabelas.length} tabelas`);
  console.log(`Gravado em ${destino}`);
}

main()
  .then(() => client.end())
  .catch(async (erro) => {
    console.error(erro);
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
