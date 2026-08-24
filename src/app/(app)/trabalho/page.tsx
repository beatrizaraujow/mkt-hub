import type { Metadata } from "next";
import { Suspense } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { brtToday } from "@/lib/date";
import { EmptyState, PageHeader } from "@/components/page-header";
import { listWorkItems, quickCreateOptions } from "@/features/work-items/queries";
import { ItemRow } from "@/features/work-items/item-row";
import { QuickCreate } from "@/features/work-items/quick-create";
import { Filters } from "./filters";

export const metadata: Metadata = { title: "Trabalho · MKT Hub" };

export default async function TrabalhoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; responsavel?: string; concluidas?: string }>;
}) {
  const user = await requireUser();
  const filters = await searchParams;
  const today = brtToday();

  const [items, options, companyRows, peopleRows] = await Promise.all([
    listWorkItems(user, {
      companyId: filters.empresa,
      assigneeId: filters.responsavel,
      includeDone: filters.concluidas === "1",
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
  ]);

  const filtered = Boolean(filters.empresa || filters.responsavel || filters.concluidas);

  return (
    <>
      <PageHeader
        title="Trabalho"
        description="Tudo que existe, em um lugar só."
        actions={
          <QuickCreate
            options={{
              companies: options.companies,
              projects: options.projects,
              people: options.people,
            }}
          />
        }
      />

      <Suspense fallback={<div className="h-[53px] border-b border-line" />}>
        <Filters companies={companyRows} people={peopleRows} meId={user.id} />
      </Suspense>

      <div className="px-5 py-5 md:px-7">
        {items.length === 0 ? (
          <EmptyState
            title={filtered ? "Nada com esses filtros" : "Nenhuma tarefa ainda"}
            description={
              filtered
                ? "Tente afrouxar os filtros ou limpar tudo."
                : "Pressione C de qualquer tela para criar a primeira."
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} today={today} showAssignee />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-faint">
              <span className="tnum">{items.length}</span>{" "}
              {items.length === 1 ? "tarefa" : "tarefas"}
              {items.length === 300 ? " (limite da página)" : ""}
            </p>
          </>
        )}
      </div>
    </>
  );
}
