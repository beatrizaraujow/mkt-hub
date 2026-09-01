/**
 * Aplica as migrations pendentes no banco apontado.
 *
 *   npm run db:pendentes                       diz o que falta, e onde
 *   npm run db:pendentes -- ../mkt-prod.env    diz o que falta em producao
 *   npm run db:pendentes -- ../mkt-prod.env --aplicar
 *   npm run db:pendentes -- ../mkt-prod.env --registrar 0014_melodic_overlord --aplicar
 *
 * **Existe porque `drizzle-kit migrate` nao serve para este projeto.** Producao
 * nasceu por `db:push`, que escreve o schema sem registrar nada em
 * `drizzle.__drizzle_migrations`. O resultado e um banco em que a coluna existe
 * e a migration que a criou consta como pendente — e o `migrate` para tudo no
 * primeiro `42701: column already exists`, sem aplicar o que vinha depois. Em
 * 01/09/2026, producao tinha 14 registros e a pasta tinha 15 arquivos.
 *
 * `--registrar <tag>` marca uma migration como aplicada **sem** rodar o SQL. E
 * a saida para esse caso, e so para ele: use quando a alteracao ja estiver no
 * banco e o que falta for o registro. Confira a coluna antes — marcar como
 * aplicado o que nao foi e trocar um erro barulhento por um buraco silencioso.
 *
 * Cada migration roda dentro de uma transacao com o proprio registro: ou o SQL
 * e o registro entram juntos, ou nenhum dos dois. Metade aplicada e sem registro
 * e o estado que criou este script.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { anunciarDestino, lerAmbienteDoArgumento } from "./destino";

type Entrada = { idx: number; when: number; tag: string };

lerAmbienteDoArgumento();
const onde = anunciarDestino();

const aplicar = process.argv.includes("--aplicar");
const posRegistrar = process.argv.indexOf("--registrar");
const soRegistrar = posRegistrar !== -1 ? process.argv[posRegistrar + 1] : null;

const client = postgres(process.env.DATABASE_URL as string, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
});

const PASTA = path.join(process.cwd(), "drizzle");

function ler(tag: string) {
  const arquivo = path.join(PASTA, `${tag}.sql`);
  const bruto = readFileSync(arquivo);
  return {
    // O hash e do arquivo cru, byte a byte — e o mesmo que o drizzle calcula.
    hash: createHash("sha256").update(bruto).digest("hex"),
    comandos: bruto
      .toString("utf8")
      .split("--> statement-breakpoint")
      .map((parte) => parte.trim())
      .filter((parte) => parte.length > 0),
  };
}

async function main() {
  const journal = JSON.parse(
    readFileSync(path.join(PASTA, "meta", "_journal.json"), "utf8"),
  ) as { entries: Entrada[] };

  await client`create schema if not exists drizzle`;
  await client`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;

  const jaAplicadas = new Set(
    (
      (await client`select hash from drizzle.__drizzle_migrations`) as unknown as Array<{
        hash: string;
      }>
    ).map((linha) => linha.hash),
  );

  const pendentes = journal.entries.filter((entrada) => !jaAplicadas.has(ler(entrada.tag).hash));

  console.log(
    `\n${journal.entries.length} na pasta · ${jaAplicadas.size} registradas · ${pendentes.length} pendentes\n`,
  );

  if (pendentes.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  for (const entrada of pendentes) {
    const { hash, comandos } = ler(entrada.tag);
    const registrarApenas = entrada.tag === soRegistrar;

    console.log(`── ${entrada.tag}${registrarApenas ? "   (so registrar)" : ""}`);
    for (const comando of comandos) console.log(`     ${comando.replace(/\s+/g, " ").slice(0, 110)}`);

    if (!aplicar) continue;

    await client.begin(async (tx) => {
      if (!registrarApenas) {
        for (const comando of comandos) await tx.unsafe(comando);
      }
      await tx`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${entrada.when})
      `;
    });

    console.log(registrarApenas ? "     registrada.\n" : "     aplicada.\n");
  }

  console.log(
    aplicar
      ? `\nPronto em ${onde}.`
      : `\nSimulacao — nada foi escrito em ${onde}. Use -- --aplicar.`,
  );
}

main()
  .then(() => client.end())
  .catch(async (erro) => {
    console.error(erro);
    /*
     * O codigo de saida e marcado **antes** de esperar o fim da conexao. Com o
     * banco fora de alcance, `client.end()` pode nunca resolver — o `await`
     * abaixo trava, o `process.exit(1)` nunca roda, e o Node encerra sozinho
     * com codigo 0 quando o event loop esvazia.
     */
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
