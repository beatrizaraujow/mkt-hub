/**
 * O texto entregue: quanto dele é preciso para julgar, e como conferir se um
 * trecho citado está mesmo lá.
 *
 * Puro de propósito — é a trava que impede o parecer de citar frase que a peça
 * não tem. Um revisor que inventa a citação é pior que nenhum: ninguém
 * consegue conferir, e quem lê para de conferir.
 */

/** Abaixo disso não é peça, é rascunho — e julgar rascunho ensina o time errado. */
const DEFAULT_MIN = 25;

/**
 * O mínimo por tipo de trabalho. Roteiro curto quase sempre é link colado no
 * lugar errado; stories legitimamente cabe em uma linha.
 */
const MIN_BY_SKILL: Array<[RegExp, number]> = [
  [/roteiro/i, 120],
  [/decupagem/i, 120],
  [/^copy$/i, 40],
  [/planejamento/i, 60],
  [/stories/i, 12],
  [/capa de reels/i, 12],
];

export function minCopyFor(skill: string | null, format: string | null): number {
  for (const [pattern, min] of MIN_BY_SKILL) {
    if (skill && pattern.test(skill)) return min;
  }
  if (format && /stories|capa de reels/i.test(format)) return 12;
  return DEFAULT_MIN;
}

/**
 * Espaço, quebra de linha e caixa não são diferença de conteúdo. Acento é:
 * "e ai" e "e aí" são coisas diferentes numa revisão de português.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * O trecho citado aparece literalmente na peça?
 *
 * Reticências no meio são aceitas como corte de quem citou — as partes
 * precisam aparecer, na ordem. O resto é comparação literal, e o que não bate
 * é descartado no servidor. O modelo não tem a palavra final sobre o que
 * sobrevive.
 */
export function quotesTheCopy(copy: string, excerpt: string): boolean {
  const haystack = normalize(copy);
  const cleaned = normalize(excerpt).replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, "");
  if (!cleaned) return false;

  let from = 0;
  for (const part of cleaned.split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/).filter(Boolean)) {
    const at = haystack.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }

  return true;
}
