"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Rect = { top: number; left: number; width: number; openUp: boolean };

/**
 * Painel flutuante ancorado no gatilho.
 *
 * Usa `position: fixed` calculado a partir do retangulo do gatilho, e nao
 * `absolute`: o trilho lateral do modal tem `overflow-y-auto`, que cortaria
 * qualquer filho posicionado dentro dele.
 */
export function useAnchoredPopover(minWidth = 240) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;

    const box = el.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 300;
    const room = window.innerHeight - box.bottom;
    const openUp = room < panelHeight + 16 && box.top > room;

    setRect({
      top: openUp ? box.top - 6 : box.bottom + 6,
      left: Math.min(box.left, window.innerWidth - Math.max(minWidth, box.width) - 12),
      width: Math.max(minWidth, box.width),
      openUp,
    });
  }, [minWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Fecha só o popover; o modal atrás continua aberto.
        event.stopPropagation();
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return { open, setOpen, rect, triggerRef, panelRef };
}

export function PopoverPanel({
  rect,
  panelRef,
  children,
  className,
}: {
  rect: Rect | null;
  panelRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      ref={panelRef}
      role="listbox"
      /* Marca para quem escuta Escape saber que ha um popover na frente. */
      data-popover=""
      style={
        rect
          ? {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              transform: rect.openUp ? "translateY(-100%)" : undefined,
            }
          : { visibility: "hidden" }
      }
      className={cn(
        "fixed z-50 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface",
        "shadow-[0_16px_40px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Rodape com a dica de teclado. Some no celular, onde nao ha teclado. */
export function PopoverHint({ left, right }: { left: string; right?: string }) {
  return (
    <div className="hidden items-center justify-between border-t border-line px-3 py-1.5 text-[11px] text-faint sm:flex">
      <span>{left}</span>
      {right ? <span>{right}</span> : null}
    </div>
  );
}
