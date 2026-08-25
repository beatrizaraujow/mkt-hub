import type { Metadata } from "next";
import { Suspense } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { brtToday, inputFromDueDate } from "@/lib/date";
import { gridRange, isMonth } from "@/lib/month";
import { EmptyState, PageHeader } from "@/components/page-header";
import {
  countWithoutDueDate,
  listInRange,
  listWorkItems,
  quickCreateOptions,
  stagesFor,
} from "@/features/work-items/queries";
import { ItemRow } from "@/features/work-items/item-row";
import { Board } from "@/features/work-items/board";
import { Calendar } from "@/features/work-items/calendar";
import { QuickCreate } from "@/features/work-items/quick-create";
import { ItemPanel } from "@/features/work-items/item-panel";
import { runningTimer } from "@/features/time/queries";
import { Filters } from "./filters";
import { ViewSwitch } from "./view-switch";

export const metadata: Metadata = { title: "Trabalho · MKT Hub" };

export default async function TrabalhoPage({
  searchParams,
}: {
  searchParams: Promise<{
    empresa?: string;
    responsavel?: string;
    concluidas?: string;
    view?: string;
    mes?: string;
    item?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = brtToday();
  const isBoard = params.view === "quadro";
  const isCalendar = params.view === "calendario";
  const month = isMonth(params.mes) ? params.mes : today.slice(0, 7);
  const range = gridRange(month);

  const scope = { companyId: params.empresa, assigneeId: params.responsavel };

  const [items, options, companyRows, peopleRows, stages, running, monthItems, noDueDate] =
    await Promise.all([
    // O calendário busca pela faixa do mês; a lista, pelo limite de página.
    isCalendar
      ? Promise.resolve([])
      : listWorkItems(user, {
          ...scope,
          // No quadro, a coluna de concluído precisa existir com conteúdo.
          includeDone: isBoard || params.concluidas === "1",
        }),
    quickCreateOptions(user),
    user.companyIds.length
      ? db
          .select({ id: companies.id, name: companies.name, parentId: companies.parentId })
          .from(companies)
          .where(inArray(companies.id, user.companyIds))
          .orderBy(asc(companies.name))
      : Promise.resolve([]),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, user.orgId), eq(users.isActive, true)))
      .orderBy(asc(users.name)),
    stagesFor(user.orgId, "task"),
    runningTimer(user.id),
    isCalendar ? listInRange(user, scope, range.from, range.to) : Promise.resolve([]),
    isCalendar ? countWithoutDueDate(user, scope) : Promise.resolve(0),
  ]);

  const runningItemId = running?.workItemId ?? null;

  const filtered = Boolean(params.empresa || params.responsavel || params.concluidas);
  const taskItems = items.filter((i) => i.type === "task");
  const visible = isBoard ? taskItems : items;

  return (
    <>
      <PageHeader
        title="Trabalho"
        description="Tudo que existe, em um lugar só."
        actions={
          <>
            <Suspense fallback={<div className="h-8 w-[152px]" />}>
              <ViewSwitch />
            </Suspense>
            <QuickCreate
            options={{
              companies: options.companies,
              projects: options.projects,
              people: options.people,
            }}
            meId={user.id}
            today={today}
          />
          </>
        }
      />

      <Suspense fallback={<div className="h-[53px] border-b border-line" />}>
        <Filters companies={companyRows} people={peopleRows} meId={user.id} />
      </Suspense>

      <div className="px-5 py-5 md:px-7">
        {visible.length === 0 && !isCalendar ? (
          <EmptyState
            title={filtered ? "Nada com esses filtros" : "Nenhuma tarefa ainda"}
            description={
              filtered
                ? "Tente afrouxar os filtros ou limpar tudo."
                : "Pressione C de qualquer tela para criar a primeira."
            }
          />
        ) : isBoard ? (
          <Board stages={stages} items={taskItems} today={today} />
        ) : isCalendar ? (
          <Calendar
            month={month}
            today={today}
            withoutDueDate={noDueDate}
            items={monthItems.map((item) => ({
              id: item.id,
              title: item.title,
              day: inputFromDueDate(item.dueDate),
              companyColor: item.companyColor,
              priority: item.priority,
              done: Boolean(item.completedAt),
              assigneeName: item.assigneeName,
            }))}
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {visible.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  today={today}
                  showAssignee
                  runningItemId={runningItemId}
                />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-faint">
              <span className="tnum">{visible.length}</span>{" "}
              {visible.length === 1 ? "tarefa" : "tarefas"}
              {visible.length === 300 ? " (limite da página)" : ""}
            </p>
          </>
        )}
      </div>

      {params.item ? (
        <ItemPanel user={user} id={params.item} today={today} />
      ) : null}
    </>
  );
}
