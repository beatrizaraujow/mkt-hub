import { cn } from "@/lib/utils";

/**
 * O anel de progresso, em CSS puro.
 *
 * `conic-gradient` em vez de SVG: sao duas linhas, nao entra no bundle, e o
 * unico dado que ele precisa e um percentual. Acima de 100% o anel fecha e
 * para — anel dando a volta duas vezes nao se le.
 *
 * A cor do arco vem de `currentColor`, entao **quem chama pinta**: envolva num
 * `text-*` com a faixa (`TOM[...]`) e o anel e o numero saem da mesma regua,
 * sem o componente precisar conhecer as faixas.
 *
 * `miolo` existe porque o disco de dentro tem de ser da cor do fundo atras
 * dele. Dentro de um cartao e `bg-surface`; solto na pagina, `bg-bg`. Errar
 * isso deixa um disco claro flutuando sobre fundo escuro.
 *
 * **A trilha usa `--border` e nao `--line`.** `--line` e o nome Tailwind
 * (`border-line`), nao uma propriedade CSS: `@theme inline` embute o valor nas
 * utilitarias em vez de declarar a variavel. Escrita dentro do gradiente ela
 * nao resolvia, e uma `var()` invalida derruba a declaracao inteira — era por
 * isso que este anel vinha desde 31/08 sem desenhar arco nenhum, so o numero
 * no meio de um circulo transparente.
 */
export function ProgressRing({
  percentual,
  tom,
  size = 52,
  miolo = "bg-surface",
  className,
}: {
  percentual: number | null;
  /** Classe de cor do numero. O arco segue o `currentColor` de quem chama. */
  tom: string;
  size?: number;
  miolo?: string;
  className?: string;
}) {
  const volta = Math.min(Math.max(percentual ?? 0, 0), 100) / 100;
  const dentro = size - 12;

  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(currentColor 0turn ${volta}turn, var(--border) ${volta}turn 1turn)`,
      }}
    >
      <span
        className={cn("grid place-items-center rounded-full", miolo)}
        style={{ width: dentro, height: dentro }}
      >
        <span
          className={cn("tnum font-medium", tom)}
          style={{ fontSize: Math.round(size * 0.25) }}
        >
          {percentual === null ? "—" : `${percentual}%`}
        </span>
      </span>
    </span>
  );
}
