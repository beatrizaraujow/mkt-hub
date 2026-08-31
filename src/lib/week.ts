/**
 * A semana, que e a unidade em que o desempenho fecha.
 *
 * Puro, sem banco e sem `server-only`. Mora em `lib` e nao dentro de uma
 * feature porque pontuacao, metas, coins e snapshot vao todos depender da
 * **mesma** fronteira — e duas definicoes de "que semana e essa" produziriam
 * um fechamento que nao bate com o proprio ranking.
 *
 * Semana comeca na **segunda**, como em `lib/month`. O identificador segue a
 * ISO 8601 (`2026-W35`), onde a semana 1 e a que contem a primeira
 * quinta-feira do ano. Nao e capricho: e o unico criterio que faz a virada de
 * ano cair sempre no mesmo lugar, em vez de gerar uma semana de tres dias que
 * ninguem sabe se conta para dezembro ou para janeiro.
 */

import { parseYmd, toYmd, weekdayIndex } from "./month";

/** A segunda-feira da semana em que o dia cai. */
export function mondayOf(ymd: string): string {
  const date = parseYmd(ymd);
  date.setDate(date.getDate() - weekdayIndex(date));
  return toYmd(date);
}

export function sundayOf(ymd: string): string {
  const date = parseYmd(mondayOf(ymd));
  date.setDate(date.getDate() + 6);
  return toYmd(date);
}

/**
 * `2026-08-27` -> `2026-W35`.
 *
 * O ano do identificador e o ano da **quinta-feira** da semana, nao o do dia
 * pedido. E o que faz 31 de dezembro de 2026, que cai numa quinta, pertencer a
 * semana 53 de 2026 — e 1 de janeiro de 2027, que cai na mesma semana, receber
 * o mesmo identificador em vez de abrir uma semana 1 com um dia so.
 */
export function weekIdOf(ymd: string): string {
  const quinta = parseYmd(mondayOf(ymd));
  quinta.setDate(quinta.getDate() + 3);

  const ano = quinta.getFullYear();
  const primeiraQuinta = parseYmd(`${ano}-01-04`);
  primeiraQuinta.setDate(primeiraQuinta.getDate() - weekdayIndex(primeiraQuinta) + 3);

  const semanas =
    Math.round((quinta.getTime() - primeiraQuinta.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

  return `${ano}-W${String(semanas).padStart(2, "0")}`;
}

export type Semana = { id: string; inicio: string; fim: string };

export function semanaDe(ymd: string): Semana {
  return { id: weekIdOf(ymd), inicio: mondayOf(ymd), fim: sundayOf(ymd) };
}

export function shiftWeek(ymd: string, deltaSemanas: number): string {
  const date = parseYmd(mondayOf(ymd));
  date.setDate(date.getDate() + deltaSemanas * 7);
  return toYmd(date);
}

/**
 * Um dia, no formato de intervalo.
 *
 * O motor de pontuacao recebe `Semana` e so pergunta se a entrega caiu entre
 * `inicio` e `fim`. Um dia e o intervalo em que os dois sao iguais — entao o
 * placar diario reusa `pontuar()` inteiro, sem uma linha de logica nova e sem
 * a chance de as duas contas discordarem no dia em que a regra mudar.
 */
export function diaDe(ymd: string): Semana {
  return { id: ymd, inicio: ymd, fim: ymd };
}

/**
 * Dias uteis que ainda restam na semana, contando hoje.
 *
 * Segunda a sexta. Sabado e domingo estao dentro da semana para efeito de
 * pontuacao — quem entregar no sabado pontua —, mas nao entram nesta conta:
 * ela existe para responder "quanto por dia eu preciso fazer", e ninguem
 * planeja o proprio fim de semana como dia util.
 *
 * **Nao sabe de feriado.** A semana do corte, com 07/09 no meio, vai contar
 * cinco onde ha quatro. Calendario de feriados e assunto de V2; enquanto nao
 * existir, a conta erra para mais, o que faz a meta parecer mais facil do que
 * e — e esse e o erro menos danoso dos dois.
 */
export function diasUteisRestantes(hoje: string, fimDaSemana: string): number {
  let dias = 0;
  const cursor = parseYmd(hoje);
  const fim = parseYmd(fimDaSemana);
  while (cursor <= fim) {
    const dia = cursor.getDay();
    if (dia >= 1 && dia <= 5) dias++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

/** Se o dia cai dentro da semana. Inclusivo nas duas pontas. */
export function dentroDa(semana: Semana, ymd: string): boolean {
  return ymd >= semana.inicio && ymd <= semana.fim;
}
