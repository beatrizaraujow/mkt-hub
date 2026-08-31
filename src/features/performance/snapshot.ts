/**
 * As contas do fechamento da semana. Puras, sem banco e sem `server-only`.
 *
 * Aqui as duas reguas se encontram. Quem tem meta de pontos e medido por
 * pontos sobre meta; quem tem regua de rotinas e medido pela aderencia — o
 * mesmo numero que a grade de Rotinas ja mostra. **A moeda comum e o
 * percentual**, e e dele que sai a coin sugerida.
 *
 * Isso e o que permite as duas reguas conviverem sem uma virar cidada de
 * segunda classe: ninguem precisa converter presenca em ponto para caber numa
 * planilha que so entende ponto.
 *
 * O que este arquivo **nao** faz: creditar coin. Ele sugere. Creditar e ato
 * humano e mora no fechamento, com nome e hora.
 */

import { percentualDaMeta } from "./score";

export type Regua = {
  pessoaId: string;
  nome: string;
  cargo: string | null;
  rule: "pontos" | "rotinas";
  meta: number | null;
  meta120: number | null;
  coinsAos100: number;
  coinsAos120: number;
};

export type Bruto = {
  pessoaId: string;
  /** Da regua de pontos. */
  pontos: number;
  entregas: number;
  semPonto: number;
  /** Da regua de rotinas. */
  rotinasFeitas: number;
  rotinasCobradas: number;
};

export type Entrada = {
  pessoaId: string;
  nome: string;
  cargo: string | null;
  rule: "pontos" | "rotinas";
  pontos: number;
  entregas: number;
  semPonto: number;
  rotinasFeitas: number;
  rotinasCobradas: number;
  meta: number | null;
  meta120: number | null;
  percentual: number | null;
  posicao: number | null;
  coinsSugeridas: number;
  /**
   * O teto da regua desta pessoa, para a tela dizer "2 de 5" e nao so "2".
   *
   * **Nulo em semana fechada**, e de proposito: o snapshot guarda o que foi
   * creditado, nao a regua vigente. Semana fechada nao tem previsao — ela ja
   * aconteceu —, entao o cartao de previsao simplesmente nao aparece.
   */
  coinsAos100: number | null;
  coinsAos120: number | null;
};

const VAZIO: Omit<Bruto, "pessoaId"> = {
  pontos: 0,
  entregas: 0,
  semPonto: 0,
  rotinasFeitas: 0,
  rotinasCobradas: 0,
};

/**
 * Quanto da regua a pessoa cumpriu.
 *
 * Na regua de rotinas o denominador e o que **venceu**, nao o que estava
 * previsto na semana inteira — a mesma conta da grade, pelo mesmo motivo: o
 * dia de hoje so cobra quando vira.
 */
export function percentualDe(regua: Regua, bruto: Omit<Bruto, "pessoaId">): number | null {
  if (regua.rule === "rotinas") {
    if (bruto.rotinasCobradas <= 0) return null;
    return Math.round((bruto.rotinasFeitas / bruto.rotinasCobradas) * 100);
  }
  return percentualDaMeta(bruto.pontos, regua.meta);
}

/**
 * A coin que o sistema **sugere**. Nunca a que se paga.
 *
 * Bateu 120, leva a de 120; bateu 100, a de 100; abaixo disso, nenhuma. Sem
 * regua, nenhuma — e nao e punicao: e ausencia de configuracao, e punir
 * alguem por um cadastro que falta seria o pior jeito de estrear a ferramenta.
 */
export function coinsSugeridas(regua: Regua, percentual: number | null): number {
  if (percentual === null) return 0;
  if (percentual >= 120) return regua.coinsAos120;
  if (percentual >= 100) return regua.coinsAos100;
  return 0;
}

/**
 * Posicao dentro do **mesmo grupo de regua**.
 *
 * Comparar quem entrega pontos com quem entrega presenca produziria um ranking
 * que nao quer dizer nada — sao trabalhos diferentes com reguas diferentes. E
 * a mesma decisao que o documento de arquitetura ja tinha tomado.
 *
 * Empate divide a posicao e pula a seguinte (1, 2, 2, 4): duas pessoas com o
 * mesmo numero em posicoes diferentes seria desempate inventado. Quem nao tem
 * percentual fica sem posicao, em vez de aparecer em ultimo.
 */
function posicionar(entradas: Entrada[]): void {
  for (const grupo of ["pontos", "rotinas"] as const) {
    const doGrupo = entradas
      .filter((e) => e.rule === grupo && e.percentual !== null)
      .sort((a, b) => (b.percentual ?? 0) - (a.percentual ?? 0));

    let posicao = 0;
    let anterior: number | null = null;

    doGrupo.forEach((entrada, indice) => {
      if (entrada.percentual !== anterior) {
        posicao = indice + 1;
        anterior = entrada.percentual;
      }
      entrada.posicao = posicao;
    });
  }
}

/**
 * Monta as linhas do fechamento.
 *
 * Toda pessoa com regua entra, inclusive quem nao entregou nada: semana zerada
 * e informacao, e sumir da lista esconderia justamente quem precisa de
 * conversa.
 */
export function montarFechamento(reguas: Regua[], brutos: Bruto[]): Entrada[] {
  const porPessoa = new Map(brutos.map((bruto) => [bruto.pessoaId, bruto]));

  const entradas: Entrada[] = reguas.map((regua) => {
    const bruto = porPessoa.get(regua.pessoaId) ?? { pessoaId: regua.pessoaId, ...VAZIO };
    const percentual = percentualDe(regua, bruto);

    return {
      pessoaId: regua.pessoaId,
      nome: regua.nome,
      cargo: regua.cargo,
      rule: regua.rule,
      pontos: bruto.pontos,
      entregas: bruto.entregas,
      semPonto: bruto.semPonto,
      rotinasFeitas: bruto.rotinasFeitas,
      rotinasCobradas: bruto.rotinasCobradas,
      meta: regua.meta,
      meta120: regua.meta120,
      percentual,
      posicao: null,
      coinsSugeridas: coinsSugeridas(regua, percentual),
      coinsAos100: regua.coinsAos100,
      coinsAos120: regua.coinsAos120,
    };
  });

  posicionar(entradas);

  // Ordem alfabetica na lista. Quem quiser ver por desempenho ordena na tela;
  // o fechamento nao chega ja ordenado da pior para a melhor pessoa.
  return entradas.sort((a, b) => a.nome.localeCompare(b.nome));
}
