"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMA_EVENTO, gravarTema, lerTema, type Tema } from "@/lib/theme";

/**
 * Claro, escuro, ou o que o aparelho disser.
 *
 * Le por `useSyncExternalStore` e nao por `useState` + efeito: o
 * `localStorage` e uma fonte de fora do React, e ler assim resolve de uma vez
 * a hidratacao (o servidor nao sabe a escolha, entao entrega "sistema" e o
 * cliente corrige na primeira pintura) e a sincronia entre abas — o evento
 * `storage` chega de graca.
 *
 * **Tres opcoes e nao um interruptor.** Um interruptor de duas posicoes obriga
 * a escolher, e apaga a resposta mais comum, que e "o que o aparelho estiver
 * usando". Quem nunca mexer aqui segue o sistema para sempre, inclusive quando
 * o sistema muda sozinho ao anoitecer.
 */

const OPCOES: Array<{ value: Tema; label: string; Icon: typeof Sun }> = [
  { value: "claro", label: "Claro", Icon: Sun },
  { value: "escuro", label: "Escuro", Icon: Moon },
  { value: "sistema", label: "Sistema", Icon: Monitor },
];

function assinar(avisar: () => void) {
  window.addEventListener("storage", avisar);
  window.addEventListener(TEMA_EVENTO, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(TEMA_EVENTO, avisar);
  };
}

export function ThemeToggle() {
  const atual = useSyncExternalStore(assinar, lerTema, () => "sistema" as Tema);

  const escolher = useCallback((tema: Tema) => gravarTema(tema), []);

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className="flex gap-1 rounded-[var(--radius-control)] border border-line bg-sunk p-1"
    >
      {OPCOES.map(({ value, label, Icon }) => {
        const ativo = atual === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => escolher(value)}
            className={cn(
              "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-3 text-[12.5px] transition-colors duration-150",
              ativo
                ? "bg-brand-soft font-medium text-brand-ink"
                : "text-muted hover:text-ink",
            )}
          >
            <Icon size={14} strokeWidth={1.75} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
