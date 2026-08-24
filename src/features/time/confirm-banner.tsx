"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/date";
import { adjustEntry, confirmEntry, discardEntry } from "./actions";

export type PendingEntry = {
  id: string;
  startedAt: Date;
  durationSeconds: number | null;
  title: string | null;
};

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
  }).format(date);
}

/**
 * "Você registrou 6h em X — confirma?"
 *
 * Aparece no dia seguinte para todo timer que o corte automático fechou.
 * Sem isto, esquecer o cronômetro ligado uma vez contamina o relatório do
 * mês inteiro, e ninguém volta para arrumar.
 */
export function ConfirmBanner({ entries }: { entries: PendingEntry[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");

  if (entries.length === 0) return null;

  function act(fn: () => Promise<{ error?: string }>) {
    start(async () => {
      await fn();
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="mx-5 mb-1 mt-5 rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft px-4 py-3 md:mx-7">
      <p className="mb-2 text-[13px] font-medium text-ink">
        {entries.length === 1
          ? "Um cronômetro ficou ligado e foi cortado no fim do dia."
          : `${entries.length} cronômetros ficaram ligados e foram cortados no fim do dia.`}
      </p>

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="tnum font-medium text-ink">
              {formatDuration(entry.durationSeconds ?? 0)}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted">
              em {entry.title ?? "tarefa removida"} · {dayLabel(entry.startedAt)}
            </span>

            {editing === entry.id ? (
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => adjustEntry(entry.id, minutes));
                }}
              >
                <input
                  type="number"
                  min={0}
                  autoFocus
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="min"
                  className="h-7 w-[76px] rounded-[var(--radius-control)] border border-line bg-surface px-1.5 text-[13px] text-ink focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="text-[12.5px] font-medium text-accent hover:underline"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-[12.5px] text-faint hover:text-ink"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <span className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => confirmEntry(entry.id))}
                  className="text-[12.5px] font-medium text-accent hover:underline"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setMinutes(String(Math.round((entry.durationSeconds ?? 0) / 60)));
                    setEditing(entry.id);
                  }}
                  className="text-[12.5px] text-muted hover:text-ink"
                >
                  Ajustar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => discardEntry(entry.id))}
                  className="text-[12.5px] text-faint hover:text-danger"
                >
                  Descartar
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
