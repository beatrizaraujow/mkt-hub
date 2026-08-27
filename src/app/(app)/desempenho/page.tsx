import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { snapshotEntries } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth";
import { brtToday } from "@/lib/date";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/page-header";
import { faixaDe } from "@/features/routines/stats";
import { TOM } from "@/features/routines/tone";
import { ClosingTable } from "@/features/performance/closing";
import { saldoDeCoins, semanaNaTela } from "@/features/performance/queries";
import { mondayOf, shiftWeek } from "@/lib/week";

export const metadata: Metadata = { title: "Desempenho · MKT Hub" };

const DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const rotulo = (ymd: string) => DIA.format(new Date(`${ymd}T12:00:00-03:00`)).replace(".", "");

export default async function DesempenhoPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const hoje = brtToday();
  const estaSemana = mondayOf(hoje);
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(params.semana ?? "") ? mondayOf(params.semana!) : estaSemana;

  const [dados, saldos] = await Promise.all([semanaNaTela(user, ymd), saldoDeCoins(user)]);
  const gerencia = canManage(user);

  const minha = dados.entradas.find((entrada) => entrada.pessoaId === user.id) ?? null;
  const meuSaldo = saldos.get(user.id) ?? 0;

  /**
   * Top 3 e a sua posição — nunca a lista completa.
   *
   * Com sete pessoas, "7º lugar" é exposição e não motivação, e a comparação
   * só faz sentido dentro do mesmo grupo de régua. Quem gerencia vê a mesa de
   * fechamento inteira porque precisa decidir; o resto do time vê o próprio
   * número e o pódio.
   */
  const meuGrupo = minha
    ? dados.entradas
        .filter((entrada) => entrada.rule === minha.rule && entrada.posicao !== null)
        .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0))
    : [];
  const podio = meuGrupo.slice(0, 3);

  const semanaLink = (delta: number) => {
    const alvo = shiftWeek(ymd, delta);
    return alvo === estaSemana ? "/desempenho" : `/desempenho?semana=${alvo}`;
  };

  // Os ids das linhas guardadas, para a mesa poder validar coin sem recalcular.
  const entryIds = new Map<string, string>();
  if (dados.fechamento) {
    const linhas = await db
      .select({ id: snapshotEntries.id, userId: snapshotEntries.userId })
      .from(snapshotEntries)
      .where(eq(snapshotEntries.snapshotId, dados.fechamento.id));
    for (const linha of linhas) entryIds.set(linha.userId, linha.id);
  }

  return (
    <>
      <PageHeader
        title="Desempenho"
        description="Como a semana está indo, e o que ela virou."
        actions={
          <div className="flex items-center gap-1">
            <Link
              href={semanaLink(-1)}
              aria-label="Semana anterior"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <ChevronLeft size={15} />
            </Link>
            <span className="tnum min-w-[132px] text-center text-[13px] text-ink">
              {rotulo(dados.semana.inicio)} a {rotulo(dados.semana.fim)}
            </span>
            <Link
              href={semanaLink(1)}
              aria-label="Próxima semana"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <ChevronRight size={15} />
            </Link>
            {ymd !== estaSemana && (
              <Link href="/desempenho" className="ml-1 text-[12.5px] text-faint hover:text-ink">
                Esta semana
              </Link>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-5 px-5 py-5 md:px-7">
        {dados.entradas.length === 0 ? (
          <EmptyState
            title="Nenhuma régua cadastrada"
            description="O desempenho aparece depois que alguém tiver meta de pontos ou régua de rotinas."
          />
        ) : (
          <>
            {minha ? (
              <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <p className="flex items-baseline gap-2">
                    <span
                      className={cn("tnum text-[28px] font-medium leading-none", TOM[faixaDe(minha.percentual)])}
                    >
                      {minha.percentual === null ? "—" : `${minha.percentual}%`}
                    </span>
                    <span className="text-[13px] text-muted">da sua semana</span>
                  </p>

                  <p className="text-[13px] text-muted">
                    {minha.rule === "pontos" ? (
                      <>
                        <span className="tnum font-medium text-ink">{minha.pontos}</span> de{" "}
                        <span className="tnum">{minha.meta ?? "—"}</span> pontos
                      </>
                    ) : (
                      <>
                        <span className="tnum font-medium text-ink">{minha.rotinasFeitas}</span> de{" "}
                        <span className="tnum">{minha.rotinasCobradas}</span> rotinas que venceram
                      </>
                    )}
                  </p>

                  <p className="text-[13px] text-muted">
                    <span className="tnum font-medium text-reward">{meuSaldo}</span> coins no total
                  </p>

                  {minha.semPonto > 0 && (
                    <p className="tnum text-[12.5px] text-warning">
                      {minha.semPonto} entrega{minha.semPonto > 1 ? "s" : ""} sem Ponto MKT
                    </p>
                  )}
                </div>

                {podio.length > 0 && (
                  <div className="mt-3.5 border-t border-line pt-3">
                    <p className="label-mono">Entre quem tem a mesma régua</p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {podio.map((entrada) => (
                        <li key={entrada.pessoaId} className="flex items-center gap-3 text-[13px]">
                          <span className="tnum w-4 text-faint">{entrada.posicao}º</span>
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate",
                              entrada.pessoaId === user.id ? "font-medium text-ink" : "text-muted",
                            )}
                          >
                            {entrada.nome}
                          </span>
                          <span className={cn("tnum", TOM[faixaDe(entrada.percentual)])}>
                            {entrada.percentual}%
                          </span>
                        </li>
                      ))}
                      {minha.posicao !== null && minha.posicao > 3 && (
                        <li className="flex items-center gap-3 border-t border-line pt-1 text-[13px]">
                          <span className="tnum w-4 text-faint">{minha.posicao}º</span>
                          <span className="min-w-0 flex-1 truncate font-medium text-ink">
                            {minha.nome}
                          </span>
                          <span className={cn("tnum", TOM[faixaDe(minha.percentual)])}>
                            {minha.percentual}%
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </section>
            ) : (
              <p className="text-[13px] text-faint">
                Você não tem régua de desempenho cadastrada, então não aparece no fechamento.
              </p>
            )}

            {gerencia && (
              <ClosingTable
                ymd={ymd}
                snapshotId={dados.fechamento?.id ?? null}
                status={dados.fechamento?.status ?? null}
                entradas={dados.entradas}
                validadas={dados.validadas}
                entryIds={entryIds}
              />
            )}

            {dados.fechamento?.status === "fechado" && (
              <p className="text-[12px] text-faint">
                Fechada por {dados.fechamento.fechadoPor ?? "alguém que saiu do sistema"} em{" "}
                {dados.fechamento.fechadoEm?.toLocaleDateString("pt-BR")}.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
