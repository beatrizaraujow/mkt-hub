/**
 * O leitor da lista colada. Puro, sem banco e sem `server-only` — a tela usa
 * para mostrar a previa e o servidor usa de novo antes de escrever.
 *
 * **A tela mostra, o servidor decide.** Nada aqui e confianca: a mesma funcao
 * roda nos dois lados, e o que vale e o resultado do servidor. A previa existe
 * para a pessoa ver o que vai acontecer, nao para o servidor economizar
 * trabalho.
 *
 * **Numero como dia da semana e recusado de proposito.** "1" quer dizer
 * segunda em um sistema e domingo em outro, e a lista colada quase sempre vem
 * de um terceiro lugar. O import das rotinas do MKT Hub 1 dependeu disso: la o
 * dia 1 era segunda, aqui e zero, e um deslocamento de um dia nao levanta erro
 * nenhum — so deixa a grade sutilmente errada por semanas. Melhor recusar e
 * pedir "seg" do que aceitar e adivinhar.
 */

/** Uma linha lida com sucesso. */
export type LinhaOk = {
  tipo: "ok";
  numero: number;
  plataforma: string;
  label: string;
  dias: number[];
  pessoaId: string | null;
  pessoaNome: string | null;
};

export type LinhaErro = {
  tipo: "erro";
  numero: number;
  texto: string;
  motivo: string;
};

export type Linha = LinhaOk | LinhaErro;

export type PessoaConhecida = { id: string; name: string; email?: string | null };

/** Sem acento, sem caixa, sem espaco sobrando. */
function chave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const DIA_POR_NOME: Record<string, number> = {
  seg: 0, segunda: 0, segundafeira: 0,
  ter: 1, terca: 1, tercafeira: 1,
  qua: 2, quarta: 2, quartafeira: 2,
  qui: 3, quinta: 3, quintafeira: 3,
  sex: 4, sexta: 4, sextafeira: 4,
  sab: 5, sabado: 5,
  dom: 6, domingo: 6,
};

const TODOS = [0, 1, 2, 3, 4, 5, 6];
const UTEIS = [0, 1, 2, 3, 4];

const ATALHOS: Array<[RegExp, number[]]> = [
  [/^(diaria|diario|diariamente|todos os dias|todo dia|todos)$/, TODOS],
  [/^(uteis|dias uteis|diaria \(dias uteis\)|semana|seg a sex|seg-sex)$/, UTEIS],
  [/^(fim de semana|fds)$/, [5, 6]],
];

/**
 * "seg, qua e sex" -> [0, 2, 4]. Aceita virgula, barra, "e" e intervalo com
 * "a" ou "-", porque lista colada vem escrita do jeito que a pessoa escreve.
 */
export function lerDias(bruto: string): { dias: number[] } | { erro: string } {
  const limpo = chave(bruto).replace(/[.]/g, "");
  if (!limpo) return { erro: "faltou dizer os dias" };

  for (const [padrao, dias] of ATALHOS) {
    if (padrao.test(limpo)) return { dias };
  }

  if (/^[\d\s,/-]+$/.test(limpo)) {
    return {
      erro: "dia em número é ambíguo (1 é segunda num sistema e domingo noutro) — escreva seg, ter…",
    };
  }

  // Intervalo: "seg a sex", "ter-qui".
  const intervalo = limpo.match(/^([a-z]+)\s*(?:a|ate|-)\s*([a-z]+)$/);
  if (intervalo) {
    const de = DIA_POR_NOME[intervalo[1]];
    const ate = DIA_POR_NOME[intervalo[2]];
    if (de === undefined) return { erro: `não reconheci o dia “${intervalo[1]}”` };
    if (ate === undefined) return { erro: `não reconheci o dia “${intervalo[2]}”` };
    if (de > ate) return { erro: `intervalo de trás para frente: “${bruto.trim()}”` };
    return { dias: TODOS.slice(de, ate + 1) };
  }

  const pedacos = limpo.split(/[,/]|\se\s|\s+/).filter(Boolean);
  const dias: number[] = [];

  for (const pedaco of pedacos) {
    const dia = DIA_POR_NOME[pedaco];
    if (dia === undefined) return { erro: `não reconheci o dia “${pedaco}”` };
    if (!dias.includes(dia)) dias.push(dia);
  }

  if (dias.length === 0) return { erro: "faltou dizer os dias" };
  return { dias: dias.sort((a, b) => a - b) };
}

/**
 * Acha a pessoa por nome ou e-mail. Nome parcial serve, desde que sobre uma
 * pessoa so: "Maria" com duas Marias no time e um erro, nao um chute.
 */
export function acharPessoa(
  bruto: string,
  pessoas: PessoaConhecida[],
): { pessoa: PessoaConhecida | null } | { erro: string } {
  const busca = chave(bruto);
  if (!busca) return { pessoa: null };

  const porEmail = pessoas.filter((pessoa) => pessoa.email && chave(pessoa.email) === busca);
  if (porEmail.length === 1) return { pessoa: porEmail[0] };

  const exatos = pessoas.filter((pessoa) => chave(pessoa.name) === busca);
  if (exatos.length === 1) return { pessoa: exatos[0] };
  if (exatos.length > 1) return { erro: `mais de uma pessoa chamada “${bruto.trim()}”` };

  const parciais = pessoas.filter((pessoa) => chave(pessoa.name).startsWith(busca));
  if (parciais.length === 1) return { pessoa: parciais[0] };
  if (parciais.length > 1) {
    return { erro: `“${bruto.trim()}” serve para ${parciais.length} pessoas — escreva o nome inteiro` };
  }

  return { erro: `não achei ninguém chamado “${bruto.trim()}”` };
}

/** Tabulação primeiro, que é o que vem de planilha; depois `;` e ` · `. */
function colunas(linha: string): string[] {
  const separador = linha.includes("\t") ? "\t" : linha.includes(";") ? ";" : " · ";
  return linha.split(separador).map((parte) => parte.trim());
}

export const MAX_LINHAS = 60;
export const MAX_LABEL = 60;

export function parseImport(texto: string, pessoas: PessoaConhecida[]): Linha[] {
  const cruas = texto.split("\n");
  const linhas: Linha[] = [];
  let numero = 0;

  for (const crua of cruas) {
    // Marcador de lista na frente e resquicio de onde a lista foi copiada.
    const limpa = crua.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim();
    if (!limpa) continue;

    numero++;
    if (linhas.length >= MAX_LINHAS) {
      linhas.push({
        tipo: "erro",
        numero,
        texto: limpa,
        motivo: `são ${MAX_LINHAS} linhas no máximo por vez`,
      });
      break;
    }

    const partes = colunas(limpa);
    const [plataforma = "", label = "", dias = "", pessoa = ""] = partes;

    const erro = (motivo: string): LinhaErro => ({ tipo: "erro", numero, texto: limpa, motivo });

    if (partes.length < 3) {
      linhas.push(erro("faltou coluna: plataforma, o que sai, dias e (opcional) responsável"));
      continue;
    }
    if (plataforma.length < 2) {
      linhas.push(erro("plataforma vazia ou curta demais"));
      continue;
    }
    if (label.length < 2) {
      linhas.push(erro("faltou dizer o que sai"));
      continue;
    }
    if (label.length > MAX_LABEL) {
      linhas.push(erro(`“o que sai” tem ${label.length} caracteres; o teto é ${MAX_LABEL}`));
      continue;
    }

    const lidos = lerDias(dias);
    if ("erro" in lidos) {
      linhas.push(erro(lidos.erro));
      continue;
    }

    const achada = acharPessoa(pessoa, pessoas);
    if ("erro" in achada) {
      linhas.push(erro(achada.erro));
      continue;
    }

    linhas.push({
      tipo: "ok",
      numero,
      plataforma,
      label,
      dias: lidos.dias,
      pessoaId: achada.pessoa?.id ?? null,
      pessoaNome: achada.pessoa?.name ?? null,
    });
  }

  return linhas;
}

/**
 * Marca o que ja existe e o que repete dentro da propria lista.
 *
 * Duas vezes a mesma rotina na lista colada e engano de quem colou, nao pedido
 * de duas rotinas iguais — e a grade nao teria como mostrar a diferenca entre
 * elas.
 */
export function marcarRepetidas(
  linhas: Linha[],
  existentes: Array<{ platform: string; label: string }>,
): Array<Linha & { repetida?: "ja-existe" | "na-lista" }> {
  const vistas = new Set(
    existentes.map((rotina) => `${chave(rotina.platform)}|${chave(rotina.label)}`),
  );
  const naLista = new Set<string>();

  return linhas.map((linha) => {
    if (linha.tipo !== "ok") return linha;
    const id = `${chave(linha.plataforma)}|${chave(linha.label)}`;
    if (vistas.has(id)) return { ...linha, repetida: "ja-existe" as const };
    if (naLista.has(id)) return { ...linha, repetida: "na-lista" as const };
    naLista.add(id);
    return linha;
  });
}
