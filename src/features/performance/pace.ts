/**
 * Ritmo: onde a pessoa deveria estar a esta altura da semana.
 *
 * Puro, sem banco e sem React.
 *
 * **Existe porque percentual absoluto engana no meio da semana.** Trinta e tres
 * por cento na segunda-feira e uma coisa; os mesmos 33% na sexta sao outra. A
 * escala de faixa (90/70) foi feita para semana fechada, e aplicada ao meio da
 * semana pinta o time inteiro de vermelho toda segunda de manha — um alarme que
 * dispara toda semana no mesmo horario deixa de ser alarme, e as pessoas
 * aprendem a nao olhar.
 */

import type { Faixa } from "@/features/routines/stats";
import { faixaDe } from "@/features/routines/stats";

/**
 * O quanto da semana ja passou, em percentual de dias uteis.
 *
 * O dia de hoje conta como **nao passado**: ele ainda esta acontecendo, e
 * cobrar o dia inteiro as nove da manha seria a mesma injustica em escala
 * menor. Na segunda, portanto, o esperado e zero.
 */
export function ritmoEsperado(diasRestantes: number, diasNaSemana = 5): number {
  if (diasNaSemana <= 0) return 100;
  const passados = Math.max(0, diasNaSemana - diasRestantes);
  return Math.round((passados / diasNaSemana) * 100);
}

/**
 * A faixa de cor do percentual, **relativa ao ponto da semana**.
 *
 * Com a semana ja encerrada (`diasRestantes === 0`) volta a valer a regua
 * absoluta: nao ha mais ritmo a acompanhar, so resultado.
 *
 * A margem de 20 pontos existe para o numero nao piscar de cor a cada entrega.
 * Sem ela, quem esta na fronteira veria verde e vermelho alternando durante o
 * dia, e cor que muda sozinha nao comunica nada.
 */
export function faixaDoRitmo(
  percentual: number | null,
  diasRestantes: number,
  diasNaSemana = 5,
): Faixa {
  if (percentual === null) return "sem-dado";
  if (diasRestantes <= 0) return faixaDe(percentual);

  const esperado = ritmoEsperado(diasRestantes, diasNaSemana);
  if (percentual >= esperado) return "boa";
  if (percentual >= esperado - 20) return "atencao";
  return "ruim";
}

/** O que dizer embaixo do numero. */
export function textoDoRitmo(
  percentual: number | null,
  diasRestantes: number,
  diasNaSemana = 5,
): string {
  if (percentual === null) return "sem régua para medir ainda";
  if (percentual >= 100) return "meta da semana batida";
  if (diasRestantes <= 0) return "a semana já virou";

  const esperado = ritmoEsperado(diasRestantes, diasNaSemana);
  if (percentual >= esperado + 15) return "adiantado para o ponto da semana";
  if (percentual >= esperado) return "no ritmo da semana";
  return "atrás do ritmo da semana";
}
