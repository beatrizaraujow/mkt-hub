import { cn } from "@/lib/utils";
import { TOM } from "@/features/routines/tone";
import { faixaDoRitmo, textoDoRitmo } from "./pace";
import type { Entrada } from "./snapshot";

/**
 * Os tres cartoes do topo de Desempenho: onde voce esta, o que falta, e o que
 * isso vale.
 *
 * Substituem a faixa unica que so dizia "33% da sua semana". O numero sozinho
 * informa e nao ajuda: quem esta em 33% na quarta-feira precisa saber quanto
 * falta e em quantos dias, senao o painel vira placar de televisao.
 *
 * **Nao inventa regra de coin.** O mockup trazia "1 por meta · 1 por 2o lugar",
 * que descreve uma regua que nao existe: a de hoje e tudo-ou-nada por
 * percentual — 120% leva a coin de 120, 100% leva a de 100, abaixo nao leva
 * nada, e posicao nao entra. Desenhar o contrario na tela ensinaria o time uma
 * regra falsa sobre o proprio pagamento.
 */

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface p-4">
      <p className="label-mono">{titulo}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * O anel de progresso, em CSS puro.
 *
 * `conic-gradient` em vez de SVG: sao duas linhas, nao entra no bundle, e o
 * unico dado que ele precisa e um percentual. Acima de 100% o anel fecha e
 * para — anel dando a volta duas vezes nao se le.
 */
function Anel({ percentual, tom }: { percentual: number | null; tom: string }) {
  const volta = Math.min(Math.max(percentual ?? 0, 0), 100) / 100;

  return (
    <div
      className="grid h-13 w-13 shrink-0 place-items-center rounded-full"
      style={{
        width: "3.25rem",
        height: "3.25rem",
        background: `conic-gradient(currentColor 0turn ${volta}turn, var(--line) ${volta}turn 1turn)`,
      }}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-surface">
        <span className={cn("tnum text-[13px] font-medium", tom)}>
          {percentual === null ? "—" : `${percentual}%`}
        </span>
      </span>
    </div>
  );
}

export function WeekCards({
  minha,
  diasRestantes,
  fechada,
  saldo,
}: {
  minha: Entrada;
  /** Dias uteis que ainda restam, contando hoje. Zero no fim de semana. */
  diasRestantes: number;
  fechada: boolean;
  /** Saldo total no extrato, de todas as semanas ja fechadas. */
  saldo: number;
}) {
  /*
   * A cor sai do RITMO, nao do percentual cru. A escala de 90/70 foi feita para
   * semana fechada; aplicada na segunda de manha, pinta o time inteiro de
   * vermelho — e o proprio texto do cartao fala em ritmo, entao a cor tem de
   * concordar com ele.
   */
  const tom = TOM[faixaDoRitmo(minha.percentual, diasRestantes)];
  const porPontos = minha.rule === "pontos";

  const falta = porPontos
    ? Math.max(0, (minha.meta ?? 0) - minha.pontos)
    : Math.max(0, minha.rotinasCobradas - minha.rotinasFeitas);

  const bateu = falta === 0 && minha.percentual !== null;
  const porDia = diasRestantes > 0 ? Math.ceil(falta / diasRestantes) : null;

  const teto = minha.coinsAos120 ?? minha.coinsAos100;

  return (
    <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3">
      <Cartao titulo={fechada ? "Sua semana" : "Sua meta"}>
        <div className="flex items-center gap-3.5">
          <span className={tom}>
            <Anel percentual={minha.percentual} tom={tom} />
          </span>
          <div className="min-w-0">
            <p className="text-[14.5px] text-ink">
              <span className="tnum">{porPontos ? minha.pontos : minha.rotinasFeitas}</span>{" "}
              <span className="text-muted">
                de <span className="tnum">{porPontos ? (minha.meta ?? "—") : minha.rotinasCobradas}</span>{" "}
                {porPontos ? "pontos" : "rotinas"}
              </span>
            </p>
            <p className={cn("mt-0.5 text-[12px]", bateu ? "text-success" : "text-muted")}>
              {textoDoRitmo(minha.percentual, diasRestantes)}
            </p>
          </div>
        </div>
      </Cartao>

      <Cartao titulo="O que falta">
        {bateu ? (
          <>
            <p className="font-display text-[24px] leading-none text-success">Nada</p>
            <p className="mt-2 text-[12px] text-muted">
              A meta já está batida. O que vier agora conta para os 120%.
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-[24px] leading-none text-ink">
              <span className="tnum">{falta}</span>{" "}
              <span className="text-[14px] text-muted">{porPontos ? "pontos" : "rotinas"}</span>
            </p>
            <p className="mt-2 text-[12px] text-muted">
              {diasRestantes === 0 ? (
                "sem dia útil restante nesta semana"
              ) : (
                <>
                  <span className="tnum">{diasRestantes}</span> dia
                  {diasRestantes > 1 ? "s úteis restantes" : " útil restante"} ·{" "}
                  <span className="tnum text-ink">{porDia} por dia</span> para bater
                </>
              )}
            </p>
          </>
        )}
      </Cartao>

      <Cartao titulo={fechada ? "Coins da semana" : "Coins previstos"}>
        <p className="flex items-baseline gap-1.5">
          <span className="tnum font-display text-[24px] leading-none text-reward">
            {minha.coinsSugeridas}
          </span>
          {teto !== null && (
            <span className="text-[12.5px] text-muted">
              de <span className="tnum">{teto}</span> possíveis
            </span>
          )}
        </p>

        {teto !== null && (
          <div className="mt-2.5 flex gap-1" aria-hidden>
            {Array.from({ length: teto }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-4 rounded-full",
                  i < minha.coinsSugeridas ? "bg-reward" : "bg-line",
                  // A folga marca onde termina a coin de 100% e comeca a de 120%.
                  minha.coinsAos100 !== null && i === minha.coinsAos100 ? "ml-2" : "",
                )}
              />
            ))}
          </div>
        )}

        <p className="mt-2 text-[11.5px] text-faint">
          {fechada
            ? "creditado no fechamento"
            : minha.coinsAos100 !== null
              ? `${minha.coinsAos100} ao bater 100% · ${teto} ao bater 120% · nada creditado até fechar`
              : "nada creditado até fechar"}
        </p>

        {/* O saldo do extrato, que sumiu junto com o podio. */}
        <p className="mt-1 text-[11.5px] text-faint">
          <span className="tnum text-reward">{saldo}</span> coins no total, somando as semanas
          fechadas
        </p>
      </Cartao>
    </div>
  );
}
