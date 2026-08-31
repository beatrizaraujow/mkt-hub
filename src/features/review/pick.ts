import "server-only";
import { and, desc, eq, inArray, isNull, or, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, reviewCycles, workItemStages, workItems } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { PG_ACCENTED, PG_PLAIN, fold } from "@/lib/fold";

/**
 * A escolha da entrega que o revisor vai diagnosticar.
 *
 * Existe porque o `<select>` não escalava: ele listava as 40 tarefas mais
 * recentes numa lista corrida de "Empresa · Título", e a partir de umas trinta
 * opções escolher vira rolar. Pior, o recorte era invisível — não dava para
 * dizer "as de Carbone que estão em revisão" sem ler linha por linha.
 *
 * Aqui a busca é a mesma da busca global (acento dobrado no banco, sem índice
 * de texto: a tabela tem centenas de linhas por organização), e os filtros são
 * os três que a pessoa realmente usa: empresa, etapa e "só as minhas".
 */

export type PickFilters = {
  term?: string;
  companyId?: string | null;
  stageId?: string | null;
  mine?: boolean;
};

export type PickRow = {
  id: string;
  title: string;
  companyName: string;
  projectName: string | null;
  stageName: string;
  /**
   * O estado da última rodada, quando houve alguma. Não é o porteiro: rodar o
   * porteiro por linha custaria uma consulta por resultado, e mostrar
   * "2 pendências" adivinhado a partir das colunas mentiria justamente nos
   * casos em que a regra é que falta.
   */
  last: { status: string; verdict: string | null } | null;
};

export type PickerOptions = {
  companies: Array<{ id: string; name: string }>;
  stages: Array<{ id: string; name: string }>;
};

/** A dobra de acento do lado do banco. Ver `lib/fold.ts`. */
function folded(column: SQLWrapper) {
  return sql`translate(lower(${column}), ${PG_ACCENTED}, ${PG_PLAIN})`;
}

const LIMIT = 24;

export async function pickCandidates(
  user: CurrentUser,
  filters: PickFilters = {},
): Promise<{ rows: PickRow[]; total: number }> {
  if (!user.companyIds.length) return { rows: [], total: 0 };

  const reach =
    filters.companyId && user.companyIds.includes(filters.companyId)
      ? [filters.companyId]
      : user.companyIds;

  const where = [eq(workItems.orgId, user.orgId), inArray(workItems.companyId, reach)];

  const clean = fold(filters.term ?? "");
  if (clean) {
    const pattern = `%${clean.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        sql`${folded(workItems.title)} like ${pattern}`,
        sql`${folded(companies.name)} like ${pattern}`,
      )!,
    );
  }

  if (filters.stageId) where.push(eq(workItems.stageId, filters.stageId));
  if (filters.mine) where.push(eq(workItems.assigneeId, user.id));

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: workItems.id,
        title: workItems.title,
        companyName: companies.name,
        projectName: projects.name,
        stageName: workItemStages.name,
      })
      .from(workItems)
      .innerJoin(companies, eq(companies.id, workItems.companyId))
      .innerJoin(workItemStages, eq(workItemStages.id, workItems.stageId))
      .leftJoin(projects, eq(projects.id, workItems.projectId))
      .where(and(...where))
      .orderBy(desc(workItems.updatedAt))
      .limit(LIMIT),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(workItems)
      .innerJoin(companies, eq(companies.id, workItems.companyId))
      .where(and(...where)),
  ]);

  if (rows.length === 0) return { rows: [], total: counted?.total ?? 0 };

  /**
   * A última rodada de cada entrega, numa consulta só. `distinct on` é do
   * Postgres e resolve o "mais recente por grupo" sem subconsulta correlata.
   */
  const cycles = await db
    .selectDistinctOn([reviewCycles.workItemId], {
      workItemId: reviewCycles.workItemId,
      status: reviewCycles.status,
      verdict: reviewCycles.verdict,
    })
    .from(reviewCycles)
    .where(
      inArray(
        reviewCycles.workItemId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(reviewCycles.workItemId, desc(reviewCycles.round));

  const last = new Map(cycles.map((cycle) => [cycle.workItemId, cycle]));

  return {
    total: counted?.total ?? rows.length,
    rows: rows.map((row) => {
      const own = last.get(row.id);
      return {
        ...row,
        last: own ? { status: own.status, verdict: own.verdict } : null,
      };
    }),
  };
}

/** As empresas que a pessoa alcança e as etapas do pipeline de tarefa. */
export async function pickerOptions(user: CurrentUser): Promise<PickerOptions> {
  if (!user.companyIds.length) return { companies: [], stages: [] };

  const [companyRows, stageRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.orgId, user.orgId), inArray(companies.id, user.companyIds)))
      .orderBy(companies.name),

    db
      .select({ id: workItemStages.id, name: workItemStages.name })
      .from(workItemStages)
      .where(
        and(
          eq(workItemStages.orgId, user.orgId),
          eq(workItemStages.type, "task"),
          isNull(workItemStages.companyId),
        ),
      )
      .orderBy(workItemStages.position),
  ]);

  return { companies: companyRows, stages: stageRows };
}
