"use client";

import { useTransition } from "react";
import { Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { discardTimer, stopTimer } from "./actions";
import { useNowSeconds } from "./use-now";

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function TimerWidget({
  running,
}: {
  running: { id: string; startedAt: Date; title: string | null; companyName: string | null } | null;
}) {
  const [pending, start] = useTransition();
  // O relógio anda no navegador. Nada de bater no servidor a cada segundo.
  const now = useNowSeconds(Boolean(running));

  if (!running) return null;

  const seconds = now > 0 ? Math.max(0, now - Math.floor(running.startedAt.getTime() / 1000)) : 0;

  function act(fn: () => Promise<{ error?: string }>) {
    start(async () => {
      await fn();
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-line bg-accent-soft px-3 py-2",
        pending && "opacity-60",
      )}
    >
      <span aria-hidden className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-ink">
          {running.title ?? "Sem tarefa"}
        </p>
        {/* servidor e cliente podem diferir num segundo; nao e erro */}
        <p suppressHydrationWarning className="tnum text-[11.5px] text-accent">
          {clock(seconds)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => act(stopTimer)}
        disabled={pending}
        aria-label="Parar e registrar"
        title="Parar e registrar"
        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] bg-accent text-accent-fg transition-opacity hover:opacity-90"
      >
        <Square size={12} strokeWidth={2.5} fill="currentColor" />
      </button>

      <button
        type="button"
        onClick={() => {
          if (!window.confirm("Descartar este tempo sem registrar?")) return;
          act(discardTimer);
        }}
        disabled={pending}
        aria-label="Descartar sem registrar"
        title="Descartar sem registrar"
        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:text-danger"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
