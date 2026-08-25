"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Caixa central com fundo escurecido. Serve Nova tarefa e Nova subtarefa —
 * e uma abre por cima da outra, entao o Escape precisa de ordem.
 *
 * A ordem e: popover aberto primeiro, depois este modal, depois o que estiver
 * atras. Por isso a escuta e na fase de captura e para a propagacao: sem isso,
 * o detalhe da tarefa (que tambem escuta Escape) fecharia junto.
 */
export function Modal({
  label,
  title,
  subtitle,
  width = 580,
  onClose,
  children,
}: {
  label: string;
  title: string;
  subtitle?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Um popover aberto tem prioridade: ele fecha, o modal continua.
      if (document.querySelector("[data-popover]")) return;
      event.stopPropagation();
      onClose();
    }

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 pt-[8vh] sm:p-6 sm:pt-[10vh]">
      <div
        aria-hidden
        onMouseDown={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ maxWidth: width }}
        className={cn(
          "relative z-10 w-full overflow-hidden rounded-[var(--radius-card)]",
          "border border-line bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.32)]",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">{title}</p>
            {subtitle ? <p className="mt-0.5 truncate text-[12px] text-faint">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex-none text-faint transition-colors hover:text-ink"
          >
            <X size={17} />
          </button>
        </header>

        {children}
      </div>
    </div>
  );
}

/**
 * Barra de acoes. Vive dentro do `form` — se ficasse fora, o botao de enviar
 * nao enviaria nada. As margens negativas cancelam o respiro do corpo.
 */
export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 -mb-4 mt-1 flex items-center justify-end gap-2 border-t border-line px-5 py-3">
      {children}
    </div>
  );
}
