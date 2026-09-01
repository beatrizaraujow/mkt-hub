import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { brtToday } from "@/lib/date";
import { isMonth, monthLabel, monthOf, shiftMonth } from "@/lib/month";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { coinsDoMes, semanasDoMes } from "@/features/performance/coins-month";

export const metadata: Metadata = { title: "Coins do mês · MKT Hub" };
export const dynamic = "force-dynamic";

/**
 * As coins de cada um no mês.
 *
 * **Todo mundo vê a lista inteira**, pela mesma decisão de 31/08/2026 que abriu
 * o time em Desempenho: número que a chefia vê e o time não vê cria a suspeita
 * de um placar secreto, e essa suspeita custa mais do que a exposição.
 *
 * A tela **soma o extrato e não recalcula nada**. Quem quiser saber por que
 * alguém levou o que levou abre a semana no fechamento, onde a conta está.
 */
export default async function CoinsDoMesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const mesAtual = monthOf(brtToday());
  const mes = isMonth(params.mes) ? params.mes : mesAtual;

  const [dados, fechadas] = await Promise.all([
    coinsDoMes(user, mes),
    semanasDoMes(user, mes),
  ]);

  const link = (delta: number) => {
    const alvo = shiftMonth(mes, delta);
    return alvo === mesAtual ? "/desempenho/coins" : `/desempenho/coins?mes=${alvo}`;
  };

  const comAlgo = dados.linhas.filter((linha) => linha.total !== 0 || linha.semanas.length > 0);

  return (
    <>
      <PageHeader
        title="Coins do mês"
        description="O que cada um recebeu, somado das semanas fechadas."
        actions={
          <Link
            href="/desempenho"
            className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} />
            Desempenho
          </Link>
        }
      />

      <div className="flex flex-col gap-4 px-5 py-5 md:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Link
              href={link(-1)}
              aria-label="Mês anterior"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <ChevronLeft size={16} />
            </Link>
            <span className="min-w-[10rem] text-center text-[14px] font-medium text-ink">
              {monthLabel(mes)}
            </span>
            <Link
              href={link(1)}
              aria-label="Próximo mês"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <ChevronRight size={16} />
            </Link>
          </div>

          <p className="text-[12px] text-faint">
            {fechadas.length === 0 ? (
              "Nenhuma semana fechada neste mês"
            ) : (
              <>
                <span className="tnum">{fechadas.length}</span>{" "}
                {fechadas.length === 1 ? "semana fechada" : "semanas fechadas"} ·{" "}
                <span className="tnum text-reward">{dados.total}</span>{" "}
                {dados.total === 1 ? "coin no mês" : "coins no mês"}
              </>
            )}
          </p>
        </div>

        {comAlgo.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center text-[13px] text-faint">
            Nada creditado neste mês. Coin nasce no fechamento da semana, em Desempenho.
          </p>
        ) : (
          <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {comAlgo.map((linha) => {
              const euSou = linha.pessoaId === user.id;

              return (
                <div
                  key={linha.pessoaId}
                  className={cn(
                    "flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0",
                    euSou && "bg-hover",
                  )}
                >
                  <span
                    className={cn(
                      "min-w-[9rem] flex-1 text-[13.5px]",
                      euSou ? "font-medium text-ink" : "text-ink",
                    )}
                  >
                    {linha.nome}
                    {euSou && <span className="text-faint"> · você</span>}
                  </span>

                  {/*
                    A composição por semana fica à mostra: "3 + 5 + 2" explica o
                    total sem ninguém precisar abrir três telas para conferir.
                  */}
                  {linha.semanas.length > 0 && (
                    <span className="tnum font-mono text-[11px] text-faint">
                      {linha.semanas.map((semana) => semana.coins).join(" + ")}
                    </span>
                  )}

                  {linha.outros !== 0 && (
                    <span className="tnum text-[11.5px] text-muted">
                      {linha.outros > 0 ? "+" : ""}
                      {linha.outros} em ajuste
                    </span>
                  )}

                  <span className="tnum w-12 shrink-0 text-right text-[15px] font-medium text-reward">
                    {linha.total}
                  </span>

                  <span className="tnum w-20 shrink-0 text-right text-[11.5px] text-faint">
                    {dados.saldo.get(linha.pessoaId) ?? 0} no total
                  </span>
                </div>
              );
            })}
          </section>
        )}

        <p className="max-w-[80ch] text-[11.5px] leading-relaxed text-faint">
          A coin nasce no fechamento da semana e é validada por uma pessoa. Esta tela só soma o
          extrato — ela não recalcula nada, e por isso não pode divergir do que foi creditado. Uma
          semana conta no mês em que ela <strong className="font-medium">começa</strong>: a de 31/08
          a 06/09 conta inteira em agosto, e fechar com atraso não muda o mês dela.
        </p>
      </div>
    </>
  );
}
