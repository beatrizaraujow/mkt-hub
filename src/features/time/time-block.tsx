"use client";

import { useState, useTransition } from "react";
import { formatDuration } from "@/lib/date";
import { useNowSeconds } from "./use-now";

/** hh:mm:ss enquanto conta. Segundo visível é o que faz o cronômetro parecer vivo. */
function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
import { Button } from "@/components/ui/button";
import { TimerButton } from "./timer-button";
import { logManualTime } from "./actions";

/** Bloco de tempo dentro do detalhe: total, cronômetro e lançamento manual. */
export function TimeBlock({
  workItemId,
  totalSeconds,
  isRunning,
  runningSince,
  today,
}: {
  workItemId: string;
  totalSeconds: number;
  isRunning: boolean;
  runningSince: Date | null;
  today: string;
}) {
  const now = useNowSeconds(isRunning);
  const live =
    isRunning && runningSince && now > 0
      ? Math.max(0, now - Math.floor(runningSince.getTime() / 1000))
      : 0;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [date, setDate] = useState(today);

  function submit() {
    setError(null);
    start(async () => {
      const result = await logManualTime(workItemId, minutes, date);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMinutes("");
      setManual(false);
    });
  }

  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="label-mono mb-2">Tempo</h3>

      <div className="flex items-center gap-3">
        <TimerButton workItemId={workItemId} isRunning={isRunning} size={20} />
        {isRunning ? (
          <span
            suppressHydrationWarning
            className="tnum font-display text-[22px] font-semibold text-accent"
          >
            {clock(live)}
          </span>
        ) : (
          <span className="tnum font-display text-[20px] font-semibold text-ink">
            {formatDuration(totalSeconds)}
          </span>
        )}
        <span className="flex-1 text-[12.5px] text-faint">
          {isRunning
            ? `contando agora · ${formatDuration(totalSeconds)} no total`
            : "registradas nesta tarefa"}
        </span>
        {!manual && (
          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-[12.5px] text-faint transition-colors hover:text-ink"
          >
            Lançar manual
          </button>
        )}
      </div>

      {manual && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <label className="label-mono mb-1 block" htmlFor="manual-min">
              Minutos
            </label>
            <input
              id="manual-min"
              type="number"
              min={1}
              autoFocus
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="h-7 w-[92px] rounded-[var(--radius-control)] border border-line bg-surface px-1.5 text-[13px] text-ink focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="label-mono mb-1 block" htmlFor="manual-date">
              Dia
            </label>
            <input
              id="manual-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-7 rounded-[var(--radius-control)] border border-line bg-surface px-1.5 text-[13px] text-ink focus:border-accent focus:outline-none"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Lançando…" : "Lançar"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setManual(false);
              setError(null);
            }}
            className="text-[12.5px] text-faint transition-colors hover:text-ink"
          >
            Cancelar
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
