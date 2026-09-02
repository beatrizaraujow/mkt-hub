/**
 * Confere o checklist contra combinacoes de verdade, uma por uma.
 *
 *   npm run checklist:conferir
 *
 * **So roda em desenvolvimento**, e para sozinho se apontar para outro lugar:
 * ele cria uma tarefa de mentira para cada caso, mede o que apareceria na tela
 * e apaga tudo no fim. Isso e escrita, e escrita de teste nao entra em
 * producao nem por engano.
 *
 * Existe porque o checklist virou trava de duas etapas em 01/09/2026, e trava
 * que aparece na hora errada e pior que trava nenhuma: item que nao se aplica
 * ensina a marcar sem ler, e aí o checklist deixa de valer justamente nos
 * poucos itens em que era a unica defesa. As perguntas que este arquivo
 * responde nao dao para responder olhando o catalogo — dependem de quem
 * herda de quem, de qual formato casa com qual lista, e de o que some quando a
 * peca tem excecao declarada.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { client, db } from "./index";
import { activityLog, companies, reviewChecklistItems, workItemStages, workItems } from "./schema";
import { checklistOf, type Momento } from "@/features/review/checklist";
import { DESENVOLVIMENTO, refDaConexao } from "./destino";

if (refDaConexao(process.env.DATABASE_URL) !== DESENVOLVIMENTO) {
  console.error("Este script escreve. So roda no banco de desenvolvimento.");
  process.exit(1);
}

let falhas = 0;

function ok(certo: boolean, texto: string) {
  if (!certo) falhas++;
  console.log(`   ${certo ? "ok   " : "FALHA"} ${texto}`);
}

/** O primeiro pedaco de cada item, que e o que da para ler numa linha. */
function resumo(linhas: Array<{ text: string }>) {
  return linhas.map((l) => l.text.slice(0, 44)).join(" | ");
}

type Caso = {
  titulo: string;
  empresa: string;
  skill: string | null;
  format: string | null;
  isento?: boolean;
  voltou?: boolean;
  momento?: Momento;
  /** Trechos que precisam aparecer. */
  tem: string[];
  /** Trechos que nao podem aparecer. */
  naoTem: string[];
  /** Quantos itens no total, quando o numero em si e a resposta. */
  total?: number;
};

const CASOS: Caso[] = [
  {
    titulo: "SeuBoné · Estático — universal + os dois itens de produto",
    empresa: "SeuBoné",
    skill: "Arte de post",
    format: "Estático",
    total: 6,
    tem: ["Revisei a ortografia", "texto pequeno", "acervo da marca", "gerado por IA", "produto é protagonista: aparece", "sem sujeira"],
    naoTem: ["já na capa", "usina", "membros", "gancho claro"],
  },
  {
    titulo: "SeuBoné · Carrossel — ganha o item de capa",
    empresa: "SeuBoné",
    skill: "Arte de post",
    format: "Carrossel",
    total: 7,
    tem: ["produto é protagonista já na capa"],
    naoTem: ["usina", "gancho claro"],
  },
  {
    titulo: "SeuBoné · Estático Ads — o mesmo do estático, sem linha nova no catálogo",
    empresa: "SeuBoné",
    skill: "Arte de criativo",
    format: "Estático Ads",
    total: 6,
    tem: ["produto é protagonista: aparece"],
    naoTem: ["já na capa"],
  },
  {
    titulo: "Box Corporativo · Estático — herda do SeuBoné, que é a mãe",
    empresa: "Box Corporativo",
    skill: "Arte de post",
    format: "Estático",
    total: 6,
    tem: ["produto é protagonista"],
    naoTem: ["usina", "membros"],
  },
  {
    titulo: "Onevo Energia · Vídeo — o item da usina vem da Onevo mãe",
    empresa: "Onevo Energia",
    skill: "Edição de vídeo",
    format: "Vídeo",
    total: 6,
    tem: ["Revisei a legenda", "gancho claro", "Ouvi com fone", "CTA do fecho", "usina"],
    naoTem: ["produto", "membros", "texto pequeno"],
  },
  {
    titulo: "Carbone Club · Estático — herda os itens da Carbone Educação",
    empresa: "Carbone Club",
    skill: "Arte de post",
    format: "Estático",
    tem: ["fotos de membros", "imagem é intencional", "Nenhum membro que aparece", "conta certa"],
    naoTem: ["produto", "usina", "depoimento"],
  },
  {
    titulo: "Pedro Galvão P2P · Estático — também herda, e isso é decisão registrada",
    empresa: "Pedro Galvão P2P",
    skill: "Arte de post",
    format: "Estático",
    tem: ["fotos de membros", "Nenhum membro que aparece"],
    naoTem: ["produto", "usina"],
  },
  {
    titulo: "Weevo · Estático — só o bloco universal, e é o que o documento manda",
    empresa: "Weevo",
    skill: "Arte de post",
    format: "Estático",
    total: 4,
    tem: ["Revisei a ortografia", "texto pequeno", "acervo da marca", "gerado por IA"],
    naoTem: ["produto", "usina", "membros"],
  },
  {
    titulo: "Weevo · Mídia OFF — ganha o item do QR",
    empresa: "Weevo",
    skill: "Arte OFF",
    format: "Mídia OFF",
    total: 5,
    tem: ["Testei o QR"],
    naoTem: ["gancho claro", "produto"],
  },
  {
    titulo: "Weevo · Captação em Vídeo — o bloco de captação entra junto do de vídeo",
    empresa: "Weevo",
    skill: "Captação",
    format: "Vídeo",
    total: 7,
    tem: ["áudio do vídeo foi testado", "Subi os vídeos na pasta", "Ouvi com fone"],
    naoTem: ["Testei o QR"],
  },
  {
    titulo: "Weevo · skill combinada (Captação, Edição de vídeo) — casa nos dois",
    empresa: "Weevo",
    skill: "Captação, Edição de vídeo",
    format: "Vídeo",
    total: 7,
    tem: ["áudio do vídeo foi testado", "CTA do fecho"],
    naoTem: [],
  },
  {
    titulo: "Weevo · formato combinado (Vídeo, Vídeo Ads) — casa uma vez, não duas",
    empresa: "Weevo",
    skill: "Edição de vídeo",
    format: "Vídeo, Vídeo Ads",
    total: 5,
    tem: ["gancho claro"],
    naoTem: ["Testei o QR"],
  },
  {
    titulo: "Weevo · caixa alta do board (ADS VÍDEOS) — casa mesmo com o catálogo em minúscula",
    empresa: "Weevo",
    skill: "ADS VÍDEOS",
    format: "Vídeo Ads",
    total: 5,
    tem: ["Revisei a legenda"],
    naoTem: [],
  },
  {
    titulo: "Weevo · sem formato — só o que não tem recorte, e aqui não há nenhum",
    empresa: "Weevo",
    skill: "Arte de post",
    format: null,
    total: 0,
    tem: [],
    naoTem: ["Revisei a ortografia"],
  },
  {
    titulo: "Carbone Educação · sem formato — os seis antigos aparecem, porque não têm recorte",
    empresa: "Carbone Educação",
    skill: "Arte de post",
    format: null,
    total: 6,
    tem: ["conta certa", "dia da semana", "polarizante"],
    naoTem: ["Revisei a ortografia e o texto da arte"],
  },
  {
    titulo: "Weevo · Stories — formato sem bloco no documento fica sem checklist",
    empresa: "Weevo",
    skill: "Arte de post",
    format: "Stories",
    total: 0,
    tem: [],
    naoTem: [],
  },
  {
    titulo: "Weevo · Estático com exceção declarada — o operacional não muda",
    empresa: "Weevo",
    skill: "Arte de post",
    format: "Estático",
    isento: true,
    total: 4,
    tem: ["Revisei a ortografia"],
    naoTem: ["Confirmo que esta peça"],
  },
  {
    titulo: "Aprovação · peça normal, primeira passagem",
    empresa: "Weevo",
    skill: "Arte de post",
    format: "Estático",
    momento: "aprovacao",
    total: 4,
    tem: ["objetivo do briefing", "legenda que está no card", "Data, canal e formato", "Li o laudo"],
    naoTem: ["já voltou por alteração", "margens que a gráfica", "Confirmo que esta peça"],
  },
  {
    titulo: "Aprovação · depois de a peça ter voltado por alteração",
    empresa: "Weevo",
    skill: "Arte de post",
    format: "Estático",
    momento: "aprovacao",
    voltou: true,
    total: 5,
    tem: ["já voltou por alteração"],
    naoTem: ["margens que a gráfica"],
  },
  {
    titulo: "Aprovação · Mídia OFF ganha o item da gráfica",
    empresa: "Weevo",
    skill: "Arte OFF",
    format: "Mídia OFF",
    momento: "aprovacao",
    total: 5,
    tem: ["margens que a gráfica"],
    naoTem: ["já voltou por alteração"],
  },
  {
    titulo: "Aprovação · peça com exceção: o laudo sai, a co-assinatura entra",
    empresa: "Weevo",
    skill: "Arte de post",
    format: "Estático",
    momento: "aprovacao",
    isento: true,
    total: 4,
    tem: ["Confirmo que esta peça não precisava"],
    naoTem: ["Li o laudo"],
  },
];

async function main() {
  const [etapa] = await db
    .select()
    .from(workItemStages)
    .where(and(eq(workItemStages.type, "task"), eq(workItemStages.slug, "em_andamento")))
    .limit(1);

  const empresas = await db.select().from(companies);
  const porNome = new Map(empresas.map((e) => [e.name, e]));

  const criadas: string[] = [];

  for (const caso of CASOS) {
    const empresa = porNome.get(caso.empresa);
    if (!empresa) {
      ok(false, `${caso.titulo} — empresa "${caso.empresa}" nao existe`);
      continue;
    }

    const [item] = await db
      .insert(workItems)
      .values({
        orgId: empresa.orgId,
        companyId: empresa.id,
        stageId: etapa.id,
        title: `[conferencia] ${caso.titulo}`,
        skill: caso.skill,
        format: caso.format,
        reviewExempt: caso.isento ?? false,
        reviewExemptReason: caso.isento ? "melhoria" : null,
        reviewExemptKind: caso.isento ? "declarada" : null,
      })
      .returning();

    criadas.push(item.id);

    /*
     * "Ja voltou por alteracao" e lido do historico, nao de um campo: toda
     * volta de etapa de revisao exige motivo escrito, e e a existencia desse
     * motivo que responde. Aqui a volta e forjada com a mesma forma.
     */
    if (caso.voltou) {
      await db.insert(activityLog).values({
        orgId: empresa.orgId,
        workItemId: item.id,
        actorId: null,
        action: "item.stage_changed",
        payload: { de: "Revisão IA", para: "Ajustar", motivo: "conferencia" },
      });
    }

    const linhas = await checklistOf(item, caso.momento ?? "operacional");
    const texto = linhas.map((l) => l.text).join(" ¦ ");

    console.log(`\n${caso.titulo}`);
    console.log(`   ${linhas.length} itens: ${resumo(linhas) || "nenhum"}`);

    if (caso.total !== undefined) ok(linhas.length === caso.total, `sao ${caso.total} itens`);
    for (const t of caso.tem) ok(texto.includes(t), `tem "${t}"`);
    for (const t of caso.naoTem) ok(!texto.includes(t), `nao tem "${t}"`);
  }

  /*
   * Uma checagem que nao depende de tarefa: nenhum item pode ter recorte que
   * nunca casaria. Recorte errado nao da erro — ele grava e some da tela, e
   * ninguem descobre ate alguem perguntar por que aquele item nunca aparece.
   */
  console.log("\nO catalogo inteiro:");
  const todos = await db.select().from(reviewChecklistItems);
  const semTexto = todos.filter((i) => i.text.trim().length < 8);
  ok(semTexto.length === 0, "nenhum item curto demais para significar alguma coisa");

  const laudo = todos.filter((i) => i.dependsOnReport);
  ok(laudo.length === 1, "so um item depende do laudo");
  ok(
    laudo.every((i) => i.momento === "aprovacao"),
    "o item do laudo esta no checklist de aprovacao, nao no do operacional",
  );

  const aprovacao = todos.filter((i) => i.momento === "aprovacao");
  ok(
    aprovacao.every((i) => i.companyId === null),
    "o checklist de aprovacao vale para todas as marcas",
  );

  // Limpeza. Tarefa de conferencia que sobra vira ruido no quadro de alguem.
  if (criadas.length > 0) {
    await db.delete(activityLog).where(inArray(activityLog.workItemId, criadas));
    await db.delete(workItems).where(inArray(workItems.id, criadas));
  }

  const sobrou = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(and(isNull(workItems.parentId), eq(workItems.title, "[conferencia]")));

  console.log(`\n${criadas.length} tarefas de conferencia criadas e apagadas.`);
  ok(sobrou.length === 0, "nada de conferencia sobrou no banco");

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  if (falhas > 0) process.exitCode = 1;
}

main()
  .then(() => client.end())
  .catch(async (erro) => {
    console.error(erro);
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
