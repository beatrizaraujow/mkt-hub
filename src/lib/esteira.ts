/**
 * A esteira: por onde uma peça pode andar, e por onde não pode.
 *
 * O desenho é curto de dizer e a implementação existe para não deixar exceção
 * silenciosa: **toda entrega chega em Aprovação passando por Pré revisão e
 * Revisão IA.** A única porta que pula isso é a exceção declarada, e mesmo ela
 * para em Aprovação — a exceção tira a máquina do caminho, nunca a pessoa.
 *
 * Puro de propósito: sem banco, sem `server-only`. O servidor usa para recusar
 * e o cliente para não oferecer o que vai ser recusado. A recusa que conta é
 * sempre a do servidor — esconder o arrasto na tela é conforto, não trava.
 *
 * **O que este arquivo protege é o buraco que existia antes dele.** Até aqui
 * nada impedia arrastar de "Em andamento" direto para "Aprovar", nem marcar a
 * tarefa como concluída pela caixinha da lista e pular a esteira inteira. Uma
 * esteira com uma porta lateral aberta não é uma esteira.
 */
import { presentationFor } from "./stages";

/** Antes da esteira: aqui a exceção ainda pode ser declarada por quem produz. */
const ANTES = new Set(["solicitado", "pendente", "em_andamento"]);

/** A esteira propriamente dita. `ajustar` é o retorno dela, não uma etapa nova. */
const NA_ESTEIRA = new Set(["pre_revisao", "revisao_ia"]);

const APROVACOES = new Set(["aprovacao", "aprovacao_lider"]);

/** Depois da aprovação. Nada chega aqui sem alguém ter aprovado. */
const DEPOIS = new Set(["publicar", "completo", "banco_criativos"]);

export type Passagem = { ok: true } | { ok: false; motivo: string };

const LIBERADO: Passagem = { ok: true };

function barra(motivo: string): Passagem {
  return { ok: false, motivo };
}

function rotulo(slug: string): string {
  return presentationFor(slug)?.label ?? slug;
}

function posicao(slug: string | null | undefined): number | null {
  return presentationFor(slug)?.position ?? null;
}

export type Movimento = {
  /** Slug da etapa de origem. Nulo quando a etapa não é do pipeline de tarefa. */
  de: string | null | undefined;
  para: string;
  /**
   * Subtarefa não é peça.
   *
   * A esteira existe para o que vai ao ar; uma subtarefa é um pedaço de
   * trabalho dentro da peça, e mandar cada uma passar por Pré revisão, Revisão
   * IA e Aprovação transformaria a caixinha de riscar item numa via-crúcis de
   * três etapas. Quem atravessa a esteira é a tarefa-mãe.
   */
  ehSubtarefa: boolean;
  /** A exceção declarada está marcada neste item. */
  isento: boolean;
  /** ...e com motivo preenchido. Marcar sem motivo não vale como marcado. */
  temMotivo: boolean;
};

/**
 * Este movimento pode acontecer?
 *
 * Só olha para frente. Voltar a peça — para ajuste, para a pré revisão, para o
 * começo — nunca é barrado aqui: quem devolve já viu o que estava errado, e
 * exigir cerimônia para devolver só ensinaria o time a empurrar para frente.
 */
export function podeAtravessar(mov: Movimento): Passagem {
  if (mov.ehSubtarefa) return LIBERADO;

  const origem = posicao(mov.de);
  const destino = posicao(mov.para);

  /*
   * Etapa que não é do pipeline de tarefa — conteúdo, captação, ou um slug
   * novo que ninguém desenhou ainda. Barrar o que não se conhece transformaria
   * qualquer etapa nova em parede sem mensagem.
   */
  if (origem === null || destino === null) return LIBERADO;

  // Voltar e andar de lado passam. A esteira só se impõe para frente.
  if (destino <= origem) return LIBERADO;

  const de = mov.de as string;

  /*
   * Peça marcada não entra na esteira: a marcação diz justamente que a revisão
   * não acrescentaria nada, e mandá-la para lá gastaria IA para produzir um
   * laudo que ninguém pediu. O caminho de volta existe e é o líder desmarcar.
   */
  if (mov.isento && NA_ESTEIRA.has(mov.para)) {
    return barra(
      `Esta peça está marcada como "não precisa de revisão automática". ` +
        `Para mandá-la para ${rotulo(mov.para)}, desmarque a exceção primeiro.`,
    );
  }

  // Pular a Pré revisão é pular o checklist de quem produziu.
  if (mov.para === "revisao_ia" && ANTES.has(de)) {
    return barra(`A Pré revisão vem antes da Revisão IA. Mande a peça para Pré revisão primeiro.`);
  }

  /*
   * O portão da aprovação. É aqui que a exceção declarada tem efeito, e é o
   * único lugar onde ela tem.
   */
  if (APROVACOES.has(mov.para) && (ANTES.has(de) || de === "pre_revisao")) {
    if (!mov.isento) {
      return de === "pre_revisao"
        ? barra(
            `Falta a Revisão IA. Mande a peça para Revisão IA, ou marque "não precisa de ` +
              `revisão automática" com o motivo, ainda em Em andamento.`,
          )
        : barra(
            `Esta peça ainda não passou pela Pré revisão nem pela Revisão IA. Mande para Pré ` +
              `revisão, ou marque "não precisa de revisão automática" com o motivo.`,
          );
    }

    if (!mov.temMotivo) {
      return barra(
        `A exceção está marcada sem motivo. Escolha o motivo antes de mandar a peça para ` +
          `${rotulo(mov.para)}.`,
      );
    }

    if (mov.para !== "aprovacao") {
      return barra(
        `A exceção leva a peça para Aprovação, e é lá que ela é conferida por uma pessoa. ` +
          `De Aprovação ela segue normalmente.`,
      );
    }

    return LIBERADO;
  }

  /*
   * Depois da aprovação. Vale para a peça marcada do mesmo jeito: a exceção
   * dispensa a máquina, nunca o aval de gente.
   */
  if (DEPOIS.has(mov.para) && !APROVACOES.has(de) && !DEPOIS.has(de)) {
    return barra(
      `Nada chega em ${rotulo(mov.para)} sem passar pela Aprovação — nem peça marcada como ` +
        `"não precisa de revisão automática".`,
    );
  }

  return LIBERADO;
}

/**
 * A exceção pode ser marcada ou desmarcada agora?
 *
 * Ela é um campo de quem produz, e vale enquanto a peça ainda não entrou na
 * esteira. Assim que entra em Pré revisão o campo tranca: sem isso, quem
 * recebesse um laudo ruim marcaria a exceção no meio do caminho e escaparia
 * dele — que é a única forma de fraude que este desenho comporta.
 *
 * O líder passa em qualquer etapa, porque ele já pode aprovar por exceção de
 * qualquer forma. O que muda é o registro: marcada por ele depois da esteira
 * ter começado, a saída é `aprovacao_excecao`, não `declarada`.
 */
export function podeMarcarExcecao(slug: string | null | undefined, ehLider: boolean): boolean {
  if (ehLider) return true;
  const posicaoAtual = posicao(slug);
  if (posicaoAtual === null) return true;
  return ANTES.has(slug as string);
}

/** Onde a marcação aconteceu decide qual das três saídas ela é. */
export function saidaDe(slug: string | null | undefined): "declarada" | "aprovacao_excecao" {
  return ANTES.has(slug ?? "") ? "declarada" : "aprovacao_excecao";
}

export const ETAPAS_ANTES_DA_ESTEIRA = ANTES;
