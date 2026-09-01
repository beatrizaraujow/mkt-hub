/**
 * Cadastra o checklist do operacional — os blocos por marca do documento
 * "Checklists Finais para Validar", aprovados em 01/09/2026.
 *
 *   npm run checklist:marcas                       simula, em desenvolvimento
 *   npm run checklist:marcas -- aplicar
 *   npm run checklist:marcas -- ../mkt-prod.env aplicar
 *
 * Sem tracos nos argumentos: o npm engole `--alguma-coisa` mesmo depois do
 * `--`. Ver `src/db/aplicar-migrations.ts`.
 *
 * **UNIVERSAL e uma linha, nao seis.** A etiqueta do documento promete que
 * "mexer aqui muda para as 6 marcas de uma vez", e uma linha por marca faria
 * corrigir a redacao de "Revisei a ortografia" virar corrigir seis linhas — na
 * pratica, corrigir cinco e esquecer uma. Item universal nasce com
 * `company_id` nulo, e e o `company_id` nulo que cumpre a promessa.
 *
 * Pela mesma razao o recorte de formato e uma **lista** numa linha so: o bloco
 * de estatico vale para Estatico, Estatico Ads e Capa de reels, e sao tres
 * valores num campo, nao tres linhas. Quem compara e `features/review/escopo`,
 * elemento a elemento dos dois lados.
 *
 * **A Weevo nao tem bloco proprio, e isso esta certo.** O documento diz: "A
 * Weevo nao tem manual proprio. Ela usa so o bloco universal". Como o universal
 * nasce sem empresa, a Weevo ja fica coberta sem uma linha sequer com o nome
 * dela — cadastrar copias com o nome Weevo daria a mesma tela hoje e seis
 * lugares para editar amanha.
 *
 * Roda quantas vezes quiser: casa por texto + escopo e nao duplica.
 */
import postgres from "postgres";
import { isFormat, isSkill } from "../lib/catalog";
import { anunciarDestino, lerAmbienteDoArgumento } from "./destino";

/** Os grupos de formato do documento, na grafia do catalogo daqui. */
const ESTATICO = "Estático, Estático Ads, Capa de reels";
const CARROSSEL = "Carrossel, Carrossel Ads";
const VIDEO = "Vídeo, Vídeo Ads";
const OFF = "Mídia OFF";

/**
 * O bloco de captacao e o unico que se separa por tipo de peca, e nao por
 * formato: a mesma peca em "Video" pode ser uma filmagem ou uma edicao, e as
 * perguntas sao outras. "Ouvi com fone: audio limpo" nao se pergunta a quem
 * ainda vai gravar.
 *
 * Nao existe o recorte inverso — "todo tipo menos captacao" —, entao o bloco de
 * edicao continua sem recorte de tipo e uma tarefa marcada como captacao **e**
 * edicao ve os dois. Isso esta certo: ela e as duas coisas.
 */
const CAPTACAO = "Captação";

type Item = {
  texto: string;
  /** Nulo = universal, vale para as seis marcas. Senao, o nome da empresa. */
  marca?: string;
  formatos: string;
  skills?: string;
  medidor?: boolean;
};

/**
 * Os itens, exatamente como estao no documento.
 *
 * A ordem dentro de cada bloco e a ordem em que a pessoa le, e por isso a
 * posicao e atribuida na ordem desta lista. Universal primeiro, marca depois:
 * quem confere comeca pelo que vale sempre.
 */
const ITENS: Item[] = [
  /* ----------------------------------------------------------- universal */

  { texto: "Revisei a ortografia e o texto da arte está correto.", formatos: ESTATICO, medidor: true },
  { texto: "Não tem texto pequeno demais para ler na tela do celular.", formatos: ESTATICO },
  { texto: "Todas as imagens são do acervo da marca, nenhuma veio de banco de imagens.", formatos: ESTATICO },
  { texto: "Comparei cada elemento gerado por IA com o material real antes de usar.", formatos: ESTATICO },

  { texto: "Revisei a ortografia e o texto da arte está correto.", formatos: CARROSSEL, medidor: true },
  { texto: "Não tem texto pequeno demais para ler na tela do celular.", formatos: CARROSSEL },
  { texto: "Todas as imagens são do acervo da marca, nenhuma veio de banco de imagens.", formatos: CARROSSEL },
  { texto: "Comparei cada elemento gerado por IA com o material real antes de usar.", formatos: CARROSSEL },

  { texto: "Revisei a legenda e ela está correta.", formatos: VIDEO, medidor: true },
  { texto: "Todas as imagens e vídeos são do acervo da marca, nenhum veio de banco de imagens.", formatos: VIDEO },
  { texto: "O vídeo tem gancho claro nos 3 primeiros segundos.", formatos: VIDEO },
  { texto: "Ouvi com fone: áudio limpo, sem ruído e sem volume oscilando.", formatos: VIDEO },
  { texto: "O CTA do fecho está inteiro no arquivo, não foi cortado na edição.", formatos: VIDEO },

  { texto: "Revisei a ortografia e o texto da arte está correto.", formatos: OFF, medidor: true },
  { texto: "Não tem texto pequeno demais para ler na tela do celular.", formatos: OFF },
  { texto: "Todas as imagens são do acervo da marca, nenhuma veio de banco de imagens.", formatos: OFF },
  { texto: "Comparei cada elemento gerado por IA com o material real antes de usar.", formatos: OFF },
  { texto: "Testei o QR, o telefone ou o endereço impressos e eles chegam mesmo na gente.", formatos: OFF },

  /*
   * Captacao: mesmo formato, outro tipo de peca, outras perguntas.
   *
   * O documento repete "O video tem gancho claro nos 3 primeiros segundos" no
   * bloco de captacao, e aqui ele **nao** e cadastrado de novo: o bloco de
   * video ja o carrega para os mesmos formatos, e uma tarefa de captacao veria
   * a mesma frase duas vezes na mesma tela. Item repetido nao dobra a
   * conferencia, ensina a marcar sem ler.
   */
  { texto: "O áudio do vídeo foi testado e captado corretamente.", formatos: VIDEO, skills: CAPTACAO },
  { texto: "Subi os vídeos na pasta corretamente.", formatos: VIDEO, skills: CAPTACAO },

  /* -------------------------------------------------------------- SeuBoné */

  { marca: "SeuBoné", texto: "O produto é protagonista: aparece grande e dá para ver bem.", formatos: `${ESTATICO}, ${CARROSSEL}` },
  { marca: "SeuBoné", texto: "O produto está sem sujeira, sem deformação e numa cor que vende.", formatos: `${ESTATICO}, ${CARROSSEL}` },
  { marca: "SeuBoné", texto: "O produto é protagonista já na capa.", formatos: CARROSSEL },
  { marca: "SeuBoné", texto: "O boné aparece nos 5 primeiros segundos.", formatos: VIDEO },
  { marca: "SeuBoné", texto: "Todo mundo que fala no vídeo está de boné.", formatos: VIDEO },

  /* ---------------------------------------------------------------- Onevo */

  /*
   * Uma linha na mae, nao duas nas filhas. O item e o mesmo nos dois blocos do
   * documento (Investimentos e Energia), e a regra da mae ja alcanca as
   * sub-marcas por `companyChain`. Duas linhas iguais so criariam dois lugares
   * para corrigir a mesma frase.
   */
  { marca: "Onevo", texto: "A usina que aparece é do porte que a Onevo vende, não uma usina gigante.", formatos: `${ESTATICO}, ${CARROSSEL}, ${VIDEO}` },
];

const argumentos = process.argv.slice(2);
const aplicar = argumentos.includes("aplicar");
process.argv = process.argv.filter((a) => a !== "aplicar");

lerAmbienteDoArgumento();
const onde = anunciarDestino();

const client = postgres(process.env.DATABASE_URL as string, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  onnotice: () => {},
});

function conferirCatalogo() {
  const problemas: string[] = [];

  for (const item of ITENS) {
    for (const f of item.formatos.split(",").map((v) => v.trim())) {
      if (!isFormat(f)) problemas.push(`formato fora do catálogo: "${f}"`);
    }
    for (const s of (item.skills ?? "").split(",").map((v) => v.trim()).filter(Boolean)) {
      if (!isSkill(s)) problemas.push(`tipo fora do catálogo: "${s}"`);
    }
  }

  if (problemas.length > 0) {
    /*
     * Recorte fora do catalogo nao da erro no banco: ele grava e nunca casa com
     * entrega nenhuma. O checklist simplesmente nao aparece, e ninguem descobre
     * ate alguem perguntar por que aquele item sumiu. Melhor parar aqui.
     */
    throw new Error(`Recorte que nunca casaria com entrega nenhuma:\n  ${[...new Set(problemas)].join("\n  ")}`);
  }
}

async function main() {
  conferirCatalogo();

  const orgs = (await client`select id, name from organizations`) as unknown as Array<{
    id: string;
    name: string;
  }>;

  if (orgs.length !== 1) throw new Error(`Esperava uma organizacao e achei ${orgs.length}.`);
  const org = orgs[0];

  const empresas = (await client`
    select id, name from companies where org_id = ${org.id}
  `) as unknown as Array<{ id: string; name: string }>;

  const porNome = new Map(empresas.map((e) => [e.name, e.id]));

  const faltando = [...new Set(ITENS.map((i) => i.marca).filter(Boolean))].filter(
    (nome) => !porNome.has(nome as string),
  );

  if (faltando.length > 0) {
    throw new Error(
      `Empresa nao encontrada: ${faltando.join(", ")}. Cadastrar o item sem empresa o tornaria ` +
        `universal, que e o contrario do que ele e.`,
    );
  }

  const existentes = (await client`
    select text, company_id, coalesce(format, '') as format, coalesce(skill, '') as skill
      from review_checklist_items
     where org_id = ${org.id} and momento = 'operacional'
  `) as unknown as Array<{ text: string; company_id: string | null; format: string; skill: string }>;

  const chave = (texto: string, empresa: string | null, formato: string, skill: string) =>
    [texto, empresa ?? "", formato, skill].join("¦");

  const jaTem = new Set(
    existentes.map((l) => chave(l.text, l.company_id, l.format, l.skill)),
  );

  console.log(`\nOrganizacao: ${org.name}`);
  console.log(`Ja cadastrados no operacional: ${existentes.length}\n`);

  let novos = 0;

  for (const [indice, item] of ITENS.entries()) {
    const empresaId = item.marca ? (porNome.get(item.marca) as string) : null;
    const skills = item.skills ?? null;

    if (jaTem.has(chave(item.texto, empresaId, item.formatos, skills ?? ""))) {
      console.log(`  = ${item.texto.slice(0, 62)}`);
      continue;
    }

    const escopo = [item.marca ?? "todas as marcas", item.formatos, skills].filter(Boolean).join(" · ");
    console.log(`  + ${item.texto.slice(0, 62)}`);
    console.log(`      ${escopo}${item.medidor ? "   [medidor]" : ""}`);
    novos++;

    if (!aplicar) continue;

    await client`
      insert into review_checklist_items
        (org_id, company_id, skill, format, momento, only_after_rework,
         text, depends_on_report, is_reliability_probe, is_active, position)
      values
        (${org.id}, ${empresaId}, ${skills}, ${item.formatos}, 'operacional',
         false, ${item.texto}, false, ${item.medidor ?? false}, true, ${(indice + 1) * 10})
    `;
  }

  console.log(
    `\n${novos} novo(s), ${ITENS.length - novos} ja estavam la.` +
      (aplicar
        ? `\nGravado em ${onde}.`
        : `\nSimulacao — nada foi escrito em ${onde}. Acrescente a palavra aplicar.`),
  );
}

main()
  .then(() => client.end())
  .catch(async (erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
