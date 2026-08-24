"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * O detalhe vive na URL (`?item=<id>`), nao em estado local. Assim o painel
 * sobrevive a um F5 e o link pode ser colado para outra pessoa.
 */
export function useOpenItem() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("item", id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
}
