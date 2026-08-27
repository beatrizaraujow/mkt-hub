"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { useOpenItem } from "@/features/work-items/use-open-item";
import { togglePublished } from "./actions";
import { cellState, WEEKDAY_FULL, WEEKDAY_LABELS, type CellState } from "./week";
import type { OccurrenceRow, RoutineRow } from "./queries";

/**
 * A grade da semana: uma linha por rotina, sete colunas, um quadradinho em
 * cada cruzamento.
 *
 * Marcar publicado é um clique na célula. Nada de abrir tela, escolher status
 * e salvar — a tela existe para ser respondida de pé, entre uma coisa e outra.
 */

const STATE_STYLE: Record<Exclude<CellState, "fora">, string> = {
  previsto: "border-line-strong bg-surface hover:border-accent",
  feito: "border-success bg-success text-white",
  atrasado: "border-danger bg-danger-soft text-danger",
};

const STATE_LABEL: Record<Exclude<CellState, "fora">, string> = {
  previsto: "Previsto",
  feito: "Publicado",
  atrasado: "Atrasado",
};

export function RoutineGrid({
  routines,
  occurrences,
  days,
  today,
}: {
  routines: RoutineRow[];
  occurrences: OccurrenceRow[];
  days: string[];
  today: string;
}) {
  const openItem = useOpenItem();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byKey = new Map(occurrences.map((row) => [`${row.routineId}|${row.day}`, row]));

  // Agrupa por empresa para a grade não virar uma lista plana de trinta linhas.
  const groups = routines.reduce<Array<{ companyId: string; name: string; color: string; rows: RoutineRow[] }>>(
    (acc, routine) => {
      const last = acc[acc.length - 1];
      if (last && last.companyId === routine.companyId) last.rows.push(routine);
      else
        acc.push({
          companyId: routine.companyId,
          name: routine.companyName,
          color: routine.companyColor,
          rows: [routine],
        });
      return acc;
    },
    [],
  );

  function toggle(occurrenceId: string, next: boolean) {
    setError(null);
    start(async () => {
      const result = await togglePublished(occurrenceId, next);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[minmax(160px,1fr)_repeat(7,44px)] gap-x-1 border-b border-line pb-1.5">
            <span className="label-mono">Rotina</span>
            {days.map((day, i) => (
              <span
                key={day}
                className={cn(
                  "label-mono text-center",
                  day === today && "!text-accent",
                )}
                title={day}
              >
                {WEEKDAY_LABELS[i]}
              </span>
            ))}
          </div>

          {groups.map((group) => (
            <section key={group.companyId} className="mt-3">
              <p className="mb-1 flex items-center gap-1.5 text-[12px] text-muted">
                <span
                  aria-hidden
                  style={{ background: group.color }}
                  className="h-1.5 w-1.5 rounded-full"
                />
                {group.name}
              </p>

              {group.rows.map((routine) => (
                <div
                  key={routine.id}
                  className="grid grid-cols-[minmax(160px,1fr)_repeat(7,44px)] items-center gap-x-1 border-b border-line py-1 last:border-b-0"
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-[13px] text-ink">
                      <span className="text-muted">{routine.platform}</span> · {routine.label}
                    </p>
                    {routine.assigneeName ? (
                      <p className="truncate text-[11.5px] text-faint">{routine.assigneeName}</p>
                    ) : null}
                  </div>

                  {days.map((day, index) => {
                    const occurrence = byKey.get(`${routine.id}|${day}`);
                    const state = cellState({
                      scheduled: routine.weekdays.includes(index),
                      published: Boolean(occurrence?.publishedAt),
                      day,
                      today,
                    });

                    if (state === "fora") {
                      return (
                        <span
                          key={day}
                          aria-hidden
                          className="mx-auto block h-[26px] w-[26px] rounded-[7px] border border-dashed border-line/60"
                        />
                      );
                    }

                    const published = state === "feito";

                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={pending || !occurrence}
                        onClick={() => occurrence && toggle(occurrence.id, !published)}
                        onContextMenu={(event) => {
                          // Botão direito abre a tarefa gerada, sem tirar o
                          // clique esquerdo de "marquei que saiu".
                          if (!occurrence?.workItemId) return;
                          event.preventDefault();
                          openItem(occurrence.workItemId);
                        }}
                        aria-label={`${STATE_LABEL[state]} · ${routine.platform} ${routine.label} · ${WEEKDAY_FULL[index]}`}
                        title={`${STATE_LABEL[state]} — clique para ${
                          published ? "desmarcar" : "marcar como publicado"
                        }. Botão direito abre a tarefa.`}
                        className={cn(
                          "mx-auto flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border transition-colors duration-150",
                          STATE_STYLE[state],
                          !occurrence && "cursor-not-allowed opacity-40",
                        )}
                      >
                        {published ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                            <path d="M4 12l5 5L20 6" />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] border border-line-strong bg-surface" /> previsto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] border border-success bg-success" /> publicado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] border border-danger bg-danger-soft" /> atrasado
        </span>
        <span>Hoje ainda é previsto — vira atrasado só quando o dia passa.</span>
      </p>
    </div>
  );
}
