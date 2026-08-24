"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, List } from "lucide-react";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "", label: "Lista", icon: List },
  { key: "quadro", label: "Quadro", icon: Columns3 },
] as const;

export function ViewSwitch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("view") ?? "";

  function go(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key) next.set("view", key);
    else next.delete("view");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-0.5 rounded-[var(--radius-control)] border border-line bg-sunk p-0.5">
      {VIEWS.map((view) => {
        const Icon = view.icon;
        const active = current === view.key;
        return (
          <button
            key={view.label}
            type="button"
            onClick={() => go(view.key)}
            aria-pressed={active}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] transition-colors duration-150",
              active ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon size={14} strokeWidth={1.75} />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
