import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects } from "@/db/schema";

export type CompanyChoice = { id: string; name: string; group: string | null };

export type RequestScope = {
  /** Nome no cabecalho. Nulo quando o formulario e o geral, de todas. */
  title: string | null;
  companies: CompanyChoice[];
  projects: Array<{ id: string; name: string; companyId: string }>;
};

/**
 * O que o formulario publico pode oferecer.
 *
 * Sem slug e o formulario geral: todas as empresas ativas, cada sub-marca
 * agrupada sob a mae. Com slug, so aquela empresa e as filhas dela — serve
 * para quem quer mandar um link ja recortado.
 */
export async function loadScope(slug: string | null): Promise<RequestScope | null> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      parentId: companies.parentId,
    })
    .from(companies)
    .where(eq(companies.isActive, true))
    .orderBy(asc(companies.name));

  if (rows.length === 0) return null;

  const nameById = new Map(rows.map((c) => [c.id, c.name]));
  let visible = rows;
  let title: string | null = null;

  if (slug) {
    const root = rows.find((c) => c.slug === slug);
    if (!root) return null;
    visible = rows.filter((c) => c.id === root.id || c.parentId === root.id);
    title = root.name;
  }

  // Mae primeiro, filhas logo abaixo dela. Alfabetico dentro de cada nivel.
  const parents = visible.filter((c) => !c.parentId || !visible.some((p) => p.id === c.parentId));
  const choices: CompanyChoice[] = [];

  for (const parent of parents) {
    choices.push({ id: parent.id, name: parent.name, group: null });
    for (const child of visible.filter((c) => c.parentId === parent.id)) {
      choices.push({ id: child.id, name: child.name, group: parent.name });
    }
  }

  // Filha cuja mae ficou de fora do recorte ainda precisa aparecer.
  for (const row of visible) {
    if (choices.some((c) => c.id === row.id)) continue;
    choices.push({
      id: row.id,
      name: row.name,
      group: row.parentId ? (nameById.get(row.parentId) ?? null) : null,
    });
  }

  const list = await db
    .select({ id: projects.id, name: projects.name, companyId: projects.companyId })
    .from(projects)
    .where(
      and(
        inArray(
          projects.companyId,
          choices.map((c) => c.id),
        ),
        eq(projects.isArchived, false),
      ),
    )
    .orderBy(asc(projects.name));

  return { title, companies: choices, projects: list };
}
