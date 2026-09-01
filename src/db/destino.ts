/**
 * Saber para qual banco um script esta apontando, antes de ele escrever.
 *
 * Isto vive separado porque mais de um script de linha de comando precisa da
 * mesma resposta, e porque a resposta errada custa caro: em 31/08/2026 um
 * update foi para desenvolvimento com o painel aberto em producao, e nada na
 * tela dizia qual dos dois estava sendo tocado.
 */
import { readFileSync } from "node:fs";

export const PRODUCAO = "tnfjjaxrmatuovwjiptz";
export const DESENVOLVIMENTO = "hqohquknxgiywpokmndp";

/**
 * O identificador do projeto Supabase dentro da string de conexao.
 *
 * Ele aparece em dois lugares diferentes conforme o tipo de conexao, e por isso
 * os dois sao procurados:
 *
 *   pooler   postgresql://<usuario>.<ref>:senha@aws-0-sa-east-1.pooler.supabase.com:6543/...
 *   direta   postgresql://postgres:senha@db.<ref>.supabase.co:5432/...
 *
 * No pooler o host e o mesmo para todos os projetos da regiao — quem identifica
 * e o usuario. Na direta e o contrario. Olhar so um dos dois deixa metade das
 * strings sem destino reconhecido, e uma trava que nao reconhece a conexao
 * certa nao e conservadora: e inutil, porque quem so quer rodar aprende a
 * contorna-la.
 */
export function refDaConexao(url: string | undefined): string | null {
  if (!url) return null;

  // Qualquer usuario, nao so `postgres`: um usuario temporario criado para uma
  // tarefa pontual usa o mesmo formato, `<usuario>.<ref>`.
  const noUsuario = url.match(/\/\/[a-z0-9_]+\.([a-z0-9]{20})[:@]/i);
  if (noUsuario) return noUsuario[1];

  const noHost = url.match(/@(?:db\.)?([a-z0-9]{16,})\.supabase\.(?:co|com)/i);
  if (noHost) return noHost[1];

  return null;
}

/** O nome do banco, para aparecer na tela antes de qualquer escrita. */
export function nomeDoDestino(ref: string | null): string {
  if (ref === PRODUCAO) return "PRODUCAO";
  if (ref === DESENVOLVIMENTO) return "desenvolvimento";
  return ref ? `desconhecido (${ref})` : "nao definido";
}

/** A string sem a senha, para poder aparecer na tela quando algo nao bate. */
export function semSenha(url: string): string {
  return url.replace(/(:\/\/[^:@/]+:)[^@]*@/, "$1***@");
}

/**
 * Le o `DATABASE_URL` de um arquivo de ambiente e o coloca no processo.
 *
 * Existe para o caso de producao: a string sai do painel para um arquivo fora
 * do repositorio e e lida daqui, em vez de ser colada na linha de comando.
 * Senha em linha de comando aparece na lista de processos e, sem o espaco na
 * frente, fica no historico do shell — este caminho nao tem nem uma coisa nem
 * outra.
 */
export function lerDoArquivo(caminho: string): void {
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

/**
 * Aplica o arquivo de ambiente passado na linha de comando, se houver.
 *
 * O caminho vem como argumento solto, nao como `--env <caminho>`: o npm engole
 * o `--env` mesmo depois do `--` e repassa so o caminho. O script recebia um
 * argumento que nao reconhecia, ignorava, e ia para o `.env.local` — ou seja,
 * para desenvolvimento, quando quem digitou queria producao. Falhar em
 * silencio e para o lado errado sao as duas piores propriedades juntas.
 *
 * **Precisa rodar antes de qualquer `import` que abra conexao.** Em ESM os
 * imports sao avaliados antes das instrucoes do arquivo, entao um script que
 * importe o cliente comum ja nasce conectado ao banco do `.env.local`. Quem
 * usa isto abre a propria conexao depois de chamar esta funcao.
 */
export function lerAmbienteDoArgumento(): string | null {
  const soltos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const posEnv = process.argv.indexOf("--env");
  const caminho = posEnv !== -1 ? process.argv[posEnv + 1] : soltos[0];

  if (posEnv !== -1 && !caminho) {
    console.error("--env precisa do caminho do arquivo.");
    process.exit(1);
  }

  if (caminho) {
    lerDoArquivo(caminho);
    console.log(`DATABASE_URL lido de ${caminho}`);
  }

  return caminho ?? null;
}

/** Diz o destino na tela e para se nao souber qual e. */
export function anunciarDestino(): string {
  const ref = refDaConexao(process.env.DATABASE_URL);
  const onde = nomeDoDestino(ref);

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

  return onde;
}
