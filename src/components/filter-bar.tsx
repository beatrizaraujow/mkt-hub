"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * A barra de filtros, uma so para todas as telas que filtram.
 *
 * Existe porque "mesmo design" copiado a mao dura ate a primeira pressa: duas
 * copias do mesmo `select` divergem em um pixel de altura e ninguem percebe
 * ate as duas telas ficarem lado a lado. Aqui o design e o mesmo por
 * construcao, nao por disciplina.
 *
 * O filtro mora na URL, nunca em estado do componente. Assim a tela filtrada
 * pode ser mandada por mensagem, sobrevive ao recarregar, e o botao de voltar
 * do navegador desfaz o filtro em vez de sair da tela.
 */

export const filterSelectClass =
  "h-8 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] text-ink " +
  "transition-colors duration-150 focus:border-accent focus:outline-none";

export function useFilterParams(keys: string[]) {
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

  const clear = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return {
    set,
    clear,
    current: (key: string) => params.get(key) ?? "",
    dirty: keys.some((key) => params.get(key)),
    params,
  };
}

export function FilterBar({
  dirty,
  onClear,
  children,
}: {
  dirty: boolean;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 md:px-7">
      {children}

      <button
        type="button"
        onClick={onClear}
        className={cn(
          "text-[12.5px] text-faint transition-colors duration-150 hover:text-ink",
          // Invisivel, nao removido: o botao aparecendo e sumindo empurraria
          // os filtros de lugar a cada selecao.
          !dirty && "invisible",
        )}
      >
        Limpar
      </button>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      className={filterSelectClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

export function FilterCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}
