/**
 * Lista o checklist cadastrado no banco apontado. So le.
 *
 *   npm run checklist:ver                     desenvolvimento
 *   npm run checklist:ver -- ../mkt-prod.env  producao
 *
 * Existe porque o catalogo do checklist e curto e decisivo: item demais vira
 * marcacao no automatico, e ai ele deixa de valer justamente nos poucos casos
 * em que era a unica defesa. Antes de acrescentar, olhe o que ja esta la.
 *
 * Sai separado por momento, que e a divisao que importa: sao dois checklists
 * com perguntas diferentes para pessoas diferentes, em etapas diferentes.
 */
import postgres from "postgres";
import { anunciarDestino, lerAmbienteDoArgumento } from "./destino";

lerAmbienteDoArgumento();
anunciarDestino();

const client = postgres(process.env.DATABASE_URL as string, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  onnotice: () => {},
});

type Linha = {
  texto: string;
  empresa: string | null;
  skill: string | null;
  formato: string | null;
  momento: string;
  ativo: boolean;
  medidor: boolean;
  laudo: boolean;
  aposAlteracao: boolean;
};

async function main() {
  const linhas = (await client`
    select i.text                  as "texto",
           c.name                  as "empresa",
           i.skill                 as "skill",
           i.format                as "formato",
           i.momento               as "momento",
           i.is_active             as "ativo",
           i.is_reliability_probe  as "medidor",
           i.depends_on_report     as "laudo",
           i.only_after_rework     as "aposAlteracao"
      from review_checklist_items i
      left join companies c on c.id = i.company_id
     order by i.momento desc, c.name nulls first, i.skill nulls first, i.position
  `) as unknown as Linha[];

  console.log(`\n${linhas.length} itens de checklist:`);

  let momentoAtual = "";

  for (const l of linhas) {
    if (l.momento !== momentoAtual) {
      momentoAtual = l.momento;
      console.log(
        l.momento === "aprovacao"
          ? "\n── Aprovacao · quem aprova responde, ao sair da Aprovacao"
          : "\n── Pre revisao · quem produz responde, ao sair da Pre revisao",
      );
    }

    const escopo = [
      l.empresa ?? "todas as marcas",
      l.skill ?? "todos os tipos",
      l.formato ?? "todos os formatos",
    ].join(" · ");

    const marcas = [
      l.medidor ? "medidor" : null,
      l.laudo ? "depende do laudo" : null,
      l.aposAlteracao ? "so apos alteracao" : null,
      l.ativo ? null : "inativo",
    ]
      .filter(Boolean)
      .join(", ");

    console.log(`  ${l.texto}`);
    console.log(`     ${escopo}${marcas ? `   [${marcas}]` : ""}`);
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
