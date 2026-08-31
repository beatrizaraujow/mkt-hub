import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
}: {
  title: string;
  description?: string;
  /**
   * Selo colado no título, para estado que vale para a tela inteira — o modo do
   * revisor é o caso. Fica aqui e não em `actions` porque não é ação: quem lê
   * "Medição" precisa saber, na mesma linha, de que sistema veio o número.
   */
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 md:px-7 md:py-5",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[22px] font-semibold text-ink md:text-[26px]">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-0.5 text-[13.5px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-[46ch] text-[13.5px] text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
