"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OptionGroup } from "@/lib/catalog";
import { PopoverHint, PopoverPanel, useAnchoredPopover } from "@/components/ui/popover";

const trigger =
  "flex h-7 w-full items-center gap-1.5 rounded-[var(--radius-control)] border bg-surface px-2 " +
  "text-left text-[13px] transition-colors duration-150";

const row =
  "flex w-full items-center gap-2 px-3 py-[7px] text-left text-[13px] transition-colors duration-100";

/* ------------------------------------------------------------ lista com grupos */

/** Busca ignora acento e caixa: ninguém digita "vídeo" com acento num filtro. */
function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

type Flat = { value: string; label: string; group: string | null };

function flatten(groups: OptionGroup[], emptyLabel: string): Flat[] {
  const out: Flat[] = [{ value: "", label: emptyLabel, group: null }];
  for (const g of groups) {
    for (const item of g.items) out.push({ value: item, label: item, group: g.label });
  }
  return out;
}

export function OptionField({
  value,
  groups,
  options,
  emptyLabel = "—",
  allowEmpty = true,
  searchable = false,
  searchPlaceholder = "Buscar…",
  renderOption,
  onChange,
  disabled,
}: {
  value: string;
  /** Opcoes do catalogo, ja agrupadas. */
  groups?: OptionGroup[];
  /** Ou uma lista pronta, quando o valor nao e o proprio rotulo. */
  options?: Flat[];
  emptyLabel?: string;
  allowEmpty?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  /**
   * Desenha a opcao no lugar do texto puro — no gatilho e na lista.
   *
   * Existe para a etapa poder aparecer com o mesmo pill da lista e do quadro
   * sem que este controle, que tambem serve Tipo e Formato, precise saber o
   * que e uma etapa.
   */
  renderOption?: (option: Flat) => React.ReactNode;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { open, setOpen, rect, triggerRef, panelRef } = useAnchoredPopover(258);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => {
    if (options) return allowEmpty ? [{ value: "", label: emptyLabel, group: null }, ...options] : options;
    return flatten(groups ?? [], emptyLabel);
  }, [options, groups, emptyLabel, allowEmpty]);

  const shown = useMemo(() => {
    const term = fold(query);
    if (!term) return all;
    return all.filter((o) => o.value && fold(o.label).includes(term));
  }, [all, query]);

  // Abrir e um evento, nao um efeito: reseta busca e cursor na hora do clique.
  function toggle() {
    if (!open) {
      setQuery("");
      const index = all.findIndex((o) => o.value === value);
      setCursor(index < 0 ? 0 : index);
    }
    setOpen(!open);
  }

  // Filtrar encurta a lista; o cursor acompanha sem precisar de efeito.
  const active = Math.min(cursor, Math.max(0, shown.length - 1));

  function choose(next: string) {
    setOpen(false);
    if (next !== value) onChange(next);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, shown.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = shown[active];
      if (option) choose(option.value);
    }
  }

  const current = all.find((o) => o.value === value);

  // Cabeçalho aparece quando o grupo muda em relação à linha anterior.
  // Ao filtrar, os grupos somem do caminho.
  const rows = useMemo(
    () =>
      shown.map((option, i) => ({
        ...option,
        header:
          !query && option.group && option.group !== shown[i - 1]?.group ? option.group : null,
      })),
    [shown, query],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          trigger,
          open ? "border-accent text-ink" : "border-line text-ink hover:border-line-strong",
        )}
      >
        {renderOption && current?.value ? (
          <span className="flex min-w-0 flex-1 items-center">{renderOption(current)}</span>
        ) : (
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-faint")}>
            {current?.label ?? emptyLabel}
          </span>
        )}
        <ChevronDown
          size={13}
          className={cn("shrink-0 text-faint transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <PopoverPanel rect={rect} panelRef={panelRef}>
          <div onKeyDown={onKeyDown}>
            {searchable && (
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <Search size={13} className="shrink-0 text-faint" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
                />
                {!query && (
                  <span className="tnum shrink-0 text-[11.5px] text-faint">{all.length - 1}</span>
                )}
              </div>
            )}

            <div
              ref={listRef}
              className={cn("scroll-thin overflow-y-auto py-1", searchable && "max-h-[292px]")}
            >
              {shown.length === 0 && (
                <p className="px-3 py-3 text-[13px] text-faint">Nada com esse nome.</p>
              )}

              {rows.map((option, index) => {
                const selected = option.value === value;
                const highlighted = index === active;

                return (
                  <div key={option.value || "vazio"}>
                    {option.header && (
                      <div className="label-mono px-3 pb-1 pt-2">{option.header}</div>
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => choose(option.value)}
                      className={cn(
                        row,
                        highlighted && "bg-hover",
                        selected ? "text-accent" : "text-ink",
                        !option.value && "text-faint",
                      )}
                    >
                      {renderOption && option.value ? (
                        <span className="flex min-w-0 flex-1 items-center">
                          {renderOption(option)}
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      )}
                      {selected && <Check size={13} strokeWidth={2.5} className="shrink-0" />}
                    </button>
                  </div>
                );
              })}
            </div>

            <PopoverHint
              left={searchable ? "digite para filtrar" : "↑↓ mover · ↵ escolher"}
              right={searchable ? "↵ escolher" : "esc fechar"}
            />
          </div>
        </PopoverPanel>
      )}
    </>
  );
}

/* -------------------------------------------------------------- responsável */

/** Rotulo em cima do controle. Mesmo par em Nova tarefa e Nova subtarefa. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="label-mono">{label}</span>
      {children}
    </div>
  );
}

export type PersonOption = { id: string; name: string; todayCount: number };

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function AssigneeField({
  value,
  people,
  meId,
  onChange,
  disabled,
}: {
  value: string | null;
  people: PersonOption[];
  meId: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const { open, setOpen, rect, triggerRef, panelRef } = useAnchoredPopover(258);
  const current = people.find((p) => p.id === value) ?? null;

  function choose(next: string | null) {
    setOpen(false);
    if (next !== value) onChange(next);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          trigger,
          open ? "border-accent" : "border-line hover:border-line-strong",
        )}
      >
        {current ? (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-[8.5px] font-semibold text-accent">
            {initials(current.name)}
          </span>
        ) : (
          <Minus size={13} className="shrink-0 text-faint" />
        )}
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-faint")}>
          {current?.name ?? "Sem responsável"}
        </span>
        <ChevronDown
          size={13}
          className={cn("shrink-0 text-faint transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <PopoverPanel rect={rect} panelRef={panelRef}>
          <div className="py-1">
            {value !== meId && (
              <button
                type="button"
                onClick={() => choose(meId)}
                className={cn(row, "text-ink hover:bg-hover")}
              >
                <Plus size={13} className="shrink-0 text-accent" />
                <span>Atribuir a mim</span>
              </button>
            )}

            <div className="scroll-thin max-h-[260px] overflow-y-auto">
              {people.map((person) => {
                const selected = person.id === value;
                return (
                  <button
                    key={person.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(person.id)}
                    className={cn(row, "hover:bg-hover", selected ? "text-accent" : "text-ink")}
                  >
                    <span
                      className={cn(
                        "flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
                        selected ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent",
                      )}
                    >
                      {initials(person.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{person.name}</span>
                    {/* Carga do dia: dá para atribuir sem abrir o painel do time. */}
                    <span className="tnum shrink-0 text-[11.5px] text-faint">
                      {person.todayCount} hoje
                    </span>
                    {selected && <Check size={13} strokeWidth={2.5} className="shrink-0" />}
                  </button>
                );
              })}
            </div>

            {value !== null && (
              <button
                type="button"
                onClick={() => choose(null)}
                className={cn(row, "border-t border-line text-faint hover:bg-hover hover:text-ink")}
              >
                <Minus size={13} className="shrink-0" />
                <span>Sem responsável</span>
              </button>
            )}
          </div>
        </PopoverPanel>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- prazo */

const WEEKDAYS = ["S", "T", "Q", "Q", "S", "S", "D"];

function ymd(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function parse(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** Semana ISO, como o fechamento semanal conta. */
function isoWeek(value: string) {
  const { y, m, d } = parse(value);
  const date = new Date(Date.UTC(y, m, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function addDaysTo(value: string, days: number) {
  const { y, m, d } = parse(value);
  const date = new Date(Date.UTC(y, m, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthLabel(y: number, m: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m, 1)))
    .replace(/^./, (c) => c.toUpperCase());
}

export function DueDateField({
  value,
  today,
  onChange,
  disabled,
}: {
  value: string;
  today: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const { open, setOpen, rect, triggerRef, panelRef } = useAnchoredPopover(258);
  const base = value || today;
  const [view, setView] = useState(() => {
    const { y, m } = parse(base);
    return { y, m };
  });

  function toggle() {
    if (!open) {
      const { y, m } = parse(value || today);
      setView({ y, m });
    }
    setOpen(!open);
  }

  function choose(next: string | null) {
    setOpen(false);
    if (next !== (value || null)) onChange(next);
  }

  // Segunda como primeiro dia, igual à semana de meta.
  const firstOfMonth = new Date(Date.UTC(view.y, view.m, 1));
  const offset = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: Array<string | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `${view.y}-${String(view.m + 1).padStart(2, "0")}-${day}`;
    }),
  ];

  const nextMonday = (() => {
    const { y, m, d } = parse(today);
    const date = new Date(Date.UTC(y, m, d));
    const ahead = (8 - (date.getUTCDay() || 7)) % 7 || 7;
    return addDaysTo(today, ahead);
  })();

  const friday = (() => {
    const { y, m, d } = parse(today);
    const date = new Date(Date.UTC(y, m, d));
    const ahead = (5 - (date.getUTCDay() || 7) + 7) % 7;
    return ahead === 0 ? today : addDaysTo(today, ahead);
  })();

  const SHORTCUTS = [
    { label: "Hoje", value: today },
    { label: "Amanhã", value: addDaysTo(today, 1) },
    { label: "Sexta", value: friday },
    { label: "Próxima seg.", value: nextMonday },
  ];

  const display = value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value}T12:00:00Z`),
      )
    : "Sem prazo";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          trigger,
          "tnum",
          open ? "border-accent" : "border-line hover:border-line-strong",
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-faint")}>{display}</span>
        <ChevronDown
          size={13}
          className={cn("shrink-0 text-faint transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <PopoverPanel rect={rect} panelRef={panelRef}>
          <div className="flex flex-wrap gap-1.5 border-b border-line p-2.5">
            {SHORTCUTS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => choose(s.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] transition-colors duration-150",
                  s.value === value
                    ? "bg-accent-soft font-medium text-accent"
                    : "bg-sunk text-muted hover:text-ink",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink">
                {monthLabel(view.y, view.m)}
              </span>
              <span className="flex gap-0.5">
                <button
                  type="button"
                  aria-label="Mês anterior"
                  onClick={() =>
                    setView(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-[6px] text-faint hover:bg-hover hover:text-ink"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  onClick={() =>
                    setView(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-[6px] text-faint hover:bg-hover hover:text-ink"
                >
                  <ChevronRight size={14} />
                </button>
              </span>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="label-mono py-1 text-center !text-[9.5px]">
                  {d}
                </span>
              ))}

              {cells.map((cell, i) =>
                cell === null ? (
                  <span key={`vazio-${i}`} />
                ) : (
                  <button
                    key={cell}
                    type="button"
                    onClick={() => choose(cell)}
                    className={cn(
                      "tnum flex h-7 items-center justify-center rounded-[6px] text-[12.5px] transition-colors duration-150",
                      cell === value
                        ? "bg-accent font-medium text-accent-fg"
                        : cell === today
                          ? "text-accent ring-1 ring-inset ring-accent"
                          : "text-ink hover:bg-hover",
                    )}
                  >
                    {Number(cell.slice(-2))}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[11.5px]">
            <button
              type="button"
              onClick={() => choose(null)}
              className="text-faint transition-colors hover:text-danger"
            >
              Limpar prazo
            </button>
            <span className="tnum text-faint">Semana {isoWeek(value || today)}</span>
          </div>
        </PopoverPanel>
      )}
    </>
  );
}

export { ymd };

/* --------------------------------------------------------------- ponto MKT */

/**
 * Stepper em vez de campo numerico solto. A regua do board antigo e curta —
 * peca simples 1 a 2, edicao 2 a 5, captacao 6 a 12, projeto 10 a 15 — entao
 * ajustar de um em um resolve, e ninguem digita 700 sem querer.
 */
export function PointsField({
  value,
  onChange,
  onStep,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /**
   * O passo vai por fora do onChange porque precisa somar sobre o valor mais
   * recente. Clicar tres vezes rapido tem que virar tres, nao um.
   */
  onStep: (delta: number) => void;
  disabled?: boolean;
}) {
  const current = value === "" ? 0 : Number(value);

  function step(delta: number) {
    onStep(delta);
  }

  return (
    <div className="flex h-[34px] items-stretch overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface">
      <button
        type="button"
        disabled={disabled || current <= 0}
        onClick={() => step(-1)}
        aria-label="Um ponto a menos"
        className="grid w-[30px] place-items-center text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-40"
      >
        <Minus size={13} />
      </button>

      <input
        type="number"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="tnum min-w-0 flex-1 border-0 bg-transparent text-center text-[14px] font-semibold text-ink placeholder:font-normal placeholder:text-faint focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        disabled={disabled || current >= 100}
        onClick={() => step(1)}
        aria-label="Um ponto a mais"
        className="grid w-[30px] place-items-center text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-40"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- prioridade */

export const PRIORITY_OPTIONS = [
  { value: "urgente", label: "Urgente", color: "var(--p-urgente)" },
  { value: "alta", label: "Alta", color: "var(--p-alta)" },
  { value: "media", label: "Média", color: "var(--p-media)" },
  { value: "baixa", label: "Baixa", color: "var(--p-baixa)" },
] as const;

export function PriorityField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-[2px] rounded-[var(--radius-control)] bg-sunk p-[3px]">
      {PRIORITY_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            style={active ? { color: option.color } : undefined}
            className={cn(
              "h-[26px] flex-1 rounded-[6px] text-[12.5px] transition-colors duration-150",
              active ? "bg-surface font-medium" : "text-faint hover:text-muted",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
