/**
 * Traz para o MKT Hub o que ainda esta vivo no board do ClickUp.
 *
 *   npm run clickup:importar               simula, nao escreve
 *   npm run clickup:importar -- --aplicar  escreve
 *
 * **Aponta para desenvolvimento** (le `.env.local`). Para producao, sobrescreva
 * `DATABASE_URL` no ambiente e confira o **usuario** da conexao, nunca o host.
 *
 * A origem e um arquivo JSON extraido do board, e nao a API — de proposito. O
 * import roda uma vez; deixar o script chamando o ClickUp faria dele uma
 * integracao permanente, que e exatamente o que a travessia existe para acabar.
 * Gere o arquivo com a ponte de leitura do `mkt-turbo`:
 *
 *   curl "https://mkt-turbo.vercel.app/api/clickup?recurso=task&include_closed=false&page=N"
 *
 * **Idempotente pelo id do ClickUp**, guardado em `meta.clickupId`. Rodar de
 * novo nao duplica, e a origem de cada tarefa fica registrada — daqui a seis
 * meses alguem vai perguntar de onde veio um cartao sem descricao, e a resposta
 * precisa estar no dado, nao na memoria de quem rodou o script.
 *
 * O que **nao** atravessa, por decisao: as ~150 paradas em `pendente`, muitas
 * vencidas desde junho. Se ainda forem necessarias, alguem pede de novo — e ai
 * nascem com prazo de verdade. Arrastar um cemiterio para o sistema novo
 * destroi o que ele tem de melhor: um quadro em que estar aberto significa
 * alguma coisa.
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { client, db } from "./index";
import { companies, users, workItemStages, workItems } from "./schema";
import { ETAPAS_DE_FIM, NASCE_NO_IMPORT, chave, etapaDe } from "@/features/work-items/clickup-map";

const ORIGEM = process.env.CLICKUP_JSON ?? "./.cu-limpo.json";

/**
 * `pendente` so atravessa com prazo no futuro.
 *
 * Sao duas coisas com o mesmo rotulo. Das 199 pendentes do board, 126 sao
 * calendario ja programado — a serie de catalogo da SeuBone, com prazo ate
 * dezembro de 2027 — e 73 estao vencidas ou sem prazo nenhum, muitas desde
 * junho. Trazer as 73 e arrastar um cemiterio para o sistema novo e destruir o
 * que ele tem de melhor: um quadro em que estar aberto significa alguma coisa.
 * Se ainda forem necessarias, alguem pede de novo, e ai nascem com prazo.
 */
function atravessa(tarefa: Bruta, hoje: string): boolean {
  if (chave(tarefa.status) !== "pendente") return true;
  if (!tarefa.prazo) return false;
  return new Date(Number(tarefa.prazo)).toISOString().slice(0, 10) > hoje;
}

/** O rotulo da "Empresa Tag" do board para o slug daqui. */
const EMPRESA_DE: Record<string, string> = {
  "carbone educação": "carbone-educacao",
  "carbone club": "carbone-club",
  "pedro galvão p2p": "pedro-galvao-p2p",
  weevo: "weevo",
  seuboné: "seubone",
  "box corporativo": "box-corporativo",
  onevo: "onevo",
  "onevo energia": "onevo-energia",
  "onevo investimentos": "onevo-investimentos",
  "cássio maia p2p": "cassio-maia-p2p",
};

/**
 * Empresa que o campo nao diz e o titulo entrega.
 *
 * So entra aqui o que e obvio no proprio nome da tarefa. O que continua
 * ambiguo fica **de fora** e e listado: por um cartao no cliente errado, o
 * relatorio inteiro passa a mentir, e ninguem descobre por meses.
 */
const PELO_TITULO: Array<[RegExp, string]> = [
  [/carbone\s*workshop|carbone\s*class|carbone educa/i, "carbone-educacao"],
  [/pedro\s*galv[aã]o|se\s*vira/i, "pedro-galvao-p2p"],
];

/**
 * Empresa que ninguem consegue inferir, e uma pessoa decidiu.
 *
 * Por id do ClickUp, e nao por titulo: sao trabalho interno da casa — uma
 * placa e uma melhoria de sistema —, e nao ha nada no texto que aponte para
 * uma empresa. Ficaram de fora do primeiro import de proposito, foram
 * perguntadas, e a resposta mora aqui em vez de num regex que finge ter
 * adivinhado.
 */
const EMPRESA_DECIDIDA: Record<string, string> = {
  // Decidido por Anny em 27/08/2026: as duas sao da SeuBone.
  "86ak2jayq": "seubone", // placa "sujeito a guincho"
  "86ajqfqtb": "seubone", // [SISTEMA] Melhorias no agendamento de captacao

  // Decidido por Anny em 31/08/2026: as tres sao da SeuBone. "SBP" e "SB
  // Personalizados" sao a mesma casa escrita de dois jeitos, e nenhum dos dois
  // e o slug — por isso nem regex de titulo resolveria sem chutar.
  "86afxn48f": "seubone", // Criativos SBP - Preco (Segunda leva)
  "86afxhxrb": "seubone", // Criativos SBP - Preco (Primeira leva)
  "86aevcz6e": "seubone", // ADS RH - SB Personalizados
};

const PESSOA_DE: Record<string, string> = {
  "thiago": "thiago.nascimento@grupoquatro5.com",
  "klenio braz": "klenio.braz@grupoquatro5.com",
  "samuel melo": "samuel.melo@grupoquatro5.com",
  "zion bagatoli": "zion.bagatoli@grupoquatro5.com",
  "anny beatriz da silva araujo": "anny.beatriz@grupoquatro5.com",
  "maria luiza mariz": "marialuiza.mariz@grupoquatro5.com",
  "maria clara carvalho": "mariaclara@seubone.com",
};

const PRIORIDADE_DE: Record<string, "urgente" | "alta" | "media" | "baixa"> = {
  urgent: "urgente",
  high: "alta",
  normal: "media",
  low: "baixa",
};

type Bruta = {
  id: string;
  nome: string;
  status: string;
  resp: string[];
  prazo: string | null;
  prio: string | null;
  empresa: string[] | null;
  pontos: number | null;
  /** Quando foi fechada no ClickUp. Vira `completedAt` em etapa de fim. */
  fechada?: string | null;
  /** Ultima movimentacao. Serve de conclusao quando nao houve fechamento. */
  atualizada?: string | null;
};

function empresaDe(tarefa: Bruta): string | null {
  const decidida = EMPRESA_DECIDIDA[tarefa.id];
  if (decidida) return decidida;

  for (const rotulo of tarefa.empresa ?? []) {
    const slug = EMPRESA_DE[rotulo.trim().toLowerCase()];
    if (slug) return slug;
    // Sem acento, para "Carbone Educacao" casar com "Carbone Educação".
    const semAcento = Object.entries(EMPRESA_DE).find(([k]) => chave(k) === chave(rotulo));
    if (semAcento) return semAcento[1];
  }
  for (const [padrao, slug] of PELO_TITULO) {
    if (padrao.test(tarefa.nome)) return slug;
  }
  return null;
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const brutas: Bruta[] = JSON.parse(fs.readFileSync(ORIGEM, "utf-8"));
  const hoje = new Date().toISOString().slice(0, 10);
  /*
   * `NASCE_NO_IMPORT`, e nao `etapaDe` sozinho. O de-para conhece `completo`
   * porque a sincronizacao precisa mover tarefa para la; usar so ele aqui faria
   * o import CRIAR as 3.234 concluidas do board, que por decisao nao atravessam.
   */
  const conhecidas = brutas.filter((t) => {
    const slug = etapaDe(t.status);
    return slug !== null && NASCE_NO_IMPORT.has(slug);
  });
  const vivas = conhecidas.filter((t) => atravessa(t, hoje));
  const cemiterio = conhecidas.length - vivas.length;

  const [empresas, pessoas, etapas, jaImportadas] = await Promise.all([
    db.select({ id: companies.id, slug: companies.slug, orgId: companies.orgId }).from(companies),
    db.select({ id: users.id, email: users.email }).from(users).where(eq(users.isActive, true)),
    db
      .select({ id: workItemStages.id, slug: workItemStages.slug })
      .from(workItemStages)
      .where(eq(workItemStages.type, "task")),
    db.select({ meta: workItems.meta }).from(workItems),
  ]);

  const porSlug = new Map(empresas.map((e) => [e.slug, e]));
  const porEmail = new Map(pessoas.map((p) => [p.email, p.id]));
  const porEtapa = new Map(etapas.map((e) => [e.slug, e.id]));
  const vistas = new Set(
    jaImportadas.map((w) => (w.meta as { clickupId?: string })?.clickupId).filter(Boolean),
  );

  const novas: Array<typeof workItems.$inferInsert> = [];
  let puladas = 0;
  const semEmpresa: string[] = [];
  const semPessoa: string[] = [];

  for (const tarefa of vivas) {
    if (vistas.has(tarefa.id)) {
      puladas++;
      continue;
    }

    const slug = empresaDe(tarefa);
    if (!slug) {
      semEmpresa.push(`${tarefa.nome} (${tarefa.resp.join(", ") || "sem responsável"})`);
      continue;
    }

    const empresa = porSlug.get(slug);
    if (!empresa) {
      semEmpresa.push(`${tarefa.nome} — empresa "${slug}" não existe aqui`);
      continue;
    }

    // Uma tarefa com dois responsaveis vira uma tarefa do primeiro. Duplicar
    // por pessoa contaria a mesma entrega duas vezes na pontuacao.
    const email = tarefa.resp.length ? PESSOA_DE[tarefa.resp[0].toLowerCase().trim()] : undefined;
    const pessoa = email ? porEmail.get(email) : undefined;
    if (tarefa.resp.length && !pessoa) semPessoa.push(`${tarefa.nome} → ${tarefa.resp[0]}`);

    const slugEtapa = etapaDe(tarefa.status)!;
    const etapa = porEtapa.get(slugEtapa);
    if (!etapa) throw new Error(`Etapa ${slugEtapa} não existe no pipeline de tarefa.`);

    novas.push({
      orgId: empresa.orgId,
      companyId: empresa.id,
      type: "task" as const,
      title: tarefa.nome.trim().slice(0, 500),
      stageId: etapa,
      assigneeId: pessoa ?? null,
      dueDate: tarefa.prazo ? new Date(Number(tarefa.prazo)) : null,
      priority: tarefa.prio ? (PRIORIDADE_DE[tarefa.prio] ?? "media") : "media",
      points: tarefa.pontos,
      /*
       * Peca no banco de criativos ja terminou — a etapa e de fim, e conta na
       * pontuacao. Sem `completedAt` ela entraria com o prazo antigo e cairia
       * como ATRASADA na fila de alguem: 46 das 47 tem prazo ja vencido.
       * A data e a ultima movimentacao no ClickUp, que e quando a peca entrou
       * no banco — nao hoje, que somaria trabalho velho na semana corrente.
       */
      completedAt:
        ETAPAS_DE_FIM.has(slugEtapa) && (tarefa.fechada ?? tarefa.atualizada)
          ? new Date(Number(tarefa.fechada ?? tarefa.atualizada))
          : null,
      meta: { clickupId: tarefa.id, origem: "clickup", statusOriginal: tarefa.status.trim() },
    });
  }

  /**
   * Em lotes, e nao um a um. Oitenta e tres inserts sequenciais mantem a
   * conexao aberta tempo demais para o pooler de transacao do Supabase, que
   * derruba no meio — e ai metade entrou e ninguem sabe qual metade.
   */
  if (aplicar) {
    for (let i = 0; i < novas.length; i += 25) {
      await db.insert(workItems).values(novas.slice(i, i + 25));
    }
  }
  const criadas = novas.length;

  console.log(aplicar ? "Aplicado." : "Simulacao — nada foi escrito. Use -- --aplicar.");
  console.log(`  vivas no board: ${vivas.length}   deixadas para tras (pendente vencida): ${cemiterio}`);
  console.log(`  importadas: ${criadas}   ja estavam aqui: ${puladas}   sem empresa: ${semEmpresa.length}`);
  for (const nome of semEmpresa) console.log(`  ! sem empresa: ${nome}`);
  for (const nome of semPessoa) console.log(`  ! sem conta aqui: ${nome}`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error(err);
    await client.end().catch(() => {});
    process.exit(1);
  });
