/**
 * A migracao do ClickUp inteira, em um comando.
 *
 *   npm run clickup:migrar               diz o que faria, e em qual banco
 *   npm run clickup:migrar -- --aplicar  faz
 *
 * Para producao, com a string na frente do comando e um espaco antes da linha
 * (o espaco mantem a senha fora do `.bash_history`):
 *
 *    DATABASE_URL='<producao>' npm run clickup:migrar -- --aplicar
 *
 * Os tres passos, nesta ordem e parando no primeiro erro:
 *
 *   1. cria a empresa **Interno**, que recebe as 736 tarefas sem cliente;
 *   2. baixa o board para `.cu-limpo.json`;
 *   3. importa tudo, e preenche o dono que faltava no que ja estava aqui.
 *
 * A ordem nao e escolha: sem a empresa Interno o passo 3 recusaria 736
 * tarefas, e com elas 751 conclusoes, 510 pontuacoes e 1.215 horas.
 *
 * **Antes de escrever, ele diz em qual banco vai escrever** — e diz pelo
 * *usuario* da conexao, nunca pelo host: o pooler do Supabase e o mesmo nos
 * dois projetos, e o que separa e o `postgres.<ref>` antes do `@`. Ja aconteceu
 * de um update ir para o banco errado por causa disso.
 */
import { spawnSync } from "node:child_process";

const PRODUCAO = "tnfjjaxrmatuovwjiptz";
const DESENVOLVIMENTO = "hqohquknxgiywpokmndp";

/** O `postgres.<ref>` da string de conexao, que e o que identifica o projeto. */
function refDaConexao(url: string | undefined): string | null {
  const achado = url?.match(/postgres\.([a-z0-9]+)/i);
  return achado ? achado[1] : null;
}

function rodar(passo: string, script: string, args: string[]): void {
  console.log(`\n── ${passo} ${"─".repeat(Math.max(0, 60 - passo.length))}`);

  const r = spawnSync(
    process.execPath,
    [require.resolve("tsx/cli"), "--env-file=.env.local", script, ...args],
    { stdio: "inherit", env: process.env },
  );

  if (r.status !== 0) {
    console.error(`\nParou em: ${passo}. Nada depois disto rodou.`);
    process.exit(r.status ?? 1);
  }
}

const aplicar = process.argv.includes("--aplicar");

/*
 * A string do ambiente ganha do `.env.local`: o `--env-file` do Node nao
 * sobrescreve variavel que ja existe. E o que permite mandar producao pela
 * linha de comando sem editar arquivo nenhum.
 */
const ref = refDaConexao(process.env.DATABASE_URL);
const onde =
  ref === PRODUCAO
    ? "PRODUCAO"
    : ref === DESENVOLVIMENTO
      ? "desenvolvimento"
      : ref
        ? `desconhecido (${ref})`
        : "nao definido";

console.log(`Banco de destino: ${onde}`);
if (ref) console.log(`  postgres.${ref}`);

if (onde === "nao definido") {
  console.error("\nSem DATABASE_URL no ambiente e sem ref no .env.local. Nao da para saber onde escreveria.");
  process.exit(1);
}

if (!aplicar) {
  console.log("\nSimulacao. Os tres passos rodam em modo de simulacao:");
  console.log("  1. empresa Interno");
  console.log("  2. baixar o board");
  console.log("  3. importar tudo");
  console.log("\nPara valer:  npm run clickup:migrar -- --aplicar");
}

const modo = aplicar ? ["--aplicar"] : [];

rodar("1/3  empresa Interno", "src/db/add-interno.ts", modo);
rodar("2/3  baixar o board", "src/db/fetch-clickup.ts", []);
rodar("3/3  importar tudo", "src/db/import-clickup.ts", modo);

console.log(`\n${aplicar ? "Migracao concluida" : "Simulacao concluida"} em ${onde}.`);
