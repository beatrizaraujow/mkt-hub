"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDueDate, startOfBrtDay } from "@/lib/date";
import { completeWorkItem, reopenWorkItem } from "./actions";
import { useOpenItem } from "./use-open-item";
import { TimerButton } from "@/features/time/timer-button";

export type RowItem = {
  id: string;
  title: string;
  priority: "urgente" | "alta" | "media" | "baixa";
  dueDate: Date | null;
  completedAt: Date | null;
  stageName: string;
  stageKind: string;
  companyName: string;
  companyColor: string;
  projectName: string | null;
  assigneeName: string | null;
};

const PRIORITY_COLOR: Record<RowItem["priority"], string> = {
  urgente: "var(--p-urgente)",
  alta: "var(--p-alta)",
  media: "var(--p-media)",
  baixa: "var(--p-baixa)",
};

const PRIORITY_LABEL: Record<RowItem["priority"], string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function ItemRow({
  item,
  today,
  showAssignee = false,
  runningItemId = null,
}: {
  item: RowItem;
  today: string;
  showAssignee?: boolean;
  runningItemId?: string | null;
}) {
  const open = useOpenItem();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = Boolean(item.completedAt);

  // Atrasado é a única coisa que ganha vermelho numa lista. Se tudo grita,
  // nada é urgente.
  const overdue = !done && item.dueDate !== null && item.dueDate < startOfBrtDay(today);

  function toggle() {
    setError(null);
    start(async () => {
      const result = done ? await reopenWorkItem(item.id) : await completeWorkItem(item.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div
      className={cn(
        "group flex min-h-[36px] items-center gap-2.5 border-b border-line px-3 py-1.5 last:border-b-0",
        "transition-colors duration-150 hover:bg-hover",
        pending && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
        title={done ? "Reabrir" : "Concluir"}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
          done
            ? "border-success bg-success text-white"
            : "border-line-strong text-transparent hover:border-accent hover:text-accent",
        )}
      >
        <Check size={11} strokeWidth={3} />
      </button>

      {!done && (
        <TimerButton workItemId={item.id} isRunning={runningItemId === item.id} size={15} />
      )}

      <span
        aria-hidden
        title={PRIORITY_LABEL[item.priority]}
        style={{ background: PRIORITY_COLOR[item.priority] }}
        className="h-3.5 w-[3px] shrink-0 rounded-full"
      />

      <button
        type="button"
        onClick={() => open(item.id)}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-[13.5px]",
          done ? "text-faint line-through" : "text-ink",
        )}
        title={item.title}
      >
        {item.title}
      </button>

      {error ? (
        <span role="alert" className="shrink-0 text-[12px] text-danger">
          {error}
        </span>
      ) : null}

      <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-faint sm:flex">
        <span
          aria-hidden
          style={{ background: item.companyColor }}
          className="h-1.5 w-1.5 rounded-full"
        />
        {item.companyName}
      </span>

      {item.projectName ? (
        <span className="hidden max-w-[140px] shrink-0 truncate text-[12px] text-faint lg:inline">
          {item.projectName}
        </span>
      ) : null}

      <span className="hidden shrink-0 text-[11.5px] text-muted md:inline">{item.stageName}</span>

      {item.dueDate ? (
        <span
          className={cn(
            "tnum w-[62px] shrink-0 text-right text-[12px]",
            overdue ? "font-medium text-danger" : "text-faint",
          )}
        >
          {formatDueDate(item.dueDate, today)}
        </span>
      ) : (
        <span className="w-[62px] shrink-0" />
      )}

      {showAssignee ? (
        <span
          title={item.assigneeName ?? "Sem responsável"}
          className={cn(
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
            item.assigneeName ? "bg-accent-soft text-accent" : "bg-sunk text-faint",
          )}
        >
          {item.assigneeName ? initials(item.assigneeName) : "—"}
        </span>
      ) : null}

      {done ? (
        <RotateCcw
          size={12}
          className="hidden shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 sm:block"
        />
      ) : null}
    </div>
  );
}
