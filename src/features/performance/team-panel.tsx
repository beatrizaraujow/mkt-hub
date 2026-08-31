import { cn } from "@/lib/utils";
import { BARRA, TOM } from "@/features/routines/tone";
import { faixaDoRitmo } from "./pace";
import type { Entrada } from "./snapshot";

/**
 * O time da semana, separado pelos dois grupos de regua.
 *
 * **Todo mundo ve a lista inteira**, por decisao de 31/08/2026. A versao
 * anterior mostrava so o podio para quem nao gerencia, com o argumento de que
 * "7o lugar" e exposicao e nao motivacao. A casa decidiu o contrario: numero
 * que a chefia ve e o time nao ve cria a suspeita de que existe um placar
 * secreto, e essa suspeita custa mais do que a exposicao.
 *
 * Os dois grupos ficam lado a lado e nunca no mesmo ranking. Comparar quem
 * entrega pontos com quem entrega presenca produz um numero que nao quer dizer
 * nada — sao trabalhos diferentes, com reguas diferentes. Só o percentual
 * atravessa, e mesmo ele significa coisas distintas dos dois lados.
 */

const GRUPO = {
  pontos: "Grupo pontos",
  rotinas: "Grupo rotina",
} as const;

/**
 * Quem esta em risco de nao bater a semana.
 *
 * Duas condicoes, e as duas importam. Percentual baixo sozinho e verdade para
 * todo mundo na segunda-feira de manha — um alerta que aparece toda semana no
 * mesmo horario deixa de ser alerta. So vira risco quando **ja nao ha tempo**:
 * dois dias uteis ou menos, e ainda abaixo de 70%.
 */
function emRisco(entrada: Entrada, diasRestantes: number): boolean {
  if (diasRestantes > 2) return false;
  return entrada.percentual !== null && entrada.percentual < 70;
}

function Linha({
  entrada,
  posicao,
  euSou,
  diasRestantes,
}: {
  entrada: Entrada;
  /** `null` quando nao ha o que ordenar — sem regua vencida, sem posicao. */
  posicao: number | null;
  euSou: boolean;
  diasRestantes: number;
}) {
  const faixa = faixaDoRitmo(entrada.percentual, diasRestantes);
  const largura = Math.min(Math.max(entrada.percentual ?? 0, 0), 100);

  return (
    <li
      className={cn(
        "grid grid-cols-[1.1rem_minmax(0,1fr)_5rem_2.6rem] items-center gap-2.5 rounded-[var(--radius-control)] px-1.5 py-1.5",
        euSou && "bg-hover",
      )}
    >
      <span className="tnum text-[11.5px] text-faint">{posicao === null ? "—" : `${posicao}º`}</span>

      <span className={cn("min-w-0 truncate text-[13px]", euSou ? "font-medium text-ink" : "text-muted")}>
        {entrada.nome}
        {euSou && <span className="text-faint"> · você</span>}
      </span>

      <span className="h-1 rounded-full bg-line" aria-hidden>
        <span
          className={cn("block h-1 rounded-full", BARRA[faixa])}
          style={{ width: `${largura}%` }}
        />
      </span>

      <span className={cn("tnum text-right text-[12px]", TOM[faixa])}>
        {entrada.percentual === null ? "—" : `${entrada.percentual}%`}
      </span>
    </li>
  );
}

function Grupo({
  rule,
  entradas,
  meId,
  diasRestantes,
}: {
  rule: "pontos" | "rotinas";
  entradas: Entrada[];
  meId: string;
  diasRestantes: number;
}) {
  // Aqui a ordem e por desempenho, ao contrario da mesa de fechamento: esta
  // lista existe para mostrar onde cada um esta, nao para conferir linha a linha.
  const ordenadas = entradas
    .filter((e) => e.rule === rule)
    .sort((a, b) => (b.percentual ?? -1) - (a.percentual ?? -1));

  if (ordenadas.length === 0) return null;

  return (
    <div>
      <p className="label-mono border-b border-line pb-2">{GRUPO[rule]}</p>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {ordenadas.map((entrada) => (
          <Linha
            key={entrada.pessoaId}
            entrada={entrada}
            posicao={entrada.posicao}
            euSou={entrada.pessoaId === meId}
            diasRestantes={diasRestantes}
          />
        ))}
      </ul>
    </div>
  );
}

export function TeamPanel({
  entradas,
  meId,
  diasRestantes,
}: {
  entradas: Entrada[];
  meId: string;
  diasRestantes: number;
}) {
  const risco = entradas.filter((e) => emRisco(e, diasRestantes)).length;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label-mono">O time nesta semana</h2>
        {risco > 0 && (
          <p className="text-[11.5px] text-danger">
            <span className="tnum">{risco}</span> {risco === 1 ? "pessoa" : "pessoas"} sem tempo de
            virar
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <Grupo rule="pontos" entradas={entradas} meId={meId} diasRestantes={diasRestantes} />
        <Grupo rule="rotinas" entradas={entradas} meId={meId} diasRestantes={diasRestantes} />
      </div>
    </section>
  );
}
