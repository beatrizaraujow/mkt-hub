import { cn } from "@/lib/utils";

/**
 * A marca e um circulo de progresso pela metade: o produto inteiro existe
 * para responder "quanto ja andou". Nada de decoracao alem disso.
 */
export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
        <circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        <path d="M9 1.5 A7.5 7.5 0 0 1 9 16.5 Z" fill="var(--accent)" />
      </svg>
      {!compact && (
        <span className="font-display text-[17px] font-semibold text-ink">MKT Hub</span>
      )}
    </span>
  );
}
