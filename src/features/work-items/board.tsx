"use client";

import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { formatDueDate, startOfBrtDay } from "@/lib/date";
import { setStage } from "./actions";
import { useOpenItem } from "./use-open-item";
import type { RowItem } from "./item-row";

export type BoardStage = { id: string; name: string; kind: string };
export type BoardItem = RowItem & { stageId: string };

const PRIORITY_COLOR: Record<RowItem["priority"], string> = {
  urgente: "var(--p-urgente)",
  alta: "var(--p-alta)",
  media: "var(--p-media)",
  baixa: "var(--p-baixa)",
};

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function Card({ item, today }: { item: BoardItem; today: string }) {
  const open = useOpenItem();
  const overdue =
    !item.completedAt && item.dueDate !== null && item.dueDate < startOfBrtDay(today);

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "cursor-grab rounded-[var(--radius-control)] border border-line bg-surface p-2.5",
        "transition-colors duration-150 hover:border-line-strong active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          style={{ background: PRIORITY_COLOR[item.priority] }}
          className="mt-[3px] h-3 w-[3px] shrink-0 rounded-full"
        />
        <button
          type="button"
          onClick={() => open(item.id)}
          className="min-w-0 flex-1 text-left text-[13px] leading-snug text-ink"
        >
          {item.title}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 pl-[11px]">
        <span
          aria-hidden
          style={{ background: item.companyColor }}
          className="h-1.5 w-1.5 shrink-0 rounded-full"
        />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">
          {item.companyName}
        </span>

        {item.dueDate ? (
          <span
            className={cn("tnum shrink-0 text-[11.5px]", overdue ? "text-danger" : "text-faint")}
          >
            {formatDueDate(item.dueDate, today)}
          </span>
        ) : null}

        <span
          title={item.assigneeName ?? "Sem responsável"}
          className={cn(
            "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
            item.assigneeName ? "bg-accent-soft text-accent" : "bg-sunk text-faint",
          )}
        >
          {item.assigneeName ? initials(item.assigneeName) : "—"}
        </span>
      </div>
    </article>
  );
}

export function Board({
  stages,
  items,
  today,
}: {
  stages: BoardStage[];
  items: BoardItem[];
  today: string;
}) {
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // A coluna muda na hora; se o servidor recusar, volta sozinho.
  const [shown, moveOptimistic] = useOptimistic(
    items,
    (current: BoardItem[], move: { id: string; stageId: string }) =>
      current.map((i) => (i.id === move.id ? { ...i, stageId: move.stageId } : i)),
  );

  function drop(stageId: string, id: string) {
    setOver(null);
    const item = shown.find((i) => i.id === id);
    if (!item || item.stageId === stageId) return;

    setError(null);
    start(async () => {
      moveOptimistic({ id, stageId });
      const result = await setStage(id, stageId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="relative">
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-[var(--radius-control)] border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      ) : null}

      <div
        // O cartao ja se move na hora; apagar o quadro inteiro so atrapalha.
        className="scroll-thin flex gap-3 overflow-x-auto pb-3"
      >
        {stages.map((stage) => {
          const list = shown.filter((i) => i.stageId === stage.id);

          return (
            <section
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== stage.id) setOver(stage.id);
              }}
              onDragLeave={() => setOver((c) => (c === stage.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                drop(stage.id, e.dataTransfer.getData("text/plain"));
              }}
              className={cn(
                "flex w-[264px] shrink-0 flex-col rounded-[var(--radius-card)] border bg-sunk p-2",
                over === stage.id ? "border-accent" : "border-line",
              )}
            >
              <header className="mb-2 flex items-center gap-2 px-1">
                <h3 className="label-mono flex-1">{stage.name}</h3>
                <span className="tnum text-[11.5px] text-faint">{list.length}</span>
              </header>

              <div className="flex flex-col gap-2">
                {list.map((item) => (
                  <Card key={item.id} item={item} today={today} />
                ))}

                {list.length === 0 && (
                  <p className="rounded-[var(--radius-control)] border border-dashed border-line px-2 py-4 text-center text-[12px] text-faint">
                    vazio
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-1 text-[12px] text-faint">
        Arraste um cartão para mudar de etapa. No celular, use a lista.
      </p>
    </div>
  );
}
