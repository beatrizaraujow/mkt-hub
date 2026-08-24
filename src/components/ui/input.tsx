import { cn } from "@/lib/utils";

/** No React 19, `ref` e prop normal — `ComponentProps` ja a inclui. */
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm text-ink",
        "placeholder:text-faint transition-colors duration-150",
        "focus:border-accent focus:outline-none focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1.5 block text-[13px] font-medium text-muted", className)}
      {...props}
    />
  );
}
