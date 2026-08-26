export type StageLike = { id: string; name: string; kind: string; position: number };

/**
 * Voltar de um estagio de revisao para tras: alguem olhou a entrega e mandou
 * refazer. Esse e o unico movimento que exige motivo.
 *
 * Retrabalho sem registro e retrabalho que ninguem consegue contar depois —
 * a peca volta, o tempo dobra, e no fim da semana a conta nao fecha e nao ha
 * como saber por que. Um campo obrigatorio aqui e o que transforma isso em
 * numero.
 *
 * A comparacao e por **posicao**, nao por tipo do destino. Com quatro etapas
 * de revisao em sequencia — pre revisao, revisao IA, aprovacao e aprovacao
 * lider — avancar de uma para a seguinte tambem e sair de uma revisao, e a
 * regra antiga pedia motivo para seguir em frente. Motivo pedido no caminho
 * normal vira "-" digitado para passar, e ai o dado de retrabalho morre.
 *
 * A regra e so essa de proposito. Pedir motivo em toda ida para tras
 * (corrigir clique errado, tirar da fila) vira formulario chato. O que
 * interessa e a reprovacao.
 */
export function needsReason(from: StageLike | undefined, to: StageLike) {
  return Boolean(from && from.kind === "review" && to.position < from.position);
}

export const REASON_MIN = 4;
export const REASON_MAX = 600;
