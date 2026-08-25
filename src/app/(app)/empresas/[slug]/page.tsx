import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, users } from "@/db/schema";
import { canManage, canSeeCompany, requireUser } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/page-header";
import { NewProject } from "./new-project";
import { RequestLink } from "@/features/requests/request-link";

function formatDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();

  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.orgId, user.orgId), eq(companies.slug, slug)))
    .limit(1);

  if (!company || !canSeeCompany(user, company.id)) notFound();

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      dueDate: projects.dueDate,
      ownerName: users.name,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(and(eq(projects.companyId, company.id), eq(projects.isArchived, false)))
    .orderBy(asc(projects.name));

  const manage = canManage(user);

  return (
    <>
      <PageHeader
        title={company.name}
        description="Projetos ativos desta empresa."
        actions={manage ? <NewProject companyId={company.id} /> : undefined}
      />

      <div className="flex flex-col gap-5 px-5 py-5 md:px-7">
        <RequestLink slug={company.slug} />

        {rows.length === 0 ? (
          <EmptyState
            title="Nenhum projeto ativo"
            description={
              manage
                ? "Projetos agrupam as tarefas de uma frente de trabalho: uma campanha, um contrato, um lançamento."
                : "Ninguém criou projetos para esta empresa ainda."
            }
          />
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {rows.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{p.name}</span>
                {p.ownerName ? (
                  <span className="hidden text-[12.5px] text-muted sm:inline">{p.ownerName}</span>
                ) : null}
                {p.dueDate ? (
                  <span className="tnum text-[12.5px] text-faint">{formatDate(p.dueDate)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
