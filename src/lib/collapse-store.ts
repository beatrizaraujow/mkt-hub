"use client";

import { useSyncExternalStore } from "react";

/**
 * Quais grupos estao recolhidos, lembrado no navegador.
 *
 * Como store externa, e nao como estado hidratado dentro de um efeito: ler o
 * armazenamento e chamar `setState` na montagem funciona, mas desenha a tela
 * duas vezes toda vez que ela abre — e e o comeco do render em cascata. Aqui o
 * servidor devolve "nada recolhido", o cliente devolve o que estiver salvo, e
 * o React concilia os dois sozinho.
 *
 * Uma store por tela, cada uma com a sua chave. Etapa recolhida em Trabalho
 * nao tem nada a ver com empresa recolhida em Rotinas, e uma chave so faria
 * um id colidir com o outro no dia em que fossem iguais.
 *
 * Isto mora aqui, e nao copiado em cada tela, porque e o tipo de codigo que
 * ninguem le de novo: cache, invalidacao e `try/catch` de armazenamento
 * bloqueado. Duas copias divergem na primeira correcao que so uma recebe.
 */

const VAZIO: string[] = [];

export type CollapseStore = {
  ler: () => string[];
  assinar: (ouvinte: () => void) => () => void;
  alternar: (id: string) => void;
};

export function createCollapseStore(chave: string): CollapseStore {
  let cache: string[] | null = null;
  const ouvintes = new Set<() => void>();

  function ler(): string[] {
    if (cache) return cache;
    try {
      const salvo = window.localStorage.getItem(chave);
      cache = salvo ? (JSON.parse(salvo) as string[]) : VAZIO;
    } catch {
      // Aba anonima ou armazenamento bloqueado: segue com tudo aberto.
      cache = VAZIO;
    }
    return cache;
  }

  function alternar(id: string) {
    const atual = ler();
    // Referencia nova a cada mudanca, senao o React nao ve que mudou.
    cache = atual.includes(id) ? atual.filter((outro) => outro !== id) : [...atual, id];
    try {
      window.localStorage.setItem(chave, JSON.stringify(cache));
    } catch {
      // Nao poder lembrar nao pode impedir de recolher agora.
    }
    for (const ouvinte of ouvintes) ouvinte();
  }

  function assinar(ouvinte: () => void) {
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  }

  return { ler, assinar, alternar };
}

/** O servidor sempre devolve "nada recolhido" — o cliente corrige depois. */
export function useCollapsed(store: CollapseStore): string[] {
  return useSyncExternalStore(store.assinar, store.ler, () => VAZIO);
}
