import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * O selo da exceção, na lista e no quadro.
 *
 * Existe porque este sistema não tem notificação. Um pedido de exceção que só
 * aparecesse dentro da tarefa obrigaria quem decide a abrir uma por uma para
 * descobrir que alguém está esperando — e um pedido que ninguém vê é um pedido
 * negado devagar. Aqui ele aparece onde a liderança já está.
 *
 * Dourado é a cor do que a pessoa escolheu; um pedido ainda não foi escolhido
 * por ninguém, então ele fica no cinza do que está esperando. A peça já marcada
 * é que ganha o traço da marca.
 */
export function ExcecaoPill({
  marcada,
  pedida,
  className,
}: {
  marcada: boolean;
  pedida: boolean;
  className?: string;
}) {
  if (!marcada && !pedida) return null;

  return (
    <span
      title={
        marcada
          ? "Marcada como sem revisão automática"
          : "Exceção pedida, esperando decisão da liderança"
      }
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]",
        marcada ? "border-brand-line text-brand-ink" : "border-line-strong text-muted",
        className,
      )}
    >
      {marcada ? <Check size={9} strokeWidth={3} /> : <Clock size={9} strokeWidth={2.5} />}
      {marcada ? "sem revisão" : "exceção pedida"}
    </span>
  );
}
