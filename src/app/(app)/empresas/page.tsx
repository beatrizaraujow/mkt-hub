import type { Metadata } from "next";
import Link from "next/link";
import { count, eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/page-header";
import { NewCompany } from "./new-company";

export const metadata: Metadata = { title: "Empresas · MKT Hub" };

export default async function EmpresasPage() {
  const user = await requireUser();
  const manage = canManage(user);

  const rows = user.companyIds.length
    ? await db
        .select({
          id: companies.id,
          name: companies.name,
          slug: companies.slug,
          color: companies.color,
          projectCount: count(projects.id),
        })
        .from(companies)
        .leftJoin(projects, and(eq(projects.companyId, companies.id), eq(projects.isArchived, false)))
        .where(inArray(companies.id, user.companyIds))
        .groupBy(companies.id)
        .orderBy(companies.name)
    : [];

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Cada empresa reúne seus projetos, equipe, metas e arquivos."
        actions={manage ? <NewCompany /> : undefined}
      />

      <div className="px-5 py-5 md:px-7">
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
            {rows.map((c) => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/empresas/${c.slug}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-hover"
                >
                  <span
                    aria-hidden
                    style={{ background: c.color }}
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                    {c.name}
                  </span>
                  <span className="tnum text-[12.5px] text-faint">
                    {c.projectCount} {c.projectCount === 1 ? "projeto" : "projetos"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
