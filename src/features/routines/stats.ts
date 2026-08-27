/**
 * As contas de aderencia da grade. Puras, sem banco e sem `server-only`.
 *
 * **A regra que decide tudo:** a porcentagem so conta o que ja venceu. O dia
 * de hoje entra no denominador quando vira, nao quando comeca.
 *
 * Sem isso o numero mente duas vezes. Na segunda de manha a semana inteira
 * estaria "0% feita", com nada atrasado — e o time aprenderia a ignorar o
 * numero por ser sempre vermelho no comeco. E na sexta o mesmo numero
 * misturaria o que falhou com o que ainda nem chegou.
 *
 * A propriedade que isso garante: **o numero de cima nunca contradiz os
 * quadradinhos de baixo.** `feitas` sao os verdes, `atrasadas` sao os
 * vermelhos, `previstas` sao os vazios — a mesma classificacao de
 * `cellState`, com o mesmo corte de dia. Se alguem somar os quadrados na mao,
 * chega no mesmo lugar. Numero de painel que nao fecha com a tela e pior que
 * painel nenhum, porque quem confere uma vez para de confiar para sempre.
 */

export type Ocorrencia = {
  empresaId: string;
  empresaNome: string;
  empresaCor: string;
  pessoaId: string | null;
  pessoaNome: string | null;
  dia: string;
  publicada: boolean;
};

export type Resumo = {
  feitas: number;
  atrasadas: number;
  previstas: number;
  /** O que ja venceu: feitas + atrasadas. E o denominador da porcentagem. */
  cobradas: number;
  /** `null` quando nada venceu ainda — e diferente de zero por cento. */
  pct: number | null;
};

export type Fatia = {
  id: string;
  nome: string;
  cor: string | null;
  resumo: Resumo;
};

/** Rotina sem responsavel continua sendo cobrada de alguem. */
export const SEM_RESPONSAVEL = "sem-responsavel";

export function resumir(ocorrencias: Ocorrencia[], hoje: string): Resumo {
  let feitas = 0;
  let atrasadas = 0;
  let previstas = 0;

  for (const ocorrencia of ocorrencias) {
    if (ocorrencia.publicada) feitas++;
    else if (ocorrencia.dia < hoje) atrasadas++;
    else previstas++;
  }

  const cobradas = feitas + atrasadas;

  return {
    feitas,
    atrasadas,
    previstas,
    cobradas,
    pct: cobradas > 0 ? Math.round((feitas / cobradas) * 100) : null,
  };
}

function agrupar(
  ocorrencias: Ocorrencia[],
  hoje: string,
  chave: (o: Ocorrencia) => { id: string; nome: string; cor: string | null },
): Fatia[] {
  const baldes = new Map<string, { nome: string; cor: string | null; itens: Ocorrencia[] }>();

  for (const ocorrencia of ocorrencias) {
    const { id, nome, cor } = chave(ocorrencia);
    const balde = baldes.get(id);
    if (balde) balde.itens.push(ocorrencia);
    else baldes.set(id, { nome, cor, itens: [ocorrencia] });
  }

  return [...baldes].map(([id, balde]) => ({
    id,
    nome: balde.nome,
    cor: balde.cor,
    resumo: resumir(balde.itens, hoje),
  }));
}

/**
 * Por empresa, pior primeiro.
 *
 * Aqui a ordem por pior e util e nao machuca ninguem: empresa nao le a tela e
 * nao se sente exposta. O gargalo aparece sozinho, que e o ponto da tela.
 * Quem ainda nao teve nada cobrado vai para o fim — nao ha o que ordenar.
 */
export function porEmpresa(ocorrencias: Ocorrencia[], hoje: string): Fatia[] {
  return agrupar(ocorrencias, hoje, (o) => ({
    id: o.empresaId,
    nome: o.empresaNome,
    cor: o.empresaCor,
  })).sort((a, b) => {
    if (a.resumo.pct === null) return b.resumo.pct === null ? a.nome.localeCompare(b.nome) : 1;
    if (b.resumo.pct === null) return -1;
    if (a.resumo.pct !== b.resumo.pct) return a.resumo.pct - b.resumo.pct;
    return a.nome.localeCompare(b.nome);
  });
}

/**
 * Por pessoa, em ordem alfabetica — de proposito.
 *
 * A mesma ordenacao por pior que ajuda nas empresas viraria, aqui, uma lista
 * publica de quem esta por ultimo. Com sete pessoas isso e exposicao, nao
 * motivacao, e e a mesma decisao ja tomada para o ranking. Os numeros ficam
 * todos na tela; quem quiser comparar compara. O que a tela nao faz e
 * ordenar as pessoas da pior para a melhor e chamar isso de painel.
 */
export function porPessoa(ocorrencias: Ocorrencia[], hoje: string): Fatia[] {
  return agrupar(ocorrencias, hoje, (o) => ({
    id: o.pessoaId ?? SEM_RESPONSAVEL,
    nome: o.pessoaNome ?? "Sem responsável",
    cor: null,
  })).sort((a, b) => {
    // Sem responsavel vai para o fim: e pendencia de cadastro, nao pessoa.
    if (a.id === SEM_RESPONSAVEL) return 1;
    if (b.id === SEM_RESPONSAVEL) return -1;
    return a.nome.localeCompare(b.nome);
  });
}
