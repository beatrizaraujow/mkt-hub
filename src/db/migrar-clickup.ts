/**
 * A migracao do ClickUp inteira, em um comando.
 *
 *   npm run clickup:migrar               diz o que faria, e em qual banco
 *   npm run clickup:migrar -- --aplicar  faz
 *
 * Para producao, sem a senha passar pela linha de comando — puxe o ambiente da
 * Vercel para um arquivo fora do repositorio e aponte para ele:
 *
 *   npm run clickup:migrar -- ../mkt-prod.env --aplicar
 *
 * Ou, se preferir na mao (o espaco antes da linha mantem a senha fora do
 * `.bash_history`, mas ela ainda aparece na lista de processos):
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
import { anunciarDestino, lerAmbienteDoArgumento, ligado } from "./destino";

function rodar(passo: string, script: string, args: string[]): void {
  console.log(`
── ${passo} ${"─".repeat(Math.max(0, 60 - passo.length))}`);

  const r = spawnSync(
    process.execPath,
    [require.resolve("tsx/cli"), "--env-file=.env.local", script, ...args],
    { stdio: "inherit", env: process.env },
  );

  if (r.status !== 0) {
    console.error(`
Parou em: ${passo}. Nada depois disto rodou.`);
    process.exit(r.status ?? 1);
  }
}

const aplicar = ligado("aplicar");

lerAmbienteDoArgumento();
const onde = anunciarDestino();

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
