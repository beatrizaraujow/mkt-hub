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

const ORIGEM = process.env.CLICKUP_JSON ?? "./.cu-limpo.json";

/** Status do ClickUp que contam como vivo, e onde cada um cai aqui. */
const ETAPA_DE: Record<string, string> = {
  "solicitado form": "solicitado",
  "em progresso": "em_andamento",
  alterar: "ajustar",
  "pré revisão": "pre_revisao",
  "revisão ia": "revisao_ia",
  aprovar: "aprovacao",
  "aprovação líder": "aprovacao_lider",
  publicar: "publicar",
};

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
};

const chave = (v: string) =>
  v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

function empresaDe(tarefa: Bruta): string | null {
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
  const vivas = brutas.filter((t) => ETAPA_DE[t.status]);

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

    const etapa = porEtapa.get(ETAPA_DE[tarefa.status]);
    if (!etapa) throw new Error(`Etapa ${ETAPA_DE[tarefa.status]} não existe no pipeline de tarefa.`);

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
      meta: { clickupId: tarefa.id, origem: "clickup", statusOriginal: tarefa.status },
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
  console.log(`  vivas no board: ${vivas.length}`);
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
