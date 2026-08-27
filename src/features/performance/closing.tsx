"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { faixaDe } from "@/features/routines/stats";
import { TOM } from "@/features/routines/tone";
import { calcularSemana, fecharSemana, validarCoins } from "./actions";
import type { Entrada } from "./snapshot";

/**
 * A mesa de fechamento. So quem gerencia ve.
 *
 * **O botao que fecha e o unico irreversivel do sistema**, entao ele pede
 * confirmacao e diz, antes, quantas coins vao ser creditadas e para quantas
 * pessoas. Botao que paga sem dizer quanto e como assinar sem ler.
 */

const REGUA_LABEL = { pontos: "pontos", rotinas: "rotinas" } as const;

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
  entryIds,
}: {
  ymd: string;
  snapshotId: string | null;
  status: "pendente" | "fechado" | null;
  entradas: Entrada[];
  validadas: Map<string, number | null>;
  entryIds: Map<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const fechada = status === "fechado";

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
              : "O sistema sugere; você valida. Nada é creditado até fechar."}
          </p>
        </div>

        {!fechada && (
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

                return (
                  <tr key={entrada.pessoaId} className="border-b border-line last:border-b-0">
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
                      {fechada || !entryId ? (
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
                            roda(() => validarCoins(entryId, valor, ""));
                          }}
                          className="tnum h-7 w-14 rounded-[var(--radius-control)] border border-line bg-surface px-1.5 text-right text-[13px] text-ink focus:border-accent focus:outline-none"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
