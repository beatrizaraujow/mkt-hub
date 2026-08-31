"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { faixaDe } from "@/features/routines/stats";
import { TOM } from "@/features/routines/tone";
import { calcularSemana, fecharSemana, validarCoins } from "./actions";
import type { Entrada } from "./snapshot";

/**
 * A mesa de fechamento. **Todo mundo ve; so quem gerencia mexe.**
 *
 * Ver e mexer sao permissoes diferentes, e separa-las e o ponto: o time
 * enxerga a conta inteira — quanto cada um entregou, quanto isso vale, o que
 * seria creditado — sem poder alterar nada. Numero que decide pagamento e que
 * so a chefia enxerga cria a suspeita de placar secreto.
 *
 * **Esconder o botao e conforto, nunca seguranca.** `calcularSemana`,
 * `validarCoins` e `fecharSemana` chamam `assertCanManage` no servidor; quem
 * chamar a action direto bate na mesma linha, com ou sem botao na tela.
 *
 * **O botao que fecha e o unico irreversivel do sistema**, entao ele pede
 * confirmacao e diz, antes, quantas coins vao ser creditadas e para quantas
 * pessoas. Botao que paga sem dizer quanto e como assinar sem ler.
 */

const REGUA_LABEL = { pontos: "pontos", rotinas: "rotinas" } as const;

/**
 * O percentual da mesa e **absoluto**, e nao relativo ao ritmo como nos
 * cartoes do topo.
 *
 * Nao e inconsistencia: sao perguntas diferentes. Os cartoes respondem "como a
 * semana esta indo" — la, 33% na segunda e bom sinal. A mesa responde "o que
 * seria creditado se eu fechasse agora" — e coin sai de percentual da meta, sem
 * desconto por ser cedo. A mesma pessoa aparecer verde em cima e vermelha aqui
 * e a informacao, nao o defeito.
 */
function Percentual({ valor }: { valor: number | null }) {
  return (
    <span className={cn("tnum font-medium", TOM[faixaDe(valor)])}>
      {valor === null ? "—" : `${valor}%`}
    </span>
  );
}

export function ClosingTable({
  ymd,
  snapshotId,
  status,
  entradas,
  validadas,
  motivos,
  entryIds,
  podeEditar,
}: {
  ymd: string;
  snapshotId: string | null;
  status: "pendente" | "fechado" | null;
  entradas: Entrada[];
  validadas: Map<string, number | null>;
  motivos: Map<string, string>;
  entryIds: Map<string, string>;
  /** Gestor ou acima. Falso deixa a mesa inteira em modo de leitura. */
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const fechada = status === "fechado";
  const somenteLeitura = fechada || !podeEditar;

  const aCreditar = entradas.reduce(
    (soma, e) => soma + (validadas.get(e.pessoaId) ?? e.coinsSugeridas),
    0,
  );
  const pessoasComCoin = entradas.filter(
    (e) => (validadas.get(e.pessoaId) ?? e.coinsSugeridas) > 0,
  ).length;

  function roda(fn: () => Promise<{ error?: string }>) {
    setErro(null);
    start(async () => {
      const r = await fn();
      if (r.error) setErro(r.error);
      else router.refresh();
    });
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="label-mono">Fechamento da semana</h2>
          <p className="mt-1 text-[12px] text-faint">
            {fechada
              ? "Semana fechada. Não recalcula — ela conta a história de quando fechou."
              : podeEditar
                ? "O sistema sugere; você valida. Nada é creditado até fechar."
                : "O sistema sugere; quem gerencia valida. Nada é creditado até fechar."}
          </p>
        </div>

        {!somenteLeitura && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="subtle" disabled={pending} onClick={() => roda(() => calcularSemana(ymd))}>
              <RefreshCw size={14} strokeWidth={2} />
              {snapshotId ? "Recalcular" : "Calcular"}
            </Button>
            {snapshotId && (
              <Button size="sm" disabled={pending} onClick={() => setConfirmando(true)}>
                <Lock size={14} strokeWidth={2} />
                Fechar semana
              </Button>
            )}
          </div>
        )}
      </div>

      {erro ? (
        <p role="alert" className="border-b border-line px-4 py-2 text-[13px] text-danger">
          {erro}
        </p>
      ) : null}

      {confirmando && snapshotId && (
        <div className="border-b border-line bg-sunk px-4 py-3">
          <p className="text-[13px] text-ink">
            Fechar credita{" "}
            <span className="tnum font-medium text-reward">{aCreditar} coins</span> para{" "}
            <span className="tnum font-medium">{pessoasComCoin}</span>{" "}
            {pessoasComCoin === 1 ? "pessoa" : "pessoas"}, e a semana para de recalcular.
          </p>
          <p className="mt-1 text-[12px] text-faint">
            Coin creditada não se despaga: correção depois entra como ajuste no extrato, com motivo.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirmando(false);
                roda(() => fecharSemana(snapshotId));
              }}
            >
              <Check size={14} strokeWidth={2.5} />
              Confirmar e creditar
            </Button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="text-[12.5px] text-faint transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {entradas.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-faint">
          Ninguém tem régua de desempenho cadastrada.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label-mono px-4 py-2 font-normal">Pessoa</th>
                <th className="label-mono px-2 py-2 font-normal">Régua</th>
                <th className="label-mono px-2 py-2 text-right font-normal">Entregue</th>
                <th className="label-mono px-2 py-2 text-right font-normal">Meta</th>
                <th className="label-mono px-2 py-2 text-right font-normal">%</th>
                <th className="label-mono px-2 py-2 text-right font-normal">Pos.</th>
                <th className="label-mono px-4 py-2 text-right font-normal">Coins</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((entrada) => {
                const validada = validadas.get(entrada.pessoaId);
                const coins = validada ?? entrada.coinsSugeridas;
                const entryId = entryIds.get(entrada.pessoaId);
                const motivo = motivos.get(entrada.pessoaId) ?? "";
                /*
                 * A linha do motivo so existe quando alguem mexeu no numero.
                 * Sete campos de texto vazios numa mesa de sete pessoas seriam
                 * sete convites a preencher nada — e o campo perderia o peso
                 * justo quando ele importa.
                 */
                const corrigida = validada !== null && validada !== undefined
                  && validada !== entrada.coinsSugeridas;

                return (
                  <Fragment key={entrada.pessoaId}>
                  <tr className={corrigida ? "" : "border-b border-line last:border-b-0"}>
                    <td className="px-4 py-2">
                      <span className="text-ink">{entrada.nome}</span>
                      {entrada.semPonto > 0 && (
                        <span
                          className="tnum ml-2 text-[11.5px] text-warning"
                          title="Entregas concluídas sem Ponto MKT preenchido"
                        >
                          {entrada.semPonto} sem ponto
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted">{REGUA_LABEL[entrada.rule]}</td>
                    <td className="tnum px-2 py-2 text-right">
                      {entrada.rule === "pontos"
                        ? entrada.pontos
                        : `${entrada.rotinasFeitas}/${entrada.rotinasCobradas}`}
                    </td>
                    <td className="tnum px-2 py-2 text-right text-faint">
                      {entrada.rule === "pontos" ? (entrada.meta ?? "—") : "rotinas"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Percentual valor={entrada.percentual} />
                    </td>
                    <td className="tnum px-2 py-2 text-right text-faint">{entrada.posicao ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {somenteLeitura || !entryId ? (
                        <span className="tnum font-medium text-reward">{coins}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={6}
                          defaultValue={coins}
                          disabled={pending}
                          onBlur={(event) => {
                            const valor = Number(event.target.value);
                            if (valor === coins) return;
                            // Sem terceiro argumento: a nota que ja existir fica.
                            roda(() => validarCoins(entryId, valor));
                          }}
                          className="tnum h-7 w-14 rounded-[var(--radius-control)] border border-line bg-surface px-1.5 text-right text-[13px] text-ink focus:border-accent focus:outline-none"
                        />
                      )}
                    </td>
                  </tr>

                  {corrigida && (
                    <tr className="border-b border-line last:border-b-0">
                      <td colSpan={7} className="px-4 pb-2">
                        <label className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
                          <span className="shrink-0">
                            Por que {coins} e não {entrada.coinsSugeridas}?
                          </span>
                          {somenteLeitura ? (
                            <span className="text-muted">{motivo || "— sem motivo registrado"}</span>
                          ) : (
                            <input
                              defaultValue={motivo}
                              disabled={pending}
                              maxLength={300}
                              placeholder="semana de quatro dias úteis, feriado no meio"
                              onBlur={(event) => {
                                const texto = event.target.value;
                                if (texto.trim() === motivo.trim()) return;
                                roda(() => validarCoins(entryId!, coins, texto));
                              }}
                              className="h-7 min-w-[240px] flex-1 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[12.5px] text-ink focus:border-accent focus:outline-none"
                            />
                          )}
                        </label>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {/*
            O total no rodape existe para nao precisar somar sete linhas de
            cabeca antes de clicar num botao que credita de verdade. O mesmo
            numero aparece na confirmacao — aqui ele fica visivel o tempo todo.
          */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[11.5px] text-faint">
            <span>
              A semana fecha no domingo · {entradas.length}{" "}
              {entradas.length === 1 ? "pessoa com régua" : "pessoas com régua"}
            </span>
            <span>
              <span className="tnum text-reward">{aCreditar}</span>{" "}
              {fechada ? "coins creditadas" : "coins a creditar"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
