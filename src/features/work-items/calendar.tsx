"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { gridDays, monthLabel, shiftMonth } from "@/lib/month";
import { useOpenItem } from "./use-open-item";

export type CalendarItem = {
  id: string;
  title: string;
  /** Dia em BRT, calculado no servidor para não depender do fuso do navegador. */
  day: string;
  companyColor: string;
  priority: "urgente" | "alta" | "media" | "baixa";
  done: boolean;
  assigneeName: string | null;
};

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const PRIORITY_COLOR: Record<CalendarItem["priority"], string> = {
  urgente: "var(--p-urgente)",
  alta: "var(--p-alta)",
  media: "var(--p-media)",
  baixa: "var(--p-baixa)",
};

export function Calendar({
  month,
  items,
  today,
  withoutDueDate,
}: {
  month: string;
  items: CalendarItem[];
  today: string;
  withoutDueDate: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openItem = useOpenItem();

  const days = useMemo(() => gridDays(month), [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.day);
      if (list) list.push(item);
      else map.set(item.day, [item]);
    }
    return map;
  }, [items]);

  function goToMonth(next: string) {
    const search = new URLSearchParams(params.toString());
    search.set("mes", next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => goToMonth(shiftMonth(month, -1))}
          className="grid h-7 w-7 place-items-center rounded-[var(--radius-control)] border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => goToMonth(shiftMonth(month, 1))}
          className="grid h-7 w-7 place-items-center rounded-[var(--radius-control)] border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <ChevronRight size={15} />
        </button>

        <h2 className="font-display text-[16px] font-semibold text-ink">{monthLabel(month)}</h2>

        {month !== today.slice(0, 7) && (
          <button
            type="button"
            onClick={() => goToMonth(today.slice(0, 7))}
            className="text-[12.5px] text-accent hover:underline"
          >
            hoje
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map((label) => (
            <div key={label} className="label-mono px-2 py-1.5 text-center">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const list = byDay.get(day) ?? [];
            const outside = day.slice(0, 7) !== month;
            const isToday = day === today;

            return (
              <div
                key={day}
                className={cn(
                  "min-h-[104px] border-b border-r border-line p-1.5",
                  index % 7 === 6 && "border-r-0",
                  index >= days.length - 7 && "border-b-0",
                  outside && "bg-sunk",
                )}
              >
                <div className="mb-1 flex items-center gap-1 px-0.5">
                  <span
                    className={cn(
                      "tnum text-[11.5px]",
                      isToday
                        ? "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 font-medium text-brand-fg"
                        : outside
                          ? "text-faint/60"
                          : "text-faint",
                    )}
                  >
                    {Number(day.slice(-2))}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  {list.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openItem(item.id)}
                      title={`${item.title}${item.assigneeName ? ` · ${item.assigneeName}` : ""}`}
                      className="flex items-center gap-1 rounded-[5px] px-1 py-[3px] text-left transition-colors hover:bg-hover"
                    >
                      <span
                        aria-hidden
                        style={{ background: item.done ? "var(--line-strong)" : PRIORITY_COLOR[item.priority] }}
                        className="h-[11px] w-[2px] shrink-0 rounded-full"
                      />
                      <span
                        aria-hidden
                        style={{ background: item.companyColor }}
                        className="h-1 w-1 shrink-0 rounded-full"
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[11.5px]",
                          item.done ? "text-faint line-through" : "text-ink",
                        )}
                      >
                        {item.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/*
        Tarefa sem prazo não cabe num calendário e some sem aviso. Dizer
        quantas são evita a conclusão errada de que não existe mais nada.
      */}
      {withoutDueDate > 0 && (
        <p className="mt-2 text-[12px] text-faint">
          <span className="tnum">{withoutDueDate}</span>{" "}
          {withoutDueDate === 1 ? "tarefa aberta sem prazo" : "tarefas abertas sem prazo"} — só
          aparecem na lista.
        </p>
      )}
    </div>
  );
}
