/**
 * O veredito, e nada mais.
 *
 * Duas funções puras, sem banco e sem rede, porque são as duas decisões que o
 * sistema toma sozinho. Tudo o mais aqui é transporte.
 */

export type Verdict = "aprovado" | "ajustar" | "reprovado";

/**
 * A regra violada decide, a nota não.
 *
 * Violou regra inegociável, reprova. Achou algo que não é inegociável, manda
 * ajustar. Não achou nada, passa. Quem recebe lê o nome da regra e sabe o que
 * fazer — que é a diferença entre um parecer que se discute e um que se
 * ignora.
 *
 * Não existe nota em lugar nenhum deste sistema. Número gerado por modelo
 * oscila entre execuções, não se calibra, e ninguém consegue defender por que
 * foi 6,8 e não 7,1 — mas todo mundo passa a decidir por ele.
 */
export function verdictFrom(findings: Array<{ isBlocking: boolean }>): Verdict {
  if (findings.some((finding) => finding.isBlocking)) return "reprovado";
  return findings.length > 0 ? "ajustar" : "aprovado";
}

/** Quantas reprovações seguidas antes de o sistema parar de decidir. */
export const MAX_REJECTIONS = 3;

/**
 * A trava de pingue-pongue.
 *
 * `history` são os vereditos anteriores da mesma entrega, do mais antigo para
 * o mais novo. Se as reprovações chegaram ao teto, a rodada atual ainda emite
 * parecer — mas não move nada, e a entrega vai para uma pessoa com as rodadas
 * lado a lado.
 *
 * Ciclo infinito de robô reprovando e designer ajustando é pior que não ter
 * revisão: cansa o time e ensina todo mundo a pular o parecer.
 */
export function shouldEscalate(history: Array<Verdict | null>, current: Verdict): boolean {
  if (current !== "reprovado") return false;

  let streak = 1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] !== "reprovado") break;
    streak += 1;
  }

  return streak >= MAX_REJECTIONS;
}

export type HumanReaction = "concordou" | "discordou";

/**
 * O que a pessoa achou do parecer, lido do que ela fez com a entrega.
 *
 * Ninguem responde questionario sobre parecer de robo — perguntar em uma
 * caixinha depois de cada revisao seria ignorado em uma semana. Entao a
 * leitura vem do movimento: o parecer pediu trabalho e a pessoa mandou a peca
 * adiante mesmo assim, ela discordou; mandou refazer, concordou.
 *
 * E inferencia, e esta escrito na tela de medicao que e inferencia. Sem isso
 * nao existe taxa de reversao, e sem taxa de reversao nao existe como decidir
 * se a ferramenta fica.
 */
export function humanReaction(
  verdict: Verdict | null,
  movedForward: boolean,
): HumanReaction | null {
  if (!verdict) return null;

  // `ajustar` e `reprovado` pedem trabalho; `aprovado` diz que pode seguir.
  const askedForWork = verdict !== "aprovado";
  if (askedForWork) return movedForward ? "discordou" : "concordou";
  return movedForward ? "concordou" : "discordou";
}
