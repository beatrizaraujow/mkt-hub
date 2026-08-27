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
  weekProgress,
} from "@/features/routines/queries";
import { isWeek, mondayOf, weekDays } from "@/features/routines/week";
import { RoutineGrid } from "@/features/routines/grid";
import { ItemPanel } from "@/features/work-items/item-panel";
import { WeekNav } from "./week-nav";

export const metadata: Metadata = { title: "Rotinas · MKT Hub" };

export default async function RotinasPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; item?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const today = brtToday();
  const thisMonday = mondayOf(today);
  // Só aceita segunda-feira na URL: `?semana=2026-08-27` viraria uma grade
  // deslocada, com a semana começando na quinta.
  const monday = isWeek(params.semana) ? mondayOf(params.semana) : thisMonday;

  // Gera antes de ler. É o que dispensa cron: quem abre a tela materializa a
  // semana, e o índice único segura duas pessoas abrindo ao mesmo tempo.
  await ensureWeek(user, monday);

  const [routines, occurrences] = await Promise.all([
    listRoutines(user),
    occurrencesForWeek(user, monday),
  ]);

  const days = weekDays(monday);
  const progress = weekProgress(occurrences, today);
  const manage = canManage(user);

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

      <div className="px-5 py-5 md:px-7">
        {routines.length === 0 ? (
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
        ) : (
          <>
            <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <span className="text-muted">
                <span className="tnum font-medium text-ink">
                  {progress.done}/{progress.total}
                </span>{" "}
                publicados nesta semana
              </span>
              {progress.late > 0 && (
                <span className="tnum font-medium text-danger">{progress.late} atrasados</span>
              )}
            </p>

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
