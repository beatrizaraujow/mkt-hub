"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverPanel, useAnchoredPopover } from "@/components/ui/popover";
import { TEMA_EVENTO, gravarTema, lerTema, type Tema } from "@/lib/theme";

/**
 * O tema, ao alcance de um clique no rodape do menu.
 *
 * Botao de icone que abre as tres opcoes, e nao um botao que cicla entre elas:
 * ciclo de tres estados obriga a pessoa a clicar as cegas ate acertar, e o
 * terceiro estado ("sistema") e justamente o que nao se adivinha vendo o icone.
 *
 * A escolha continua inteira em Ajustes. Aqui e o atalho — as duas telas leem e
 * escrevem a mesma chave, entao mexer num lugar muda o outro na hora.
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

export function ThemeButton({ className }: { className?: string }) {
  const atual = useSyncExternalStore(assinar, lerTema, () => "sistema" as Tema);
  const { open, setOpen, rect, triggerRef, panelRef } = useAnchoredPopover(180);

  const AtualIcon = (OPCOES.find((o) => o.value === atual) ?? OPCOES[2]).Icon;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Tema da interface"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Tema da interface"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-150",
          open ? "bg-hover text-ink" : "text-faint hover:bg-hover hover:text-ink",
          className,
        )}
      >
        <AtualIcon size={15} strokeWidth={1.75} />
      </button>

      {open && (
        <PopoverPanel rect={rect} panelRef={panelRef}>
          {OPCOES.map(({ value, label, Icon }) => {
            const ativo = atual === value;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={ativo}
                onClick={() => {
                  gravarTema(value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
                  ativo ? "bg-brand-soft font-medium text-brand-ink" : "text-ink hover:bg-hover",
                )}
              >
                <Icon size={14} strokeWidth={1.75} className="shrink-0" />
                {label}
              </button>
            );
          })}
        </PopoverPanel>
      )}
    </>
  );
}
