"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] text-ink " +
  "transition-colors duration-150 focus:border-accent focus:outline-none";

export function Filters({
  companies,
  people,
  meId,
}: {
  companies: Array<{ id: string; name: string; parentId: string | null }>;
  people: Array<{ id: string; name: string }>;
  meId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);

      // Sem query, vai o caminho puro. `/trabalho?` com a interrogacao
      // sozinha nao conta como URL nova, e desmarcar o ultimo filtro
      // ficava sem efeito nenhum.
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const current = (key: string) => params.get(key) ?? "";
  const dirty = ["empresa", "responsavel", "concluidas", "rotinas"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 md:px-7">
      <select
        aria-label="Empresa"
        className={selectClass}
        value={current("empresa")}
        onChange={(e) => set("empresa", e.target.value)}
      >
        <option value="">Todas as empresas</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.parentId ? `— ${c.name}` : c.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Responsável"
        className={selectClass}
        value={current("responsavel")}
        onChange={(e) => set("responsavel", e.target.value)}
      >
        <option value="">Todo mundo</option>
        <option value={meId}>Minhas tarefas</option>
        {people
          .filter((p) => p.id !== meId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>

      {/* No quadro a coluna de concluído já existe — o filtro não faria sentido. */}
      {params.get("view") !== "quadro" && (
        <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={current("concluidas") === "1"}
            onChange={(e) => set("concluidas", e.target.checked ? "1" : "")}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Mostrar concluídas
        </label>
      )}

      {/*
        Item de rotina fica escondido por padrao: story diario em quatro
        empresas sao 28 por semana, e o lugar de olhar isso e a grade.
      */}
      <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted">
        <input
          type="checkbox"
          checked={current("rotinas") === "1"}
          onChange={(e) => set("rotinas", e.target.checked ? "1" : "")}
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
        Incluir rotinas
      </label>

      <button
        type="button"
        onClick={() => router.replace(pathname, { scroll: false })}
        className={cn(
          "text-[12.5px] text-faint transition-colors duration-150 hover:text-ink",
          !dirty && "invisible",
        )}
      >
        Limpar
      </button>
    </div>
  );
}
