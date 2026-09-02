/**
 * Carrega o `regras-v1.json` da diretoria para dentro de `review_rules`.
 *
 *   npm run regras:importar -- caminho=../regras-v1.json
 *   npm run regras:importar -- caminho=../regras-v1.json aplicar
 *
 * **Experimento, e so roda em desenvolvimento.** O documento de requisitos pede
 * plano aprovado antes de construir a camada de revisao, e este script nao e a
 * implementacao do Bloco 0: ele existe para responder, com dados, o que so da
 * para responder rodando — quantas regras caem em cada peca, se o mapa de
 * escopos casa com a arvore de empresas daqui, e como fica um laudo com vinte e
 * uma regras de uma vez.
 *
 * **A conversao e com perda, e a perda esta escrita aqui.** A tabela de hoje
 * nao tem as colunas `grupo`, `aplica_quando` e `como_verificar` que o arquivo
 * traz, entao:
 *
 *   grupo A, B, C  ->  `is_blocking = true`   (reprova)
 *   grupo D        ->  `is_blocking = false`  (ressalva, que hoje vira "ajustar")
 *   como_verificar ->  `machine_hint`
 *   grupo          ->  o comeco de `rationale`, para nao se perder
 *
 * O que **nao** cabe na conversao, e por isso nao entra: `ugc` e
 * `peca_com_pessoas` nao existem como campo de tarefa. Sao duas regras, e
 * nenhuma delas reprova.
 *
 * O que este import **nao** faz e o que separa o experimento da implementacao:
 * nao ha confianca por resultado, nao ha rebaixamento pela aplicacao, nao ha
 * ressalva decidivel, e a IA continua lendo so a copy — 33 das 50 regras
 * precisam ver o arquivo.
 */
import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { companies, organizations, reviewRules } from "@/db/schema";
import {
  anunciarDestino,
  DESENVOLVIMENTO,
  lerAmbienteDoArgumento,
  ligado,
  refDaConexao,
  valorDe,
} from "./destino";

type RegraDoArquivo = {
  id: string;
  escopo: string;
  grupo: "A" | "B" | "C" | "D";
  veredito_quando_violada: "reprova" | "ressalva";
  aplica_quando: string;
  regra: string;
  como_verificar: string;
};

/** O escopo do arquivo, no nome da empresa daqui. `null` = todas as marcas. */
const EMPRESA_DO_ESCOPO: Record<string, string | null> = {
  universal: null,
  seubone: "SeuBoné",
  // A mae: alcanca Investimentos e Energia pela cadeia de empresas.
  onevo: "Onevo",
  "carbone-educacao": "Carbone Educação",
  "carbone-club": "Carbone Club",
};

/**
 * `aplica_quando`, traduzido para o recorte que a tabela tem.
 *
 * `sempre` nao vira recorte nenhum. Os dois valores de vertical da Onevo viram
 * **empresa**, nao formato: aqui Investimentos e Energia sao empresas de
 * verdade, e nao um campo da peca.
 */
const FORMATO_DE: Record<string, string | null> = {
  sempre: null,
  ads: "Estático Ads, Carrossel Ads, Vídeo Ads",
  estatico: "Estático, Estático Ads, Capa de reels",
  stories: "Stories",
};

const EMPRESA_DE_APLICA: Record<string, string> = {
  onevo_energia: "Onevo Energia",
  onevo_investimentos: "Onevo Investimentos",
};

/** Nao tem campo na tarefa que responda por eles. Ficam de fora, e dito na tela. */
const SEM_CAMPO = ["ugc", "peca_com_pessoas"];

const GRUPO_EXPLICADO: Record<string, string> = {
  A: "Grupo A — texto literal, verificado por busca.",
  B: "Grupo B — medição visual em pixels.",
  C: "Grupo C — comparação com valor declarado.",
  D: "Grupo D — julgamento. Nunca reprova nesta versão.",
};

const aplicar = ligado("aplicar");
const caminho = valorDe("caminho") ?? "../regras-v1.json";

lerAmbienteDoArgumento();
anunciarDestino();

if (refDaConexao(process.env.DATABASE_URL) !== DESENVOLVIMENTO) {
  console.error(
    "\nEste import e experimento e so roda em desenvolvimento.\n" +
      "As 50 regras so entram em producao depois de a diretoria aprovar o plano.",
  );
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL as string, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  onnotice: () => {},
});

const db = drizzle(client, { schema });

async function main() {
  const bruto = JSON.parse(readFileSync(caminho, "utf8")) as { regras: RegraDoArquivo[] };
  console.log(`\n${bruto.regras.length} regras em ${caminho}`);

  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("Nenhuma organizacao neste banco.");

  const marcas = await db.select().from(companies).where(eq(companies.orgId, org.id));
  const porNome = new Map(marcas.map((m) => [m.name, m.id]));

  const fora = bruto.regras.filter((r) => SEM_CAMPO.includes(r.aplica_quando));
  const dentro = bruto.regras.filter((r) => !SEM_CAMPO.includes(r.aplica_quando));

  /* Limpa so o que este import trouxe antes, pelo prefixo do codigo. */
  const codigos = dentro.map((r) => r.id);
  const jaTem = await db
    .select({ code: reviewRules.code })
    .from(reviewRules)
    .where(and(eq(reviewRules.orgId, org.id), inArray(reviewRules.code, codigos)));

  console.log(`  ${dentro.length} entram · ${fora.length} ficam de fora · ${jaTem.length} ja estavam`);
  for (const r of fora) console.log(`     fora: ${r.id}  (aplica_quando=${r.aplica_quando}, sem campo)`);

  if (!aplicar) {
    console.log("\nSimulacao — nada foi escrito. Acrescente a palavra `aplicar`.");
    return;
  }

  if (jaTem.length > 0) {
    await db.delete(reviewRules).where(and(eq(reviewRules.orgId, org.id), inArray(reviewRules.code, codigos)));
  }

  let n = 0;
  for (const [indice, r] of dentro.entries()) {
    const nomeEmpresa = EMPRESA_DE_APLICA[r.aplica_quando] ?? EMPRESA_DO_ESCOPO[r.escopo];
    const companyId = nomeEmpresa ? (porNome.get(nomeEmpresa) ?? null) : null;

    if (nomeEmpresa && !companyId) {
      throw new Error(`Empresa nao encontrada: ${nomeEmpresa} (regra ${r.id})`);
    }

    await db.insert(reviewRules).values({
      orgId: org.id,
      companyId,
      skill: null,
      format: EMPRESA_DE_APLICA[r.aplica_quando] ? null : (FORMATO_DE[r.aplica_quando] ?? null),
      code: r.id,
      text: r.regra,
      rationale: GRUPO_EXPLICADO[r.grupo],
      verifier: "maquina",
      isBlocking: r.veredito_quando_violada === "reprova",
      machineHint: r.como_verificar,
      isActive: true,
      position: (indice + 1) * 10,
    });
    n++;
  }

  console.log(`\n${n} regras gravadas em desenvolvimento.`);
}

main()
  .then(() => client.end())
  .catch(async (erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
