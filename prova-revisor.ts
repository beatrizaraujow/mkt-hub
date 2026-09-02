/** Descartavel: o revisor com as 50 regras, ate a porta do modelo. */
import { and, eq } from "drizzle-orm";
import { client, db } from "./src/db/index";
import { companies, workItemStages, workItems } from "./src/db/schema";
import { runGate } from "./src/features/review/gate";
import { assemble } from "./src/features/review/judge";

/**
 * Uma peca do Carbone Club escrita com os erros que o manual proibe — do jeito
 * que um designer que nao decorou as regras escreveria de boa-fe.
 *
 * Viola de proposito: exclamacao, escassez, preco aberto, CTA de compra,
 * vocabulario de formacao ("mentoria", "turma", "inscricao"), o metodo da
 * Academy no lugar do PRISMA, e produto da Academy anunciado como do Club.
 */
const COPY = `Chegou a hora da sua mesa!

Últimas vagas para a nova turma da mentoria Carbone Club. O lote 1 encerra
sexta e restam apenas 4 lugares — não perca.

No FORJA você vai aprender a vender mais, gerar negócios e fechar parcerias
com os maiores empresários do estado. Inclui acesso ao Academy Class e ao
After Class.

Investimento: 12x R$1.297. Garanta sua vaga agora e faça sua inscrição pelo
link da bio!`;

async function main() {
  const [club] = await db.select().from(companies).where(eq(companies.name, "Carbone Club")).limit(1);
  const [etapa] = await db
    .select()
    .from(workItemStages)
    .where(and(eq(workItemStages.type, "task"), eq(workItemStages.slug, "em_andamento")))
    .limit(1);

  const [peca] = await db
    .insert(workItems)
    .values({
      orgId: club.orgId,
      companyId: club.id,
      stageId: etapa.id,
      title: "[prova] Estático Club · convite para a mesa",
      skill: "Arte de post",
      format: "Estático",
      copy: COPY,
    })
    .returning();

  console.log("peca:", peca.title, "·", "Carbone Club · Arte de post · Estático\n");

  /* ------------------------------------------------------------ porteiro */

  const porteiro = await runGate(peca.id);
  console.log("PORTEIRO:", porteiro.ok ? `liberou · ${porteiro.ruleCount} regras · copy de ${porteiro.copyLength} caracteres` : "barrou");
  if (!porteiro.ok) for (const p of porteiro.pending) console.log("   ·", p.text);

  /* -------------------------------------------------- o pedido ao modelo */

  const montado = await assemble(peca, club.name);
  if ("error" in montado) {
    console.log("\nNAO MONTOU:", montado.error);
  } else {
    console.log(`\nREGRAS QUE IRIAM AO MODELO: ${montado.rules.length}`);
    console.log(`SOBREPOSICOES RESOLVIDAS: ${montado.overlaps.length}\n`);

    const porGrupo = new Map<string, string[]>();
    for (const r of montado.rules) {
      const g = (r.rationale ?? "").slice(6, 7) || "?";
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), r.code]);
    }
    for (const [g, codigos] of [...porGrupo].sort()) {
      console.log(`  grupo ${g}: ${codigos.length}`);
    }

    /* As que disputam o mesmo defeito, para ver se todas foram junto. */
    const tema = (t: string, chaves: string[]) => {
      const hits = montado.rules.filter((r) =>
        chaves.some((k) => (r.text + " " + (r.machineHint ?? "")).toLowerCase().includes(k)),
      );
      console.log(`\n  "${t}" — ${hits.length} regras no mesmo pedido:`);
      for (const h of hits) console.log(`     ${h.isBlocking ? "reprova " : "ressalva"} ${h.code}`);
    };

    tema("preço aberto", ["preço", "preco", "r$"]);
    tema("escassez / lote", ["lote", "vagas", "escassez", "urgência"]);
    tema("fundo claro / letra pequena", ["fundo claro", "letra pequena", "contraste"]);

    console.log(`\nTAMANHO DO PEDIDO: ${montado.briefing.length} caracteres`);
    console.log(`IMPRESSAO DIGITAL: ${montado.hash.slice(0, 16)}`);
  }

  await db.delete(workItems).where(eq(workItems.id, peca.id));
  console.log("\npeca de prova apagada.");
}

main()
  .then(() => client.end())
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
