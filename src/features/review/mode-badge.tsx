import { cn } from "@/lib/utils";
import type { Mode } from "./settings";

/**
 * O selo do modo, no cabeçalho das três telas do revisor.
 *
 * Antes vivia num parágrafo cinza no rodapé do diagnóstico, e só lá. Quem abria
 * a Medição ou as Regras não tinha como saber se o que estava lendo veio de um
 * sistema que move tarefas ou de um que só opina — e essa é a diferença entre
 * "o revisor reprovou" e "o revisor achou". Selo igual nas três telas, sempre no
 * mesmo canto.
 *
 * **Âmbar aqui é `--warning`, não `--reward`.** A cor de recompensa é reservada
 * para coin, ranking e meta batida; modo silencioso é estado do sistema, e
 * estado se pinta com cor semântica. As duas são âmbar de perto e significam
 * coisas diferentes de longe.
 */
export function ModeBadge({ mode, className }: { mode: Mode; className?: string }) {
  const silencioso = mode === "silencioso";

  return (
    <span
      title={
        silencioso
          ? "Emite parecer e não move nada no pipeline."
          : "A reprovação anda sozinha para Ajustar. Aprovado continua esperando alguém."
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-1",
        "font-mono text-[9.5px] uppercase tracking-[0.12em]",
        silencioso
          ? "border-warning/40 bg-warning-soft text-warning"
          : "border-accent/40 bg-accent-soft text-accent",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-[5px] w-[5px] rounded-full",
          silencioso ? "bg-warning" : "bg-accent",
        )}
      />
      Modo {silencioso ? "silencioso" : "ativo"}
    </span>
  );
}
