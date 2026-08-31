import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
  {
    variants: {
      variant: {
        /*
         * O botao primario e da marca, nao do acento: e o unico lugar da
         * interface onde a pessoa vem clicar de proposito, e e la que o ouro
         * paga. O petroleo continua sendo a cor de foco, progresso e navegacao
         * — quem le a tela nao perde a codificacao por causa disto.
         */
        primary: "bg-brand text-brand-fg hover:brightness-[1.07]",
        subtle: "bg-sunk text-ink border border-line hover:bg-hover",
        ghost: "text-muted hover:bg-hover hover:text-ink",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: Props) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}

export { button as buttonStyles };
