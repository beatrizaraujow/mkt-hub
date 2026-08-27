import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth";
import { brtToday } from "@/lib/date";
import { EmptyState, PageHeader } from "@/components/page-header";
import {
  ensureWeek,
  listRoutines,
  occurrencesForWeek,
} from "@/features/routines/queries";
import { isWeek, mondayOf, weekDays } from "@/features/routines/week";
import { resumir, type Ocorrencia } from "@/features/routines/stats";
import { RoutineGrid } from "@/features/routines/grid";
import { RoutineSummary } from "@/features/routines/summary";
import { ItemPanel } from "@/features/work-items/item-panel";
import { RoutineFilters } from "./filters";
import { WeekNav } from "./week-nav";

export const metadata: Metadata = { title: "Rotinas · MKT Hub" };

export default async function RotinasPage({
  searchParams,
}: {
  searchParams: Promise<{
    semana?: string;
    item?: string;
    empresa?: string;
    responsavel?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const today = brtToday();
  const thisMonday = mondayOf(today);
  // Só aceita segunda-feira na URL: `?semana=2026-08-27` viraria uma grade
  // deslocada, com a semana começando na quinta.
  const monday = isWeek(params.semana) ? mondayOf(params.semana) : thisMonday;

  // Gera antes de ler, e sem olhar filtro nenhum: a materialização da semana
  // é do sistema, não do recorte que a pessoa escolheu ver. Gerar só o que
  // está filtrado deixaria buraco na semana de quem nunca abre a tela sem
  // filtro.
  await ensureWeek(user, monday);

  const [todasRotinas, todasOcorrencias] = await Promise.all([
    listRoutines(user),
    occurrencesForWeek(user, monday),
  ]);

  const filtroEmpresa = params.empresa ?? "";
  const filtroPessoa = params.responsavel ?? "";

  const routines = todasRotinas.filter(
    (rotina) =>
      (!filtroEmpresa || rotina.companyId === filtroEmpresa) &&
      (!filtroPessoa || rotina.assigneeId === filtroPessoa),
  );

  const visiveis = new Set(routines.map((rotina) => rotina.id));
  const occurrences = todasOcorrencias.filter((ocorrencia) => visiveis.has(ocorrencia.routineId));

  // O painel e a grade leem a mesma coleção já filtrada. Se lessem coleções
  // diferentes, o número de cima poderia discordar dos quadradinhos de baixo
  // sem ninguém notar até alguém somar na mão.
  const porRotina = new Map(routines.map((rotina) => [rotina.id, rotina]));
  const paraAnalise: Ocorrencia[] = occurrences.flatMap((ocorrencia) => {
    const rotina = porRotina.get(ocorrencia.routineId);
    if (!rotina) return [];
    return [
      {
        empresaId: rotina.companyId,
        empresaNome: rotina.companyName,
        empresaCor: rotina.companyColor,
        pessoaId: rotina.assigneeId,
        pessoaNome: rotina.assigneeName,
        dia: ocorrencia.day,
        publicada: ocorrencia.publishedAt !== null,
      },
    ];
  });

  const days = weekDays(monday);
  const geral = resumir(paraAnalise, today);
  const manage = canManage(user);

  // As opções vêm das rotinas que existem, não do cadastro inteiro — e da
  // lista sem filtro, senão escolher uma empresa apagaria as outras do
  // próprio seletor e não haveria como voltar.
  const empresasComRotina = [
    ...new Map(
      todasRotinas.map((rotina) => [rotina.companyId, { id: rotina.companyId, name: rotina.companyName }]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const pessoasComRotina = [
    ...new Map(
      todasRotinas
        .filter((rotina) => rotina.assigneeId && rotina.assigneeName)
        .map((rotina) => [rotina.assigneeId!, { id: rotina.assigneeId!, name: rotina.assigneeName! }]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const firstCompany = user.companyIds.length
    ? await db
        .select({ slug: companies.slug })
        .from(companies)
        .where(inArray(companies.id, user.companyIds))
        .orderBy(asc(companies.name))
        .limit(1)
    : [];

  return (
    <>
      <PageHeader
        title="Rotinas"
        description="O que deveria sair, e o que saiu."
        actions={
          <Suspense fallback={<div className="h-7 w-[260px]" />}>
            <WeekNav monday={monday} thisMonday={thisMonday} />
          </Suspense>
        }
      />

      {todasRotinas.length > 0 && (
        <Suspense fallback={<div className="h-[53px] border-b border-line" />}>
          <RoutineFilters
            companies={empresasComRotina}
            people={pessoasComRotina}
            meId={user.id}
          />
        </Suspense>
      )}

      <div className="px-5 py-5 md:px-7">
        {todasRotinas.length === 0 ? (
          <EmptyState
            title="Nenhuma rotina configurada"
            description={
              manage
                ? "A grade se monta sozinha depois que a primeira rotina existir. A configuração fica em Ajustes de cada empresa."
                : "Ninguém configurou rotina de publicação ainda."
            }
            action={
              manage && firstCompany[0] ? (
                <Link
                  href={`/empresas/${firstCompany[0].slug}#rotinas`}
                  className="text-[13px] text-accent hover:underline"
                >
                  Configurar em Empresas
                </Link>
              ) : undefined
            }
          />
        ) : routines.length === 0 ? (
          <EmptyState
            title="Nada neste recorte"
            description="Nenhuma rotina combina com o filtro escolhido."
          />
        ) : (
          <>
            <RoutineSummary ocorrencias={paraAnalise} hoje={today} geral={geral} />

            <RoutineGrid
              routines={routines}
              occurrences={occurrences}
              days={days}
              today={today}
            />
          </>
        )}
      </div>

      {params.item ? (
        <ItemPanel user={user} id={params.item} today={today} />
      ) : null}
    </>
  );
}
