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
  /**
   * O total sugerido: meta mais podio. E o que vai para o snapshot e para o
   * extrato.
   *
   * Teto real: `coinsAos120` mais 3. Com os numeros de hoje da casa, 8. O MKT
   * Hub 1 tinha um `CHECK BETWEEN 0 AND 6` que nao comportava isso, e uma
   * linha fora da faixa derrubava a gravacao da equipe inteira dentro de um
   * `catch` vazio. Aqui a coluna e `smallint` sem `CHECK` — o teto e a regra,
   * nao a restricao do banco.
   */
  coinsSugeridas: number;
  /**
   * As duas parcelas, separadas, para a tela poder explicar o total.
   *
   * **Nulas em semana fechada.** O snapshot guarda o total creditado, nao a
   * decomposicao — e recompor com a regra de hoje inventaria numero para
   * semana que fechou sob outra regra. Mesmo motivo de `coinsAos100`.
   */
  coinsDaMeta: number | null;
  coinsDoPodio: number | null;
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

/** As faixas parciais, iguais para todo mundo. Ver `coinsDaMeta`. */
export const COINS_AOS_60 = 1;
export const COINS_AOS_80 = 2;

/**
 * O percentual em que a pessoa alcanca a meta de 120%.
 *
 * **Nem sempre e 120.** A meta120 e guardada, nao derivada: a da Anny e 70
 * sobre uma meta de 60, o que da 117%, e a do Samuel e 156 sobre 130, que da
 * 120 redondo. Comparar `percentual >= 120` para todo mundo tirava da Anny uma
 * faixa que ela alcanca aos 117% — era um erro de pagamento, silencioso, so
 * para quem tem meta120 fora da proporcao.
 *
 * Sem meta120 cadastrada cai em 120, que e a proporcao padrao da casa.
 */
function limiarDe120(regua: Regua): number {
  if (regua.meta === null || regua.meta120 === null || regua.meta <= 0) return 120;
  return (regua.meta120 / regua.meta) * 100;
}

/**
 * A coin que o sistema **sugere** pela meta. Nunca a que se paga.
 *
 * As faixas vieram do MKT Hub 1, do fluxo de snapshot — o que tem validacao
 * humana e o que a casa de fato usou. Entrega parcial paga parcial: 60% leva 1,
 * 80% leva 2. Abaixo de 60 nao leva nada.
 *
 * As duas faixas de cima usam o numero cadastrado da pessoa (`coinsAos100`,
 * `coinsAos120`) em vez de constante, porque ja eram configuraveis por pessoa e
 * tirar isso seria perder cadastro que ja existe. As de baixo sao fixas: a casa
 * usa o mesmo 1 e o mesmo 2 para todo mundo, e duas colunas novas no banco para
 * guardar dois numeros iguais e peso sem ganho.
 *
 * Sem regua, nenhuma — e nao e punicao: e ausencia de configuracao, e punir
 * alguem por um cadastro que falta seria o pior jeito de estrear a ferramenta.
 */
export function coinsDaMeta(regua: Regua, percentual: number | null): number {
  if (percentual === null) return 0;
  if (percentual >= limiarDe120(regua)) return regua.coinsAos120;
  if (percentual >= 100) return regua.coinsAos100;
  if (percentual >= 80) return COINS_AOS_80;
  if (percentual >= 60) return COINS_AOS_60;
  return 0;
}

/** O que o primeiro, o segundo e o terceiro lugar levam a mais. */
export const COINS_DO_PODIO = [3, 2, 1] as const;

/**
 * O bonus de posicao, portado do MKT Hub 1.
 *
 * Tres travas, e as tres sao a diferenca entre premiar e ranquear:
 *
 * - **So quem bateu a meta.** Sem isso, numa semana ruim o primeiro lugar leva
 *   bonus com 40% da propria meta, e o bonus passa a premiar ser menos pior que
 *   os outros em vez de entregar o combinado.
 * - **So o grupo de pontos.** Quem e medido por rotina nao entra: a regua dela
 *   e presenca, e presenca nao tem primeiro lugar — no maximo tem empate em
 *   100%, que viraria bonus sorteado pela ordem alfabetica.
 * - **So o podio.** Quarto lugar nao leva nada.
 *
 * Empate leva o bonus da posicao empatada, e a seguinte fica vazia — dois em
 * segundo levam +2 cada e ninguem leva +1. E a mesma decisao que `posicionar`
 * ja tomou; desempatar aqui inventaria um criterio que nao existe.
 */
export function coinsDoPodio(entrada: Pick<Entrada, "rule" | "percentual" | "posicao">): number {
  if (entrada.rule !== "pontos") return 0;
  if (entrada.percentual === null || entrada.percentual < 100) return 0;
  if (entrada.posicao === null) return 0;
  return COINS_DO_PODIO[entrada.posicao - 1] ?? 0;
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
      // Fica o da meta; o do podio entra depois, quando houver posicao.
      coinsSugeridas: coinsDaMeta(regua, percentual),
      coinsDaMeta: coinsDaMeta(regua, percentual),
      coinsDoPodio: 0,
      coinsAos100: regua.coinsAos100,
      coinsAos120: regua.coinsAos120,
    };
  });

  /*
   * O podio depende da posicao, e a posicao depende de todo mundo estar
   * calculado. Por isso e uma segunda passada, e nao uma linha no `map`.
   */
  posicionar(entradas);

  for (const entrada of entradas) {
    const podio = coinsDoPodio(entrada);
    entrada.coinsDoPodio = podio;
    // `coinsDaMeta` acabou de ser calculado acima; nulo so vem de semana fechada.
    entrada.coinsSugeridas = (entrada.coinsDaMeta ?? 0) + podio;
  }

  // Ordem alfabetica na lista. Quem quiser ver por desempenho ordena na tela;
  // o fechamento nao chega ja ordenado da pior para a melhor pessoa.
  return entradas.sort((a, b) => a.nome.localeCompare(b.nome));
}
