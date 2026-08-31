/**
 * O de-para entre o board do ClickUp e o pipeline daqui.
 *
 * Mora fora dos scripts porque dois usam: o que importa e o que sincroniza. Uma
 * copia em cada um divergiria no dia em que alguem renomeasse um status — e a
 * divergencia apareceria como tarefa que simplesmente nao atravessa, sem erro
 * nenhum na tela.
 *
 * Puro de proposito: sem banco, sem rede, sem `server-only`. Da para testar
 * sem subir nada.
 */

/** Status do ClickUp, e onde cada um cai aqui. */
export const ETAPA_DE: Record<string, string> = {
  "solicitado form": "solicitado",
  pendente: "pendente",
  "em progresso": "em_andamento",
  alterar: "ajustar",
  "pré revisão": "pre_revisao",
  "revisão ia": "revisao_ia",
  aprovar: "aprovacao",
  "aprovação líder": "aprovacao_lider",
  publicar: "publicar",
  completo: "completo",
  "banco de criativos": "banco_criativos",
};

/**
 * As etapas de fim. Item que chega numa delas ganha data de conclusao.
 *
 * Sao as mesmas que pontuam (`ETAPAS_QUE_PONTUAM`), e nao por acaso: pontuar
 * uma etapa que nao marca conclusao daria ponto para trabalho que o sistema
 * ainda considera aberto.
 */
export const ETAPAS_DE_FIM = new Set(["completo", "banco_criativos"]);

/**
 * Normaliza status para casar com as chaves acima.
 *
 * O ClickUp devolve `"pendente "`, com espaco no fim, e `"Aprovação Líder"` com
 * maiuscula e acento. Casar texto cru falha em silencio: a tarefa nao atravessa
 * e ninguem descobre por que.
 */
export function chave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** O slug daqui para um status de la, ou `null` se o status for desconhecido. */
export function etapaDe(status: string): string | null {
  const alvo = chave(status);
  const direto = ETAPA_DE[alvo];
  if (direto) return direto;
  // As chaves acima tem acento; a normalizacao os tira dos dois lados.
  const semAcento = Object.entries(ETAPA_DE).find(([k]) => chave(k) === alvo);
  return semAcento ? semAcento[1] : null;
}
