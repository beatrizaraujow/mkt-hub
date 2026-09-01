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
import { readFileSync } from "node:fs";

const PRODUCAO = "tnfjjaxrmatuovwjiptz";
const DESENVOLVIMENTO = "hqohquknxgiywpokmndp";

/**
 * O identificador do projeto Supabase dentro da string de conexao.
 *
 * Ele aparece em dois lugares diferentes conforme o tipo de conexao, e por isso
 * os dois sao procurados:
 *
 *   pooler   postgresql://postgres.<ref>:senha@aws-1.pooler.supabase.com:6543/...
 *   direta   postgresql://postgres:senha@db.<ref>.supabase.co:5432/...
 *
 * No pooler o host e o mesmo para todos os projetos da regiao — quem identifica
 * e o usuario. Na direta e o contrario. Olhar so um dos dois deixa metade das
 * strings sem destino reconhecido.
 */
function refDaConexao(url: string | undefined): string | null {
  if (!url) return null;

  const noUsuario = url.match(/postgres\.([a-z0-9]{16,})/i);
  if (noUsuario) return noUsuario[1];

  const noHost = url.match(/@(?:db\.)?([a-z0-9]{16,})\.supabase\.(?:co|com)/i);
  if (noHost) return noHost[1];

  return null;
}

/** A string sem a senha, para poder aparecer na tela quando algo nao bate. */
function semSenha(url: string): string {
  return url.replace(/(:\/\/[^:@/]+:)[^@]*@/, "$1***@");
}

/**
 * Le o `DATABASE_URL` de um arquivo de ambiente e o coloca no processo.
 *
 * Existe para o caso de producao: a string sai do `vercel env pull` para um
 * arquivo e e lida daqui, em vez de ser colada na linha de comando. Senha em
 * linha de comando aparece na lista de processos e, sem o espaco na frente,
 * fica no `.bash_history` — este caminho nao tem nem uma coisa nem outra.
 */
function lerDoArquivo(caminho: string): void {
  let conteudo: string;
  try {
    conteudo = readFileSync(caminho, "utf8");
  } catch {
    console.error(`Nao consegui ler ${caminho}.`);
    process.exit(1);
  }

  const linha = conteudo
    .split(/\r?\n/)
    .find((l) => l.trimStart().startsWith("DATABASE_URL="));

  if (!linha) {
    console.error(`${caminho} nao tem DATABASE_URL.`);
    process.exit(1);
  }

  // A Vercel escreve o valor entre aspas; outros geradores nao escrevem.
  const valor = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

  /*
   * Chave presente e valor vazio nao e arquivo corrompido: e o que o
   * `vercel env pull` escreve para variavel marcada como **Sensitive**. A
   * Vercel guarda o valor, usa no build e nunca o devolve — nem pelo CLI, nem
   * pelo painel. Sem este aviso o sintoma vira "nao ha DATABASE_URL" logo
   * depois de dizer que leu o arquivo, que parece defeito do script.
   */
  if (valor === "") {
    console.error(`${caminho} tem DATABASE_URL, mas vazia.`);
    console.error("Se veio do `vercel env pull`, a variavel esta marcada como Sensitive");
    console.error("na Vercel — ela nao volta por ali. A string tem de vir do Supabase.");
    process.exit(1);
  }

  process.env.DATABASE_URL = valor;
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
/*
 * O caminho vem como argumento solto, nao como `--env <caminho>`: o npm engole
 * o `--env` mesmo depois do `--` e repassa so o caminho. O script recebia um
 * argumento que nao reconhecia, ignorava, e ia para o `.env.local` — ou seja,
 * para desenvolvimento, quando quem digitou queria producao. Falhar assim, em
 * silencio e para o lado errado, e pior do que nao ter o atalho.
 *
 * Argumento solto sobrevive a qualquer camada de npm. `--env` continua aceito
 * para quem chamar o tsx direto.
 */
const soltos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const posEnv = process.argv.indexOf("--env");
const caminhoEnv = posEnv !== -1 ? process.argv[posEnv + 1] : soltos[0];

if (posEnv !== -1 && !caminhoEnv) {
  console.error("--env precisa do caminho do arquivo.");
  process.exit(1);
}

if (caminhoEnv) {
  lerDoArquivo(caminhoEnv);
  console.log(`DATABASE_URL lido de ${caminhoEnv}`);
}

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
if (ref) console.log(`  projeto ${ref}`);

if (onde === "nao definido") {
  const bruta = process.env.DATABASE_URL;
  if (!bruta) {
    console.error("\nNao ha DATABASE_URL. Nao da para saber onde escreveria.");
  } else {
    console.error("\nHa DATABASE_URL, mas nao reconheci o projeto nela:");
    console.error(`  ${semSenha(bruta)}`);
    console.error("\nEsperava `postgres.<ref>` no usuario ou `db.<ref>.supabase.co` no host.");
  }
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
