import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects } from "@/db/schema";
import { brtToday } from "@/lib/date";
import { RequestForm } from "@/features/requests/request-form";

/**
 * Pagina sem login. Quem pede a demanda nao e do time — se precisasse de
 * conta, ninguem preencheria e o pedido voltaria para o WhatsApp.
 *
 * O link e por empresa: `/solicitar/carbone-educacao`. Quem tem o link
 * consegue abrir um pedido naquela empresa e mais nada — nao ve tarefa, nao
 * ve pessoa, nao ve o que ja foi pedido.
 */
export const dynamic = "force-dynamic";

async function loadCompany(slug: string) {
  const [root] = await db
    .select({ id: companies.id, name: companies.name, orgId: companies.orgId })
    .from(companies)
    .where(and(eq(companies.slug, slug), eq(companies.isActive, true)))
    .limit(1);

  if (!root) return null;

  // A raiz mais as sub-marcas dela: Onevo abre para Energia e Investimentos.
  const options = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(
      and(
        eq(companies.orgId, root.orgId),
        eq(companies.isActive, true),
        or(eq(companies.id, root.id), eq(companies.parentId, root.id)),
      ),
    )
    .orderBy(asc(companies.name));

  const list = await db
    .select({ id: projects.id, name: projects.name, companyId: projects.companyId })
    .from(projects)
    .where(
      and(
        inArray(
          projects.companyId,
          options.map((c) => c.id),
        ),
        eq(projects.isArchived, false),
      ),
    )
    .orderBy(asc(projects.name));

  return { root, options, projects: list };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadCompany(slug);
  return {
    title: data ? `Pedir para o marketing · ${data.root.name}` : "Pedido de marketing",
    robots: { index: false, follow: false },
  };
}

export default async function RequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadCompany(slug);
  if (!data) notFound();

  // A raiz primeiro; ela e a escolha certa na maioria dos pedidos.
  const ordered = [
    ...data.options.filter((c) => c.id === data.root.id),
    ...data.options.filter((c) => c.id !== data.root.id),
  ];

  return (
    <main className="mx-auto w-full max-w-[680px] px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="label-mono mb-2">{data.root.name}</p>
        <h1 className="font-display text-[27px] font-semibold leading-tight text-ink">
          Pedir para o marketing
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          Preencha o que der. Quanto mais claro o objetivo, menos idas e voltas depois — e mais
          rápido sai.
        </p>
      </header>

      <RequestForm
        today={brtToday()}
        data={{
          slug,
          rootName: data.root.name,
          companies: ordered,
          projects: data.projects,
        }}
      />

      <p className="mt-10 text-center text-[12px] text-faint">MKT Hub · Grupo SB</p>
    </main>
  );
}
