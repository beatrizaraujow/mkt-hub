/**
 * Traz as rotinas do MKT Hub 1 (mktimer45) para o MKT Hub 2. Idempotente:
 * pode rodar de novo sem duplicar — a chave e (empresa, plataforma, label).
 *
 *   npm run rotinas:importar               simula, nao escreve
 *   npm run rotinas:importar -- --aplicar  escreve
 *
 * **Aponta para desenvolvimento**, porque le `.env.local` como todo script
 * daqui. Para producao, sobrescreva `DATABASE_URL` no ambiente antes de
 * chamar — e confira o **usuario** da conexao, nunca o host: o pooler do
 * Supabase e o mesmo em dev e em producao, e o que separa os dois e o
 * `postgres.<ref>` antes do `@`.
 *
 * Lido em 27/08/2026 da tela "Check Semanal de Rotinas" do sistema antigo,
 * que tinha 62 rotinas ativas. Conferido contra o resumo agregado da API
 * dele: na quinta, Malu 11 ocorrencias e Zion 18 — o mesmo que este arquivo
 * produz. Foi essa conferencia que provou que o mapeamento de dias esta certo.
 *
 * Duas conversoes que nao sao copia:
 *
 * 1. **Dias.** O antigo usa 1=seg..7=dom; o novo usa 0=seg..6=dom. As mascaras
 *    abaixo vem da posicao na grade renderizada (seg..dom), que ja e a
 *    convencao nova — por isso nao ha subtracao no codigo. Errar isso desloca
 *    toda rotina em um dia e nao levanta erro nenhum.
 * 2. **Titulo.** No antigo o titulo carregava empresa e plataforma dentro do
 *    texto. Aqui a empresa e a linha da grade e a plataforma e o prefixo,
 *    entao `label` guarda so o que sai — respeitando o teto de 60 caracteres.
 *    O que distingue perfil ("Time", "vendedores") ficou, porque muda a peca.
 *
 * Duas escolhas que sao minhas e podem ser revistas:
 *
 * - **Sub-marca, nao empresa-mae.** O antigo so tinha ON/CB/SB/WV, com o nome
 *   da sub-marca dentro do titulo. Aqui "Stories da Carbone Club" e rotina de
 *   Carbone Club, nao de Carbone Educacao.
 * - **Plataforma "Operacao"** para as cinco rotinas que nao publicam em rede
 *   nenhuma — checar coluna, prioridades do dia, captacao. Sao rotina de
 *   verdade, mas misturadas com Instagram sujariam a leitura da grade.
 *
 * Fora do escopo: as 24 rotinas de Gustavo Rocha, que nao tem conta no Hub 2.
 * As tres mensais do sistema antigo eram todas dele — nenhuma frequencia
 * daqui precisa de coluna que o modelo novo nao tem.
 */
import { eq } from "drizzle-orm";
import { client, db } from "./index";
import { companies, routines, users } from "./schema";

const MALU = "marialuiza.mariz@grupoquatro5.com";
const ZION = "zion.bagatoli@grupoquatro5.com";

/** [empresa, plataforma, o que sai, dias seg..dom, responsavel] */
type Linha = [string, string, string, string, string];

const LINHAS: Linha[] = [
  // --------------------------------------------------------- Maria Luiza
  ["onevo-energia",       "Instagram", "3 Stories",                          "1111111", MALU],
  ["onevo-investimentos", "Instagram", "5 Stories",                          "1111111", MALU],
  ["carbone-club",        "Instagram", "5 Stories",                          "1111111", MALU],
  ["carbone-educacao",    "Instagram", "8 Stories",                          "1111111", MALU],
  ["seubone",             "Instagram", "1 feed — Time SeuBoné",              "1000000", MALU],
  ["seubone",             "TikTok",    "1 vídeo — perfil SeuBoné",           "1010100", MALU],
  ["seubone",             "Instagram", "5 Stories",                          "1111111", MALU],
  ["seubone",             "Instagram", "3 Stories — Time SeuBoné",           "1010100", MALU],
  ["seubone",             "TikTok",    "Responder interações",               "1111100", MALU],
  ["seubone",             "Instagram", "Responder comentários e DM — Time",  "1111100", MALU],
  ["onevo",               "Instagram", "3 Stories — Time Onevo",             "0101000", MALU],
  ["onevo",               "Instagram", "1 feed — Time Onevo",                "0010000", MALU],
  ["seubone",             "Instagram", "Repostar conteúdo UGC",              "1111111", MALU],
  ["pedro-galvao-p2p",    "Instagram", "1 feed",                             "0010010", MALU],
  ["cassio-maia-p2p",     "Instagram", "1 feed",                             "0100000", MALU],
  ["weevo",               "Instagram", "3 Stories",                          "1111100", MALU],
  ["weevo",               "Instagram", "UGC nos stories, 2x na semana",      "0101000", MALU],
  ["weevo",               "Operação",  "Captação com Godoy ou Rai — 30 min", "0010000", MALU],
  // ---------------------------------------------------------------- Zion
  ["onevo-energia",       "Instagram", "Responder comentários e DM",         "1111111", ZION],
  ["onevo-investimentos", "Instagram", "Responder comentários e DM",         "1111111", ZION],
  ["onevo-energia",       "Instagram", "1 feed",                             "1010100", ZION],
  // Duas rotinas iguais no sistema antigo, com um dia de diferenca. Provavel
  // duplicata — importadas como estao, com o dia no nome, em vez de fundidas
  // ou descartadas por conta propria.
  ["onevo-investimentos", "Instagram", "1 feed (ter · qui · sáb)",           "0101010", ZION],
  ["onevo-investimentos", "Instagram", "1 feed (ter · qui · dom)",           "0101001", ZION],
  ["carbone-club",        "Instagram", "Responder comentários e DM",         "1111111", ZION],
  ["carbone-educacao",    "Instagram", "Responder comentários e DM",         "1111111", ZION],
  ["carbone-club",        "Instagram", "1 feed",                             "1111111", ZION],
  ["carbone-educacao",    "Instagram", "1 feed",                             "1111111", ZION],
  ["seubone",             "Instagram", "Responder comentários e DM",         "1111111", ZION],
  ["seubone",             "Instagram", "1 feed",                             "1111111", ZION],
  ["seubone",             "Instagram", "1 feed — vendedores",                "0010000", ZION],
  ["seubone",             "Instagram", "Verificar DM dos vendedores",        "1111100", ZION],
  ["seubone",             "Instagram", "Postar 100% do UGC do dia",          "1111111", ZION],
  // O antigo marcava so "CB", sem dizer qual Carbone. Ficou na mae.
  ["carbone-educacao",    "Instagram", "UGC no feed, 1x por dia",            "1111100", ZION],
  ["seubone",             "Operação",  "Checar coluna de aprovar",           "1111100", ZION],
  ["seubone",             "Operação",  "Prioridades do dia e prazos",        "1111100", ZION],
  ["onevo",               "Operação",  "Prioridades do dia e prazos",        "1111100", ZION],
  ["carbone-educacao",    "Operação",  "Prioridades do dia e prazos",        "1111100", ZION],
  ["weevo",               "Instagram", "1 feed",                             "1111100", ZION],
];

/** "1010100" -> [0, 2, 4]. Segunda e o indice zero, como em `lib/month`. */
function diasDe(mascara: string): number[] {
  return [...mascara].flatMap((caractere, indice) => (caractere === "1" ? [indice] : []));
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const empresas = new Map(
    (
      await db
        .select({ id: companies.id, slug: companies.slug, orgId: companies.orgId })
        .from(companies)
    ).map((empresa) => [empresa.slug, empresa]),
  );

  const pessoas = new Map(
    (
      await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.isActive, true))
    ).map((pessoa) => [pessoa.email, pessoa.id]),
  );

  const existentes = new Set(
    (
      await db
        .select({ empresa: routines.companyId, plataforma: routines.platform, label: routines.label })
        .from(routines)
    ).map((rotina) => `${rotina.empresa}|${rotina.plataforma}|${rotina.label}`),
  );

  let criadas = 0;
  let puladas = 0;
  const problemas: string[] = [];

  for (const [slug, plataforma, label, mascara, email] of LINHAS) {
    const empresa = empresas.get(slug);
    const responsavel = pessoas.get(email);
    const weekdays = diasDe(mascara);

    if (!empresa) {
      problemas.push(`empresa ausente: ${slug}`);
      continue;
    }
    if (!responsavel) {
      problemas.push(`pessoa ausente: ${email} (${label})`);
      continue;
    }
    if (label.length > 60) {
      problemas.push(`label com ${label.length} caracteres: ${label}`);
      continue;
    }
    if (weekdays.length === 0) {
      problemas.push(`sem dia nenhum: ${label}`);
      continue;
    }

    const chave = `${empresa.id}|${plataforma}|${label}`;
    if (existentes.has(chave)) {
      puladas++;
      continue;
    }
    existentes.add(chave);

    if (aplicar) {
      await db.insert(routines).values({
        orgId: empresa.orgId,
        companyId: empresa.id,
        platform: plataforma,
        label,
        weekdays,
        assigneeId: responsavel,
      });
    }
    criadas++;
  }

  console.log(aplicar ? "Aplicado." : "Simulacao — nada foi escrito. Use -- --aplicar.");
  console.log(`  criadas: ${criadas}   ja existiam: ${puladas}   problemas: ${problemas.length}`);
  for (const problema of problemas) console.log(`  ! ${problema}`);
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
