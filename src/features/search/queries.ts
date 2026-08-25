import "server-only";
import { and, desc, eq, inArray, or, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, users, workItemStages, workItems } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { PG_ACCENTED, PG_PLAIN, fold } from "@/lib/fold";
import { EMPTY_RESULTS, MIN_TERM, type SearchResults } from "./types";

/** A dobra de acento do lado do banco. Ver `lib/fold.ts`. */
function folded(column: SQLWrapper) {
  return sql`translate(lower(${column}), ${PG_ACCENTED}, ${PG_PLAIN})`;
}

/**
 * Busca global.
 *
 * `ilike '%termo%'` não usa índice — de propósito. Índice de texto no Postgres
 * quer `pg_trgm` ou `tsvector`, os dois com migration e manutenção, e aqui a
 * tabela tem centenas de linhas por organização. Quando passar de dezenas de
 * milhares, o caminho é trigrama; antes disso seria peso sem ganho.
 *
 * Ao contrário das listas, esta consulta **inclui subtarefa e concluída**:
 * quem busca está procurando algo específico, e esconder o que já terminou é
 * a forma mais rápida de a busca parecer quebrada.
 */
export async function searchEverything(
  user: CurrentUser,
  term: string,
): Promise<SearchResults> {
  const clean = fold(term);
  if (clean.length < MIN_TERM || !user.companyIds.length) return EMPTY_RESULTS;

  const pattern = `%${clean.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const reach = inArray(workItems.companyId, user.companyIds);

  const [items, projectRows, companyRows] = await Promise.all([
    db
      .select({
        id: workItems.id,
        title: workItems.title,
        parentId: workItems.parentId,
        companyName: companies.name,
        companyColor: companies.color,
        projectName: projects.name,
        stageName: workItemStages.name,
        assigneeName: users.name,
        completedAt: workItems.completedAt,
      })
      .from(workItems)
      .innerJoin(workItemStages, eq(workItemStages.id, workItems.stageId))
      .innerJoin(companies, eq(companies.id, workItems.companyId))
      .leftJoin(projects, eq(projects.id, workItems.projectId))
      .leftJoin(users, eq(users.id, workItems.assigneeId))
      .where(
        and(
          eq(workItems.orgId, user.orgId),
          reach,
          or(
            sql`${folded(workItems.title)} like ${pattern}`,
            sql`${folded(workItems.description)} like ${pattern}`,
            sql`${folded(workItems.requesterName)} like ${pattern}`,
          ),
        ),
      )
      // Título antes de descrição: quem digita espera ver o nome primeiro.
      .orderBy(
        sql`case when ${folded(workItems.title)} like ${pattern} then 0 else 1 end`,
        desc(workItems.updatedAt),
      )
      .limit(20),

    db
      .select({
        id: projects.id,
        name: projects.name,
        companyName: companies.name,
        companySlug: companies.slug,
      })
      .from(projects)
      .innerJoin(companies, eq(companies.id, projects.companyId))
      .where(
        and(
          inArray(projects.companyId, user.companyIds),
          eq(projects.isArchived, false),
          sql`${folded(projects.name)} like ${pattern}`,
        ),
      )
      .limit(5),

    db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        color: companies.color,
      })
      .from(companies)
      .where(
        and(
          inArray(companies.id, user.companyIds),
          eq(companies.isActive, true),
          sql`${folded(companies.name)} like ${pattern}`,
        ),
      )
      .limit(5),
  ]);

  // Subtarefa sozinha não diz de onde veio. Busca o nome da mãe num lote só.
  const parentIds = [...new Set(items.map((i) => i.parentId).filter((id): id is string => !!id))];
  const parentTitles = new Map<string, string>();

  if (parentIds.length) {
    const rows = await db
      .select({ id: workItems.id, title: workItems.title })
      .from(workItems)
      .where(inArray(workItems.id, parentIds));
    for (const row of rows) parentTitles.set(row.id, row.title);
  }

  return {
    items: items.map((row) => ({
      id: row.id,
      title: row.title,
      parentTitle: row.parentId ? (parentTitles.get(row.parentId) ?? null) : null,
      companyName: row.companyName,
      companyColor: row.companyColor,
      projectName: row.projectName,
      stageName: row.stageName,
      assigneeName: row.assigneeName,
      done: Boolean(row.completedAt),
    })),
    projects: projectRows,
    companies: companyRows,
  };
}
