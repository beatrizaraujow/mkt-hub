/**
 * Contas de mês para o calendário.
 *
 * Fica fora do componente porque o servidor precisa das mesmas células para
 * saber a faixa de datas a buscar. Se cada lado calculasse do seu jeito, uma
 * tarefa do dia 30 apareceria numa borda e sumiria na outra.
 *
 * Tudo em `YYYY-MM-DD` como data local. Nada de `new Date("2026-08-01")`, que
 * o navegador interpreta como UTC e devolve 31 de julho no Brasil.
 */

export function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toYmd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Segunda é o primeiro dia da semana aqui, não domingo. */
export function weekdayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function isMonth(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const text = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    parseYmd(`${month}-01`),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Os dias que a grade mostra: da segunda anterior ao dia 1 até fechar a
 * última semana. Cinco ou seis linhas, conforme o mês.
 */
export function gridDays(month: string) {
  const first = parseYmd(`${month}-01`);
  const start = new Date(first);
  start.setDate(first.getDate() - weekdayIndex(first));

  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const total = Math.ceil((weekdayIndex(first) + last.getDate()) / 7) * 7;

  return Array.from({ length: total }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return toYmd(date);
  });
}

/** Primeiro e último dia da grade, para o servidor buscar só o necessário. */
export function gridRange(month: string) {
  const days = gridDays(month);
  return { from: days[0], to: days[days.length - 1] };
}
