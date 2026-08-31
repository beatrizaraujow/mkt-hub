/**
 * Todo calculo de dia no sistema e em horario de Brasilia, nunca em UTC.
 * Misturar fuso desloca prazo, "hoje" e o fechamento da semana — e o erro
 * so aparece de madrugada, quando ninguem esta olhando.
 *
 * O Brasil nao tem mais horario de verao desde 2019, entao o deslocamento
 * fixo de -03:00 e correto e evita depender de base de fuso no runtime.
 */

export const BRT_OFFSET = "-03:00";
export const BRT_TZ = "America/Sao_Paulo";

/** Data de hoje em Brasilia, no formato YYYY-MM-DD. */
export function brtToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA ja devolve YYYY-MM-DD
}

/** Soma dias a uma data YYYY-MM-DD sem passar por fuso nenhum. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Instante em que o dia comeca, em Brasilia. */
export function startOfBrtDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00${BRT_OFFSET}`);
}

/** Instante em que o dia termina, em Brasilia (exclusivo). */
export function endOfBrtDay(ymd: string): Date {
  return startOfBrtDay(addDays(ymd, 1));
}

/**
 * Prazo escolhido num <input type="date"> vira meio-dia de Brasilia.
 * Meio-dia porque nenhuma conversao de fuso razoavel joga o valor para
 * o dia anterior ou seguinte.
 */
export function dueDateFromInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T12:00:00${BRT_OFFSET}`);
}

/** Volta de timestamp para o valor de um <input type="date">. */
export function inputFromDueDate(value: Date | null): string {
  if (!value) return "";
  return brtToday(value);
}

const DAY_LABEL = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRT_TZ,
  day: "2-digit",
  month: "short",
});

/** "14 de ago", "hoje", "ontem", "amanhã". */
export function formatDueDate(value: Date | null, today: string = brtToday()): string {
  if (!value) return "";
  const ymd = brtToday(value);
  if (ymd === today) return "hoje";
  if (ymd === addDays(today, -1)) return "ontem";
  if (ymd === addDays(today, 1)) return "amanhã";
  return DAY_LABEL.format(value).replace(".", "");
}

