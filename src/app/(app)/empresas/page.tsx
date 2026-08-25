import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/page-header";
import { NewCompany } from "./new-company";
import { RequestLink } from "@/features/requests/request-link";

export const metadata: Metadata = { title: "Empresas · MKT Hub" };

type Row = {
  id: string;
  name: string;
  slug: string;
  color: string;
  parentId: string | null;
  projectCount: number;
};

function plural(n: number) {
  return `${n} ${n === 1 ? "projeto" : "projetos"}`;
}

function CompanyLink({
  company,
  total,
  nested = false,
}: {
  company: Row;
  total: number;
  nested?: boolean;
}) {
  return (
    <Link
      href={`/empresas/${company.slug}`}
      className={
        nested
          ? "flex items-center gap-3 py-2 pl-11 pr-4 transition-colors duration-150 hover:bg-hover"
          : "flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-hover"
      }
    >
      <span
        aria-hidden
        style={{ background: company.color }}
        className={nested ? "h-1.5 w-1.5 shrink-0 rounded-full" : "h-2.5 w-2.5 shrink-0 rounded-full"}
      />
      <span
        className={
          nested
            ? "min-w-0 flex-1 truncate text-[13.5px] text-muted"
            : "min-w-0 flex-1 truncate text-[14px] font-medium text-ink"
        }
      >
        {company.name}
      </span>
      <span className="tnum text-[12.5px] text-faint">{plural(total)}</span>
    </Link>
  );
}

export default async function EmpresasPage() {
  const user = await requireUser();
  const manage = canManage(user);

  const rows: Row[] = user.companyIds.length
    ? await db
        .select({
          id: companies.id,
          name: companies.name,
          slug: companies.slug,
          color: companies.color,
          parentId: companies.parentId,
          projectCount: count(projects.id),
        })
        .from(companies)
        .leftJoin(
          projects,
          and(eq(projects.companyId, companies.id), eq(projects.isArchived, false)),
        )
        .where(inArray(companies.id, user.companyIds))
        .groupBy(companies.id)
        .orderBy(companies.name)
    : [];

  const parents = rows.filter((c) => !c.parentId);
  const childrenOf = (id: string) => rows.filter((c) => c.parentId === id);

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Cada empresa reúne suas marcas, projetos, equipe, metas e arquivos."
        actions={manage ? <NewCompany /> : undefined}
      />

      <div className="flex flex-col gap-5 px-5 py-5 md:px-7">
        <RequestLink label="Link para quem pede demanda" />

        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma empresa por aqui"
            description={
              manage
                ? "Crie a primeira empresa para começar a organizar projetos e tarefas."
                : "Você ainda não tem acesso a nenhuma empresa. Fale com quem administra o sistema."
            }
          />
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {parents.map((parent) => {
              const subs = childrenOf(parent.id);
              const total =
                parent.projectCount + subs.reduce((sum, s) => sum + s.projectCount, 0);

              return (
                <li key={parent.id} className="border-b border-line last:border-b-0">
                  <CompanyLink company={parent} total={total} />
                  {subs.length > 0 && (
                    <ul className="border-t border-line/60 pb-1">
                      {subs.map((sub) => (
                        <li key={sub.id}>
                          <CompanyLink company={sub} total={sub.projectCount} nested />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
