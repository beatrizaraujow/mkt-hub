"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftWeek, weekLabel } from "@/features/routines/week";

/** A semana vive na URL, para o F5 e o link mandado para alguém caírem nela. */
export function WeekNav({ monday, thisMonday }: { monday: string; thisMonday: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: string) {
    const query = new URLSearchParams(params.toString());
    if (next === thisMonday) query.delete("semana");
    else query.set("semana", next);
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Semana anterior"
        onClick={() => go(shiftWeek(monday, -1))}
        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
      >
        <ChevronLeft size={15} />
      </button>

      <span className="tnum min-w-[150px] text-center text-[13px] text-ink">
        {weekLabel(monday)}
      </span>

      <button
        type="button"
        aria-label="Próxima semana"
        onClick={() => go(shiftWeek(monday, 1))}
        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
      >
        <ChevronRight size={15} />
      </button>

      {monday !== thisMonday && (
        <button
          type="button"
          onClick={() => go(thisMonday)}
          className="ml-1 text-[12.5px] text-faint transition-colors hover:text-ink"
        >
          Esta semana
        </button>
      )}
    </div>
  );
}
