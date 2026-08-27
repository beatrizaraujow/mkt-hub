/**
 * O motor de pontuacao. Puro, sem banco e sem `server-only`.
 *
 * E o elo de que metas, snapshot, coins e ranking vao pender — entao ele
 * precisa ser defensavel numa reuniao, linha por linha, sem ninguem precisar
 * abrir o codigo para acreditar no numero.
 *
 * **O que conta e a etapa, nao o nome dela.** O sistema antigo decidia isso
 * comparando texto de status do ClickUp contra uma lista mantida a mao com
 * treze grafias — `'aprovacao lider'`, `'aprovação lider'`, `'concluído'`,
 * `'concluido'`. Era a fonte de bug que a analise do projeto ja apontava.
 * Aqui entra uma lista de `slug`, que e identificador e nao rotulo: o nome da
 * etapa pode mudar por empresa sem mover um ponto de lugar.
 *
 * **Entrega sem ponto nao vira zero em silencio.** Ela e contada em separado,
 * em `semPonto`. No board antigo "Ponto de atividade MKT" era o unico campo
 * obrigatorio da lista; aqui a coluna aceita nulo, e uma entrega sem ponto
 * somaria zero sem ninguem perceber ate o fechamento nao bater. Contar em
 * separado transforma um buraco invisivel num numero na tela.
 */

import { dentroDa, type Semana } from "@/lib/week";

/** O minimo que o motor precisa saber de uma entrega. */
export type Entrega = {
  id: string;
  pessoaId: string | null;
  pontos: number | null;
  /** Slug da etapa em que a entrega esta agora. */
  etapa: string;
  /** Dia BRT em que ela foi concluida. `null` enquanto nao concluiu. */
  concluidaEm: string | null;
};

export type LinhaDaSemana = {
  pessoaId: string;
  pontos: number;
  entregas: number;
  /** Entregas concluidas que nao tinham ponto. O buraco, contado. */
  semPonto: number;
};

export type Pontuacao = {
  semana: Semana;
  linhas: LinhaDaSemana[];
  /** Concluidas na semana sem responsavel: nao somam para ninguem. */
  semResponsavel: number;
  /** Soma de tudo que contou, para conferir o total sem refazer a conta. */
  total: number;
};

/**
 * As etapas que fazem uma entrega contar.
 *
 * Padrao: as duas de `kind: done`. E a leitura conservadora — a peca pontua
 * quando terminou, nao quando entrou na fila de aprovacao. O sistema antigo
 * contava a partir de `aprovar`, e mudar isso muda quando as pessoas ganham
 * ponto, entao a lista e **parametro** e nao constante: trocar e configuracao,
 * nao deploy de logica nova.
 */
export const ETAPAS_QUE_PONTUAM = ["completo", "banco_criativos"] as const;

export function pontuar(
  entregas: Entrega[],
  semana: Semana,
  etapasQuePontuam: readonly string[] = ETAPAS_QUE_PONTUAM,
): Pontuacao {
  const contam = new Set(etapasQuePontuam);
  const porPessoa = new Map<string, LinhaDaSemana>();
  let semResponsavel = 0;
  let total = 0;

  for (const entrega of entregas) {
    // Sem data de conclusao nao ha semana a que pertencer. Item que voltou
    // para ajuste tem a data limpa pelo sistema, e para de contar ate concluir
    // de novo — o que e certo: retrabalho nao pontua duas vezes.
    if (!entrega.concluidaEm) continue;
    if (!dentroDa(semana, entrega.concluidaEm)) continue;
    if (!contam.has(entrega.etapa)) continue;

    if (!entrega.pessoaId) {
      semResponsavel++;
      continue;
    }

    const linha = porPessoa.get(entrega.pessoaId) ?? {
      pessoaId: entrega.pessoaId,
      pontos: 0,
      entregas: 0,
      semPonto: 0,
    };

    linha.entregas++;
    if (entrega.pontos === null || entrega.pontos === undefined) linha.semPonto++;
    else {
      linha.pontos += entrega.pontos;
      total += entrega.pontos;
    }

    porPessoa.set(entrega.pessoaId, linha);
  }

  return {
    semana,
    // Ordem alfabetica por id e estavel; quem ordena para exibir e a tela, que
    // sabe os nomes. Motor nao decide ranking.
    linhas: [...porPessoa.values()].sort((a, b) => a.pessoaId.localeCompare(b.pessoaId)),
    semResponsavel,
    total,
  };
}

/**
 * Quanto da meta a pessoa fez.
 *
 * `null` quando nao ha meta — que e diferente de zero por cento. Pessoa sem
 * meta cadastrada nao esta com desempenho ruim, esta sem regua; mostrar 0%
 * seria acusar alguem por uma configuracao que falta.
 */
export function percentualDaMeta(pontos: number, meta: number | null): number | null {
  if (meta === null || meta <= 0) return null;
  return Math.round((pontos / meta) * 100);
}
