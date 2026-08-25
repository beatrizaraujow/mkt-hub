export type StageLike = { id: string; name: string; kind: string };

/**
 * Sair de um estagio de revisao para qualquer coisa que nao seja concluido e
 * reprovacao: alguem olhou a entrega e mandou de volta. Esse e o unico
 * movimento que exige motivo.
 *
 * Retrabalho sem registro e retrabalho que ninguem consegue contar depois —
 * a peca volta, o tempo dobra, e no fim da semana a conta nao fecha e nao ha
 * como saber por que. Um campo obrigatorio aqui e o que transforma isso em
 * numero.
 *
 * A regra e so essa de proposito. Pedir motivo em toda ida para tras
 * (corrigir clique errado, tirar da fila) vira formulario chato e as pessoas
 * escrevem "-" para passar. O que interessa e a reprovacao.
 */
export function needsReason(from: StageLike | undefined, to: StageLike) {
  return Boolean(from && from.kind === "review" && to.kind !== "done");
}

export const REASON_MIN = 4;
export const REASON_MAX = 600;
