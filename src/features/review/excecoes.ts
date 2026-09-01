import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, users, workItems } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { addDays, brtToday, startOfBrtDay } from "@/lib/date";
import { rotuloMotivo } from "@/lib/excecao";

/**
 * O termômetro da exceção.
 *
 * A porcentagem é o número que importa, e o que ela mede não é a pessoa. Se ela
 * subir muito, ou o time achou um atalho, ou a esteira está pedindo revisão de
 * coisa que não precisa — nos dois casos quem muda é o processo. Por isso a
 * quebra por pessoa existe: para achar o padrão, não para cobrar alguém.
 *
 * O motivo "Outro" sai listado inteiro, com a justificativa escrita. Se ele for
 * o mais usado, falta um item na lista fechada — e a lista precisa ganhar um
 * item novo, não a pessoa precisa de treinamento.
 *
 * **O recorte é uma coorte só: tarefas abertas no período.** Contar as marcadas
 * pela data da marcação e o total pela data de abertura misturaria dois
 * conjuntos, e a divisão de um pelo outro poderia passar de 100% num mês em que
 * alguém marcasse tarefa antiga — um número impossível na tela vale menos que
 * um número modesto.
 */

export type Excecoes = {
  days: number;
  /** Tarefas abertas no período. É o denominador. */
  base: number;
  marcadas: number;
  /** Quantas foram marcadas pelo líder depois de a esteira ter começado. */
  aprovacaoDeExcecao: number;
  porPessoa: Array<{ nome: string; n: number }>;
  porEmpresa: Array<{ nome: string; n: number }>;
  porMotivo: Array<{ motivo: string; n: number }>;
  /** As que usaram "Outro", com a justificativa por extenso. */
  outros: Array<{
    id: string;
    titulo: string;
    empresa: string;
    pessoa: string | null;
    quando: Date | null;
    justificativa: string | null;
  }>;
};

export async function loadExcecoes(
  user: CurrentUser,
  options: { days: number; companyId: string | null },
): Promise<Excecoes> {
  const since = startOfBrtDay(addDays(brtToday(), -options.days));
  const reach = options.companyId ? [options.companyId] : user.companyIds;

  const vazio: Excecoes = {
    days: options.days,
    base: 0,
    marcadas: 0,
    aprovacaoDeExcecao: 0,
    porPessoa: [],
    porEmpresa: [],
    porMotivo: [],
    outros: [],
  };

  if (reach.length === 0) return vazio;

  /*
   * Só tarefa de verdade entra na conta. Subtarefa não anda na esteira — somar
   * as duas inflaria o denominador com trabalho que nunca precisou de revisão,
   * e a porcentagem ficaria confortável por construção.
   */
  const doPeriodo = and(
    eq(workItems.orgId, user.orgId),
    inArray(workItems.companyId, reach),
    eq(workItems.type, "task"),
    sql`${workItems.parentId} is null`,
    gte(workItems.createdAt, since),
  );

  const [contagem] = await db
    .select({
      base: sql<number>`count(*)::int`,
      marcadas: sql<number>`count(*) filter (where ${workItems.reviewExempt})::int`,
      porExcecao: sql<number>`count(*) filter (where ${workItems.reviewExemptKind} = 'aprovacao_excecao')::int`,
    })
    .from(workItems)
    .where(doPeriodo);

  if (!contagem || contagem.base === 0) return vazio;

  const marcadas = and(doPeriodo, eq(workItems.reviewExempt, true));

  const [porPessoa, porEmpresa, porMotivo, outros] = await Promise.all([
    db
      .select({ nome: users.name, n: sql<number>`count(*)::int` })
      .from(workItems)
      .leftJoin(users, eq(users.id, workItems.reviewExemptById))
      .where(marcadas)
      .groupBy(users.name)
      .orderBy(desc(sql`count(*)`)),

    db
      .select({ nome: companies.name, n: sql<number>`count(*)::int` })
      .from(workItems)
      .innerJoin(companies, eq(companies.id, workItems.companyId))
      .where(marcadas)
      .groupBy(companies.name)
      .orderBy(desc(sql`count(*)`)),

    db
      .select({ motivo: workItems.reviewExemptReason, n: sql<number>`count(*)::int` })
      .from(workItems)
      .where(marcadas)
      .groupBy(workItems.reviewExemptReason)
      .orderBy(desc(sql`count(*)`)),

    db
      .select({
        id: workItems.id,
        titulo: workItems.title,
        empresa: companies.name,
        pessoa: users.name,
        quando: workItems.reviewExemptAt,
        justificativa: workItems.reviewExemptNote,
      })
      .from(workItems)
      .innerJoin(companies, eq(companies.id, workItems.companyId))
      .leftJoin(users, eq(users.id, workItems.reviewExemptById))
      .where(and(marcadas, eq(workItems.reviewExemptReason, "outro"), isNotNull(workItems.id)))
      .orderBy(desc(workItems.reviewExemptAt)),
  ]);

  return {
    days: options.days,
    base: contagem.base,
    marcadas: contagem.marcadas,
    aprovacaoDeExcecao: contagem.porExcecao,
    porPessoa: porPessoa.map((linha) => ({ nome: linha.nome ?? "sem autor", n: linha.n })),
    porEmpresa,
    porMotivo: porMotivo.map((linha) => ({ motivo: rotuloMotivo(linha.motivo), n: linha.n })),
    outros,
  };
}
