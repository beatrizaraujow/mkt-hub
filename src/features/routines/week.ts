/**
 * As contas da grade de rotina. Puras, sem banco e sem `server-only`.
 *
 * Ficam separadas porque decidem o que o time vê como atrasado, e porque a
 * fronteira da semana é onde esse tipo de cálculo sempre erra: domingo cai na
 * semana anterior se ninguém disser o contrário, e "hoje" vira ontem se o
 * servidor pensar em UTC.
 *
 * Semana começa na **segunda**, como em `lib/month`.
 */

import { parseYmd, toYmd, weekdayIndex } from "@/lib/month";

/** Rótulo curto de cada coluna da grade, na ordem em que aparecem. */
export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

export const WEEKDAY_FULL = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
] as const;

/** A segunda-feira da semana em que o dia cai. */
export function mondayOf(ymd: string): string {
  const date = parseYmd(ymd);
  date.setDate(date.getDate() - weekdayIndex(date));
  return toYmd(date);
}

/** Os sete dias da semana que começa nessa segunda. */
export function weekDays(monday: string): string[] {
  const start = parseYmd(monday);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return toYmd(day);
  });
}

export function shiftWeek(monday: string, deltaWeeks: number): string {
  const date = parseYmd(monday);
  date.setDate(date.getDate() + deltaWeeks * 7);
  return toYmd(date);
}

export function isWeek(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** "25 de ago a 31 de ago" — o cabeçalho da grade. */
export function weekLabel(monday: string): string {
  const days = weekDays(monday);
  const format = (ymd: string) =>
    new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
      .format(parseYmd(ymd))
      .replace(".", "");
  return `${format(days[0])} a ${format(days[6])}`;
}

export type CellState = "previsto" | "feito" | "atrasado" | "fora";

/**
 * O estado de uma célula.
 *
 * Três estados visíveis e um invisível. `fora` é o dia em que aquela rotina
 * não tem nada previsto — a célula existe na grade porque a linha tem sete
 * colunas, mas não cobra nada de ninguém.
 *
 * Atrasado é só o que **passou** e não saiu. O dia de hoje continua previsto
 * até virar: cobrar às nove da manhã o post que sai às seis da tarde ensina o
 * time a ignorar a cor vermelha.
 */
export function cellState({
  scheduled,
  published,
  day,
  today,
}: {
  scheduled: boolean;
  published: boolean;
  day: string;
  today: string;
}): CellState {
  if (!scheduled) return "fora";
  if (published) return "feito";
  return day < today ? "atrasado" : "previsto";
}

/**
 * Os dias, dentro de uma semana, em que a rotina deveria sair.
 *
 * `weekdays` é 0 a 6 com segunda = 0. Valor fora dessa faixa é ignorado em
 * vez de derrubar a grade: uma linha estragada no banco não pode apagar a
 * semana inteira da tela.
 */
export function daysForRoutine(monday: string, weekdays: number[]): string[] {
  const days = weekDays(monday);
  return [...new Set(weekdays)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index <= 6)
    .sort((a, b) => a - b)
    .map((index) => days[index]);
}

/**
 * Se a semana pedida ainda pode materializar ocorrência.
 *
 * Semana que já terminou, não. A grade de uma semana passada é leitura do que
 * houve — gerar ali criaria tarefa nascida atrasada, com responsável de
 * verdade, por alguém ter clicado na seta para trás. Cobrança retroativa que
 * ninguém tinha é pior que buraco na grade antiga.
 *
 * A semana corrente conta como aberta o tempo inteiro, inclusive no domingo.
 */
export function generatesFor(monday: string, today: string): boolean {
  return monday >= mondayOf(today);
}

/**
 * O que a geração precisa criar para uma semana.
 *
 * Devolve só o que falta: o que já existe entra em `existing` e não volta. É o
 * que permite rodar isto na leitura da tela, sem cron e sem fila — e o índice
 * único no banco é a segunda linha de defesa, para duas abas abertas ao mesmo
 * tempo não criarem a mesma ocorrência duas vezes.
 */
export function missingOccurrences(
  routines: Array<{ id: string; weekdays: number[] }>,
  monday: string,
  existing: Array<{ routineId: string; day: string }>,
): Array<{ routineId: string; day: string }> {
  const seen = new Set(existing.map((row) => `${row.routineId}|${row.day}`));

  return routines.flatMap((routine) =>
    daysForRoutine(monday, routine.weekdays)
      .filter((day) => !seen.has(`${routine.id}|${day}`))
      .map((day) => ({ routineId: routine.id, day })),
  );
}
