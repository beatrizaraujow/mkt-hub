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
 *
 * **Este script nao le arquivo de ambiente na linha de comando.** Passar um
 * caminho para ele nao aponta para outro banco: o argumento e ignorado e ele
 * usa o `.env.local`, que e desenvolvimento. Para rodar contra producao, use
 * `npm run clickup:migrar -- <arquivo.env>`, que le o arquivo e repassa a
 * conexao aos tres passos.
 */
import fs from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { client, db } from "./index";
import { companies, users, workItemStages, workItems } from "./schema";
import { ETAPAS_DE_FIM, chave, etapaDe } from "@/features/work-items/clickup-map";
import { ligado } from "./destino";

const ORIGEM = process.env.CLICKUP_JSON ?? "./.cu-limpo.json";

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
  // A mesma pessoa com outro sobrenome no ClickUp, confirmado por ela em
  // 31/08/2026. Sao 87 tarefas que nao casavam com conta nenhuma.
  "zion pinto": "zion.bagatoli@grupoquatro5.com",
  "anny beatriz da silva araujo": "anny.beatriz@grupoquatro5.com",
  // A mesma pessoa, sem o "da". Sao 101 tarefas que casavam com ninguem.
  "anny beatriz silva araujo": "anny.beatriz@grupoquatro5.com",
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
  /** Rotulos de `Tarefas SKILL` no board. Lidos a partir de 02/09/2026. */
  skill?: string[] | null;
  /** Rotulos de `Formato SKILL` no board. Lidos a partir de 02/09/2026. */
  formato?: string[] | null;
  /** Quando foi fechada no ClickUp. Vira `completedAt` em etapa de fim. */
  fechada?: string | null;
  /** Ultima movimentacao. Serve de conclusao quando nao houve fechamento. */
  atualizada?: string | null;
  /** Quando nasceu no ClickUp. */
  criada?: string | null;
  /** O id da mae no ClickUp, quando esta e subtarefa. */
  mae?: string | null;
  briefing?: string | null;
  /** Tempo lancado, em minutos. Total da tarefa, sem dono e sem data. */
  minutos?: number | null;
  estimativa?: number | null;
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
  const aplicar = ligado("aplicar");
  const brutas: Bruta[] = JSON.parse(fs.readFileSync(ORIGEM, "utf-8"));
  /*
   * **Tudo atravessa, por decisao de 31/08/2026.** Antes o import trazia so o
   * que estava vivo: sem as concluidas, sem as pendentes vencidas, sem
   * subtarefa. Aquilo era amostra de um board que continuava existindo ao lado.
   *
   * Agora e migracao — o ClickUp vai ser desligado e a equipe fica 100% aqui.
   * Historico que nao atravessa nao fica no ClickUp: some. As 3.946 concluidas
   * sao seis mil horas de trabalho de gente, e a unica copia delas passa a ser
   * esta.
   *
   * O `atravessa` e o `NASCE_NO_IMPORT` continuam existindo e continuam certos
   * para o que foram escritos — sincronizar um board vivo. Aqui nao se aplicam.
   */
  const vivas = brutas.filter((t) => etapaDe(t.status) !== null);
  const semEtapa = brutas.length - vivas.length;

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

  /*
   * A subtarefa herda a empresa da mae quando nao tem a propria. No ClickUp a
   * `Empresa Tag` costuma ficar so na mae, e sem esta heranca as 721
   * subtarefas cairiam quase todas em "sem empresa" — trabalho real recusado
   * por um campo que a mae ja respondeu.
   */
  const porClickupId = new Map(brutas.map((t) => [t.id, t]));
  const empresaComHeranca = (tarefa: Bruta): string | null => {
    const propria = empresaDe(tarefa);
    if (propria) return propria;
    const mae = tarefa.mae ? porClickupId.get(tarefa.mae) : undefined;
    return mae ? empresaDe(mae) : null;
  };

  /*
   * O id e sorteado aqui, e nao pelo banco. Assim a subtarefa ja sabe o
   * `parentId` da mae antes de qualquer insert, e nao e preciso inserir em duas
   * passadas lendo de volta o que o banco gerou.
   */
  const idNovoDe = new Map<string, string>();
  for (const tarefa of vivas) idNovoDe.set(tarefa.id, crypto.randomUUID());

  const novas: Array<typeof workItems.$inferInsert> = [];
  let orfas = 0;
  let internas = 0;
  const semConta = new Set<string>();
  let puladas = 0;
  const semEmpresa: string[] = [];
  const semPessoa: string[] = [];

  for (const tarefa of vivas) {
    if (vistas.has(tarefa.id)) {
      puladas++;
      continue;
    }

    /*
     * Sem cliente vai para **Interno**, e nao para o descarte.
     *
     * Sao 770 tarefas cuja `Empresa Tag` falta nelas e na mae — e faltar ali
     * nao e descuido: sao anotacoes internas ("Artes vagas 17.08", "mudar o
     * catalogo em todas as LPS"), trabalho que existiu e nao pertence a
     * cliente nenhum. Recusa-las levaria junto 751 conclusoes, 510 pontuacoes
     * e 1.215 horas. Numa migracao que desliga o ClickUp, isso nao e filtrar.
     */
    const slug = empresaComHeranca(tarefa) ?? "interno";

    const empresa = porSlug.get(slug);
    if (!empresa) {
      semEmpresa.push(`${tarefa.nome} — empresa "${slug}" não existe aqui`);
      continue;
    }

    if (slug === "interno") internas++;

    // Uma tarefa com dois responsaveis vira uma tarefa do primeiro. Duplicar
    // por pessoa contaria a mesma entrega duas vezes na pontuacao.
    const email = tarefa.resp.length ? PESSOA_DE[tarefa.resp[0].toLowerCase().trim()] : undefined;
    const pessoa = email ? porEmail.get(email) : undefined;
    if (tarefa.resp.length && !pessoa) {
      semPessoa.push(`${tarefa.nome} → ${tarefa.resp[0]}`);
      semConta.add(tarefa.resp[0]);
    }

    const slugEtapa = etapaDe(tarefa.status)!;
    const etapa = porEtapa.get(slugEtapa);
    if (!etapa) throw new Error(`Etapa ${slugEtapa} não existe no pipeline de tarefa.`);

    /*
     * Mae que nao entrou (sem empresa, ou ja importada antes) deixa a filha sem
     * `parentId`. Ela entra como tarefa de primeiro nivel em vez de ser
     * descartada: perder a hierarquia e ruim, perder o trabalho e pior.
     */
    const paiNovo = tarefa.mae ? idNovoDe.get(tarefa.mae) : undefined;
    if (tarefa.mae && !paiNovo) orfas++;

    novas.push({
      id: idNovoDe.get(tarefa.id),
      orgId: empresa.orgId,
      companyId: empresa.id,
      parentId: paiNovo ?? null,
      type: "task" as const,
      title: tarefa.nome.trim().slice(0, 500),
      description: tarefa.briefing ?? null,
      stageId: etapa,
      assigneeId: pessoa ?? null,
      estimateMinutes: tarefa.estimativa ?? null,
      /*
       * `Tarefas SKILL` e `Formato SKILL` chegam como lista de rotulos e as
       * colunas sao texto. Varios rotulos viram uma linha separada por virgula:
       * uma tarefa pode ser "Edicao de video, Captacao", e escolher um so
       * apagaria metade do que a pessoa registrou.
       */
      skill: tarefa.skill?.join(", ") ?? null,
      format: tarefa.formato?.join(", ") ?? null,
      createdAt: tarefa.criada ? new Date(Number(tarefa.criada)) : undefined,
      dueDate: tarefa.prazo ? new Date(Number(tarefa.prazo)) : null,
      priority: tarefa.prio ? (PRIORIDADE_DE[tarefa.prio] ?? "media") : "media",
      /*
       * `points` e inteiro no banco e o ClickUp aceita fracao: duas tarefas do
       * board tem 0,5 e 0,3. O insert inteiro morria com `invalid input syntax
       * for type integer` — e como o lote nao e transacao, metade entrava.
       *
       * Arredonda, e guarda o original em `meta`: sao 0,8 ponto no historico
       * inteiro, mas ponto arredondado em silencio e o tipo de coisa que
       * ninguem consegue explicar seis meses depois.
       */
      points: tarefa.pontos === null ? null : Math.round(tarefa.pontos),
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
      meta: {
        clickupId: tarefa.id,
        origem: "clickup",
        statusOriginal: tarefa.status.trim(),
        /*
         * O tempo do ClickUp fica em `meta`, e nao vira lancamento no
         * cronometro. E o total da tarefa, sem dono e sem data — virar
         * lancamento exigiria inventar as duas coisas, num sistema que paga por
         * numero. Aqui ele fica como o que e: uma anotacao de quanto aquilo
         * consumiu la.
         */
        ...(tarefa.minutos ? { minutosNoClickUp: tarefa.minutos } : {}),
        /*
         * O nome de quem fez, como estava no ClickUp — guardado **sempre**,
         * inclusive quando ha conta aqui.
         *
         * Mil cento e cinquenta e quatro tarefas sao de gente que saiu da casa:
         * Abner, Guilherme, Vivianne, Joao, Gustavo e outros. Nao ha conta para
         * apontar, e criar conta de quem foi embora so para segurar chave
         * estrangeira e pior. Mas perder o "quem fez" de mil tarefas concluidas
         * numa migracao que desliga a origem e perder informacao — entao o nome
         * fica aqui, legivel, mesmo sem virar vinculo.
         */
        ...(tarefa.resp.length ? { respNoClickUp: tarefa.resp } : {}),
        ...(tarefa.pontos !== null && !Number.isInteger(tarefa.pontos)
          ? { pontoOriginalNoClickUp: tarefa.pontos }
          : {}),
      },
    });
  }

  /*
   * Conserto do que ja entrou sem dono.
   *
   * O de-para de nomes muda: "Anny Beatriz Silva Araujo" sem o "da" e "Zion
   * Pinto" so foram reconhecidos depois de milhares de tarefas ja terem sido
   * importadas. Sem esta passada, corrigir o mapa nao consertaria nada — a
   * tarefa ja esta aqui e o import a pula.
   *
   * **So preenche o que esta vazio.** Nunca troca responsavel que alguem
   * definiu aqui: o ClickUp e a origem do historico, nao a autoridade sobre o
   * que o time fez depois.
   */
  type Conserto = {
    clickupId: string;
    pessoaId?: string;
    skill?: string;
    format?: string;
  };

  const paraConsertar: Conserto[] = [];

  if (vistas.size) {
    const jaCom = await db
      .select({
        meta: workItems.meta,
        assigneeId: workItems.assigneeId,
        skill: workItems.skill,
        format: workItems.format,
      })
      .from(workItems);

    for (const linha of jaCom) {
      const clickupId = (linha.meta as { clickupId?: string })?.clickupId;
      if (!clickupId) continue;

      const bruta0 = porClickupId.get(clickupId);
      if (!bruta0) continue;

      const conserto: Conserto = { clickupId };

      /*
       * `Tarefas SKILL` e `Formato SKILL` so passaram a ser lidos em 02/09/2026.
       * As 4.266 tarefas que ja atravessaram entraram sem eles, e reimportar nao
       * as alcanca — o import pula quem ja esta aqui. Sem esta passada, os dois
       * campos ficariam preenchidos so no que entrasse dali para a frente.
       */
      if (!linha.skill && bruta0.skill?.length) conserto.skill = bruta0.skill.join(", ");
      if (!linha.format && bruta0.formato?.length) conserto.format = bruta0.formato.join(", ");

      if (linha.assigneeId) {
        if (conserto.skill || conserto.format) paraConsertar.push(conserto);
        continue;
      }

      /*
       * O nome vem do **arquivo baixado**, e nao do `meta` da linha. As 2.500
       * primeiras tarefas entraram antes de o import passar a gravar
       * `respNoClickUp`, entao consultar o `meta` deixaria justamente elas de
       * fora — que sao as que mais precisam do conserto. O arquivo tem o
       * responsavel de todas.
       */
      const nome = bruta0.resp?.[0];
      const email = nome ? PESSOA_DE[nome.toLowerCase().trim()] : undefined;
      const pessoa = email ? porEmail.get(email) : undefined;
      if (pessoa) conserto.pessoaId = pessoa;

      if (conserto.pessoaId || conserto.skill || conserto.format) paraConsertar.push(conserto);
    }
  }

  if (aplicar) {
    /*
     * Agrupado por valor, e nao uma consulta por tarefa.
     *
     * Um `UPDATE` por linha eram 2.107 idas ao banco em sequencia — a primeira
     * tentativa morreu na 592a, sem dizer por que, deixando o conserto pela
     * metade. E como isso nao e transacao, "pela metade" fica pela metade.
     *
     * As tarefas repetem muito o mesmo valor ("Edicao de video" aparece 233
     * vezes), entao agrupar pelo conjunto de campos reduz milhares de consultas
     * a algumas dezenas — e cada uma cobre todas as suas de uma vez.
     */
    const grupos = new Map<string, { campos: Record<string, string>; ids: string[] }>();

    for (const conserto of paraConsertar) {
      const campos: Record<string, string> = {};
      if (conserto.pessoaId) campos.assigneeId = conserto.pessoaId;
      if (conserto.skill) campos.skill = conserto.skill;
      if (conserto.format) campos.format = conserto.format;

      const chave = JSON.stringify(campos);
      const grupo = grupos.get(chave) ?? { campos, ids: [] };
      grupo.ids.push(conserto.clickupId);
      grupos.set(chave, grupo);
    }

    console.log(`  consertando em ${grupos.size} grupos...`);

    for (const grupo of grupos.values()) {
      // Em fatias: uma lista de milhares de ids numa clausula so e pedir problema.
      for (let i = 0; i < grupo.ids.length; i += 500) {
        const fatia = grupo.ids.slice(i, i + 500);
        await db
          .update(workItems)
          .set(grupo.campos)
          .where(inArray(sql`${workItems.meta}->>'clickupId'`, fatia));
      }
    }
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
  const minutos = novas.reduce(
    (soma, linha) => soma + Number((linha.meta as { minutosNoClickUp?: number })?.minutosNoClickUp ?? 0),
    0,
  );

  console.log(`  no board: ${brutas.length}   com etapa conhecida: ${vivas.length}   sem etapa: ${semEtapa}`);
  console.log(`  importadas: ${criadas}   ja estavam aqui: ${puladas}   sem empresa: ${semEmpresa.length}`);
  console.log(`  subtarefas: ${novas.filter((l) => l.parentId).length}   órfãs (mãe não entrou): ${orfas}`);
  console.log(`  sem cliente → Interno: ${internas}`);
  if (paraConsertar.length) {
    const comDono = paraConsertar.filter((c) => c.pessoaId).length;
    const comSkill = paraConsertar.filter((c) => c.skill).length;
    const comFormato = paraConsertar.filter((c) => c.format).length;
    console.log(
      `  em tarefa que já estava aqui — dono: ${comDono}   Tarefas SKILL: ${comSkill}   Formato SKILL: ${comFormato}`,
    );
  }
  console.log(`  com briefing: ${novas.filter((l) => l.description).length}   horas anotadas: ${Math.round(minutos / 60)}h`);

  const arredondadas = novas.filter(
    (l) => (l.meta as { pontoOriginalNoClickUp?: number })?.pontoOriginalNoClickUp !== undefined,
  );
  if (arredondadas.length) {
    console.log(`  pontos arredondados: ${arredondadas.length}`);
    for (const linha of arredondadas) {
      const original = (linha.meta as { pontoOriginalNoClickUp?: number }).pontoOriginalNoClickUp;
      console.log(`    · ${original} → ${linha.points}   ${String(linha.title).slice(0, 50)}`);
    }
  }
  for (const nome of semEmpresa) console.log(`  ! sem empresa: ${nome}`);
  if (semConta.size) {
    console.log(`
  ${semPessoa.length} tarefas sem conta aqui, de ${semConta.size} pessoas:`);
    for (const nome of [...semConta].sort()) console.log(`    · ${nome}`);
    console.log("  O nome de cada uma fica em `meta.respNoClickUp`.");
  }
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error(err);
    /*
     * O codigo de saida e marcado **antes** de esperar o fim da conexao. Com o
     * banco fora de alcance, `client.end()` pode nunca resolver — o `await`
     * abaixo trava, o `process.exit(1)` nunca roda, e o Node encerra sozinho
     * com codigo 0 quando o event loop esvazia. O erro aparece na tela e o
     * processo se declara bem-sucedido; quem chama este script em sequencia
     * segue para o passo seguinte como se nada tivesse acontecido.
     */
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
