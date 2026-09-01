/**
 * A exceção declarada: "esta peça não precisa de revisão automática".
 *
 * É a **única** porta que pula a revisão. Toda entrega que não passa por aqui
 * só chega em Aprovação atravessando Pré revisão e Revisão IA — a trava está
 * em `lib/esteira`, e este arquivo é só o vocabulário.
 *
 * Puro de propósito: sem banco, sem `server-only`. A tela precisa dos rótulos
 * para desenhar a lista, e o servidor precisa da mesma lista para recusar o que
 * não está nela. Duas cópias divergiriam no dia em que alguém acrescentasse um
 * motivo, e a divergência apareceria como "motivo inválido" num motivo que a
 * própria tela ofereceu.
 */

/**
 * As três saídas que parecem iguais e não são.
 *
 * Cada uma mede um problema diferente da operação, e por isso são gravadas
 * separadas. Juntar as três num campo só de "pulou a revisão" apagaria
 * exatamente a informação que interessa:
 *
 *   `fora_do_piloto`      quem decide é o sistema, porque a marca não tem
 *                         manual cadastrado. Mede quantas marcas faltam.
 *   `declarada`           quem decide é quem produz, **antes** da esteira.
 *                         Mede se a exceção virou atalho.
 *   `aprovacao_excecao`   quem decide é o líder, **depois** da esteira ter
 *                         começado. Mede se a esteira está atrapalhando.
 *
 * `fora_do_piloto` não mora numa coluna: ela é derivada do desligamento por
 * marca (`review_settings`), que é onde a decisão de verdade está. As duas
 * outras são o mesmo campo, e o que as separa é a etapa em que a marcação
 * aconteceu.
 */
export type TipoDeSaida = "fora_do_piloto" | "declarada" | "aprovacao_excecao";

export type MotivoExcecao =
  | "republicacao"
  | "registro_cru"
  | "recebido_pronto"
  | "nao_vai_ao_ar"
  | "processo"
  | "melhoria"
  | "outro";

/**
 * Lista fechada. Não existe marcar sem motivo, e não existe motivo digitado
 * livre — menos `outro`, que exige justificativa escrita justamente para
 * poder ser lida depois.
 *
 * Se `outro` virar o motivo mais usado, falta um item nesta lista. É a leitura
 * que o relatório mensal existe para permitir.
 */
export const MOTIVOS: Array<{ value: MotivoExcecao; label: string }> = [
  { value: "republicacao", label: "Republicação de peça que já foi aprovada antes" },
  { value: "registro_cru", label: "Registro cru sem tratamento (bastidor, story de evento, print)" },
  { value: "recebido_pronto", label: "Material recebido pronto de terceiro (parceiro, cliente, imprensa)" },
  { value: "nao_vai_ao_ar", label: "Peça que não vai ao ar (teste interno, mockup para reunião)" },
  { value: "processo", label: "Organização de processo / Arquivo" },
  { value: "melhoria", label: "Melhoria" },
  { value: "outro", label: "Outro" },
];

/** O único motivo que exige texto. Sem ele a marcação não vale. */
export const MOTIVO_LIVRE: MotivoExcecao = "outro";

export const JUSTIFICATIVA_MIN = 12;
export const JUSTIFICATIVA_MAX = 500;

const POR_VALOR = new Map(MOTIVOS.map((motivo) => [motivo.value, motivo.label]));

export function motivoValido(valor: string | null | undefined): valor is MotivoExcecao {
  return typeof valor === "string" && POR_VALOR.has(valor as MotivoExcecao);
}

/** O rótulo, ou o próprio código quando alguém apagar um motivo da lista. */
export function rotuloMotivo(valor: string | null | undefined): string {
  if (!valor) return "sem motivo";
  return POR_VALOR.get(valor as MotivoExcecao) ?? valor;
}

/**
 * O item que substitui "Li o laudo e assumo os pontos de atenção que sobraram"
 * no checklist de aprovação de uma peça marcada.
 *
 * Não existe laudo para ler, então o item original não faz sentido. O que fica
 * no lugar faz o líder **co-assinar** a exceção em vez de herdar em silêncio a
 * decisão de outra pessoa.
 */
export const CONFIRMACAO_DA_EXCECAO =
  "Confirmo que esta peça não precisava de revisão automática, e o motivo declarado está correto.";

/**
 * O teto sugerido de uso mensal, em porcentagem das entregas.
 *
 * Sugestão de partida, não regra: quem define é a diretoria. Se a porcentagem
 * subir muito, ou o time achou um atalho, ou a esteira está pedindo revisão de
 * coisa que não precisa — nos dois casos quem muda é o processo, não a pessoa.
 */
export const TETO_SUGERIDO = 20;
