/**
 * Cadastra o checklist de aprovacao — os seis itens do bloco final do
 * "Checklists Finais para Validar", aprovados como estao em 01/09/2026.
 *
 *   npm run checklist:aprovacao                       simula, em desenvolvimento
 *   npm run checklist:aprovacao -- aplicar            escreve, em desenvolvimento
 *   npm run checklist:aprovacao -- ../mkt-prod.env aplicar
 *
 * Sem tracos nos argumentos: o npm engole `--alguma-coisa` mesmo depois do
 * `--`. Ver `src/db/aplicar-migrations.ts`.
 *
 * **Este e o segundo checklist, nao o primeiro.** O do operacional e por marca
 * e por formato, quem produz responde, e sai da Pre revisao. Este e de quem
 * aprova, sai da Aprovacao, e pergunta outra coisa: nao se a peca segue o
 * manual — a maquina ja conferiu isso — mas se ela e **a peca certa**. Passar
 * na IA nao e aprovacao: a IA confere a peca contra o manual, ela nao sabe se
 * a peca era para ser esta.
 *
 * Roda quantas vezes quiser: casa por texto e nao duplica.
 */
import postgres from "postgres";
import { CONFIRMACAO_DA_EXCECAO } from "../lib/excecao";
import { anunciarDestino, lerAmbienteDoArgumento } from "./destino";

type Item = {
  texto: string;
  /** Depende do laudo: some na peca com excecao declarada. */
  laudo?: boolean;
  /** So aparece se a peca ja voltou por alteracao. */
  aposAlteracao?: boolean;
  /** So neste formato. */
  formato?: string;
};

/**
 * Os seis, na ordem em que a pessoa le.
 *
 * A ordem nao e decorativa: as tres primeiras sao sobre a peca cumprir o que
 * foi pedido, a quarta e a heranca do que a maquina achou, e as duas ultimas
 * so aparecem quando fazem sentido. Item que aparece sem fazer sentido ensina
 * a marcar sem ler, e ai o checklist inteiro deixa de valer.
 */
const ITENS: Item[] = [
  { texto: "A peça entrega o objetivo do briefing que abriu a tarefa." },
  { texto: "A legenda que está no card é a que vai publicar e casa com a peça." },
  { texto: "Data, canal e formato de publicação conferem com o planejamento." },
  { texto: "Li o laudo e assumo os pontos de atenção que sobraram.", laudo: true },
  {
    texto: "Se a peça já voltou por alteração antes, a alteração pedida foi realmente feita.",
    aposAlteracao: true,
  },
  {
    texto: "A arte está no formato, na resolução e com as margens que a gráfica pediu.",
    formato: "Mídia OFF",
  },
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

async function main() {
  const orgs = (await client`select id, name from organizations`) as unknown as Array<{
    id: string;
    name: string;
  }>;

  if (orgs.length !== 1) {
    throw new Error(
      `Esperava uma organizacao e achei ${orgs.length}. Escolher a errada cadastraria o ` +
        `checklist para a casa errada, e ninguem descobriria ate alguem tentar aprovar.`,
    );
  }

  const org = orgs[0];
  console.log(`\nOrganizacao: ${org.name}`);

  const existentes = (await client`
    select text from review_checklist_items
     where org_id = ${org.id} and momento = 'aprovacao'
  `) as unknown as Array<{ text: string }>;

  const jaTem = new Set(existentes.map((linha) => linha.text));

  console.log(`Ja cadastrados neste momento: ${jaTem.size}\n`);

  let novos = 0;

  for (const [indice, item] of ITENS.entries()) {
    if (jaTem.has(item.texto)) {
      console.log(`  = ${item.texto}`);
      continue;
    }

    const marcas = [
      item.laudo ? "depende do laudo" : null,
      item.aposAlteracao ? "só após alteração" : null,
      item.formato ? `só ${item.formato}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    console.log(`  + ${item.texto}${marcas ? `   [${marcas}]` : ""}`);
    novos++;

    if (!aplicar) continue;

    await client`
      insert into review_checklist_items
        (org_id, company_id, skill, format, momento, only_after_rework,
         text, depends_on_report, is_reliability_probe, is_active, position)
      values
        (${org.id}, null, null, ${item.formato ?? null}, 'aprovacao',
         ${item.aposAlteracao ?? false}, ${item.texto}, ${item.laudo ?? false},
         false, true, ${(indice + 1) * 10})
    `;
  }

  console.log(
    `\n${novos} novo(s), ${ITENS.length - novos} ja estavam la.` +
      (aplicar
        ? `\nGravado em ${onde}.`
        : `\nSimulacao — nada foi escrito em ${onde}. Acrescente a palavra aplicar.`),
  );

  if (novos > 0) {
    console.log(
      `\nNuma peca com excecao declarada, o item do laudo some e no lugar entra:\n  "${CONFIRMACAO_DA_EXCECAO}"`,
    );
  }
}

main()
  .then(() => client.end())
  .catch(async (erro) => {
    console.error(erro);
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
