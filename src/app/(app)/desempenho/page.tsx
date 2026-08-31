import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { snapshotEntries } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth";
import { brtToday } from "@/lib/date";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClosingTable } from "@/features/performance/closing";
import { saldoDeCoins, semanaNaTela } from "@/features/performance/queries";
import { diasUteisRestantes, mondayOf, shiftWeek } from "@/lib/week";
import { WeekCards } from "@/features/performance/week-cards";
import { TeamPanel } from "@/features/performance/team-panel";

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
  const fechada = dados.fechamento?.status === "fechado";

  /*
   * Semana passada nao tem dia restante, e semana futura tem a semana inteira.
   * Sem isso, abrir uma semana antiga diria "3 dias uteis restantes" sobre um
   * periodo que ja acabou.
   */
  const diasRestantes =
    ymd === estaSemana ? diasUteisRestantes(hoje, dados.semana.fim) : ymd < estaSemana ? 0 : 5;

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
              <WeekCards
                minha={minha}
                diasRestantes={diasRestantes}
                fechada={fechada}
                saldo={meuSaldo}
              />
            ) : (
              <p className="text-[13px] text-faint">
                Você não tem régua de desempenho cadastrada, então não aparece no fechamento.
              </p>
            )}

            {/*
              Painel e mesa aparecem para todo mundo. O que muda por papel e so
              o que da para MEXER — e isso o servidor garante em `assertCanManage`,
              nao o `podeEditar` daqui, que e conforto de tela.
            */}
            <TeamPanel entradas={dados.entradas} meId={user.id} diasRestantes={diasRestantes} />

            <ClosingTable
              ymd={ymd}
              snapshotId={dados.fechamento?.id ?? null}
              status={dados.fechamento?.status ?? null}
              entradas={dados.entradas}
              validadas={dados.validadas}
              motivos={dados.motivos}
              entryIds={entryIds}
              podeEditar={gerencia}
            />

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
