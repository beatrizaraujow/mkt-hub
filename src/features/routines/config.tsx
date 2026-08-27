"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WEEKDAY_LABELS } from "./week";
import { createRoutine, setRoutineActive, updateRoutine } from "./actions";
import type { RoutineRow } from "./queries";

/**
 * Configurar a recorrência mora aqui, na empresa — não na grade.
 *
 * Acompanhar e configurar são trabalhos diferentes: um é diário e de olhar,
 * o outro é raro e de decidir. Misturar os dois enche a tela de acompanhamento
 * de controle que ninguém usa toda semana.
 */

const field =
  "h-8 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] " +
  "text-ink transition-colors duration-150 focus:border-accent focus:outline-none";

type Draft = {
  platform: string;
  label: string;
  weekdays: number[];
  assigneeId: string;
};

const EMPTY: Draft = { platform: "", label: "", weekdays: [], assigneeId: "" };

function DayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (next: number[]) => void;
}) {
  return (
    <div className="flex gap-1">
      {WEEKDAY_LABELS.map((label, index) => {
        const on = value.includes(index);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? value.filter((d) => d !== index) : [...value, index].sort((a, b) => a - b))
            }
            className={cn(
              "h-7 w-9 rounded-[var(--radius-control)] border text-[11.5px] transition-colors duration-150",
              on
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-line text-faint hover:text-ink",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function RoutineConfig({
  companyId,
  routines,
  people,
  platforms,
}: {
  companyId: string;
  routines: RoutineRow[];
  people: Array<{ id: string; name: string }>;
  platforms: string[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>, onOk?: () => void) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else onOk?.();
    });
  }

  return (
    <section id="rotinas" className="scroll-mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="label-mono">Rotinas de publicação</h2>
        {!adding && (
          <Button size="sm" variant="subtle" onClick={() => setAdding(true)}>
            <Plus size={14} strokeWidth={2} />
            Nova rotina
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="mb-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {routines.length === 0 && !adding && (
          <p className="px-4 py-5 text-[13px] text-faint">
            Nenhuma rotina. A grade de Rotinas se monta a partir daqui.
          </p>
        )}

        {routines.map((routine) => {
          const isEditing = editing === routine.id;

          return (
            <div
              key={routine.id}
              className={cn(
                "border-b border-line px-4 py-2.5 last:border-b-0",
                !routine.isActive && "opacity-55",
              )}
            >
              {isEditing ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(
                      () =>
                        updateRoutine(routine.id, {
                          platform: editDraft.platform,
                          label: editDraft.label,
                          weekdays: editDraft.weekdays,
                          assigneeId: editDraft.assigneeId || null,
                        }),
                      () => setEditing(null),
                    );
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={editDraft.platform}
                      onChange={(e) => setEditDraft({ ...editDraft, platform: e.target.value })}
                      placeholder="Plataforma"
                      list="rotina-plataformas"
                      className={cn(field, "w-[150px]")}
                    />
                    <input
                      value={editDraft.label}
                      onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                      placeholder="O que sai"
                      className={cn(field, "w-[170px]")}
                    />
                    <select
                      value={editDraft.assigneeId}
                      onChange={(e) => setEditDraft({ ...editDraft, assigneeId: e.target.value })}
                      className={cn(field, "w-[160px]")}
                    >
                      <option value="">Sem responsável</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <DayPicker
                    value={editDraft.weekdays}
                    onChange={(weekdays) => setEditDraft({ ...editDraft, weekdays })}
                  />

                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" disabled={pending}>
                      Salvar
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="text-[12.5px] text-faint hover:text-ink"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[13.5px] text-ink">
                    <span className="text-muted">{routine.platform}</span> · {routine.label}
                  </span>

                  <span className="flex gap-0.5">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <span
                        key={label}
                        className={cn(
                          "tnum rounded-[4px] px-1 text-[10.5px]",
                          routine.weekdays.includes(index)
                            ? "bg-accent-soft text-accent"
                            : "text-faint/50",
                        )}
                      >
                        {label[0]}
                      </span>
                    ))}
                  </span>

                  <span className="text-[12px] text-faint">
                    {routine.assigneeName ?? "sem responsável"}
                  </span>

                  <span className="ml-auto flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(routine.id);
                        setEditDraft({
                          platform: routine.platform,
                          label: routine.label,
                          weekdays: routine.weekdays,
                          assigneeId: routine.assigneeId ?? "",
                        });
                      }}
                      className="text-[12.5px] text-muted hover:text-ink"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setRoutineActive(routine.id, !routine.isActive))}
                      className="text-[12.5px] text-faint hover:text-ink"
                    >
                      {routine.isActive ? "Desativar" : "Reativar"}
                    </button>
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {adding && (
          <form
            className="flex flex-col gap-2 border-t border-line px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () =>
                  createRoutine({
                    companyId,
                    platform: draft.platform,
                    label: draft.label,
                    weekdays: draft.weekdays,
                    assigneeId: draft.assigneeId || null,
                  }),
                () => {
                  setDraft(EMPTY);
                  setAdding(false);
                },
              );
            }}
          >
            <div className="flex flex-wrap gap-2">
              <input
                autoFocus
                value={draft.platform}
                onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
                placeholder="Instagram"
                list="rotina-plataformas"
                className={cn(field, "w-[150px]")}
              />
              <input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Reels"
                className={cn(field, "w-[170px]")}
              />
              <select
                value={draft.assigneeId}
                onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}
                className={cn(field, "w-[160px]")}
              >
                <option value="">Sem responsável</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>

            <DayPicker
              value={draft.weekdays}
              onChange={(weekdays) => setDraft({ ...draft, weekdays })}
            />

            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Criar rotina
              </Button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setDraft(EMPTY);
                  setError(null);
                }}
                aria-label="Cancelar"
                className="text-faint transition-colors hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>
          </form>
        )}
      </div>

      <datalist id="rotina-plataformas">
        {platforms.map((platform) => (
          <option key={platform} value={platform} />
        ))}
      </datalist>

      <p className="mt-2 text-[12px] text-faint">
        Story diário é uma rotina com os sete dias marcados, não sete rotinas.
      </p>
    </section>
  );
}
