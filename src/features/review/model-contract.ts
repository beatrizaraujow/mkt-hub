/**
 * O contrato entre o julgamento e quem quer que fale com o modelo.
 *
 * Fica num arquivo só, sem importar ninguém, porque os dois provedores
 * dependem dele e ele não pode depender de nenhum: é o que permite acrescentar
 * um terceiro sem tocar nos outros dois.
 *
 * Nada aqui julga nada. Leva a pergunta, traz a resposta.
 */

export type Provider = "anthropic" | "gemini";

/**
 * Falha que tentar de novo **resolve** (rede, limite de uso,
 * indisponibilidade) é diferente de falha que tentar de novo só repete (chave
 * ausente, pedido malformado). A fila usa essa distinção para não gastar três
 * tentativas no que já se sabe que não vai andar.
 */
export class ModelError extends Error {
  readonly retry: boolean;

  constructor(message: string, options: { retry: boolean }) {
    super(message);
    this.name = "ModelError";
    this.retry = options.retry;
  }
}

/**
 * O que se manda. Imagem e documento existem porque o caminho de leitura de
 * arquivo está guardado, desligado (ver `files.ts`) — e um contrato que não
 * previsse isso obrigaria a mexer nos dois provedores no dia de religar.
 */
export type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export type ModelRequest = {
  system: string;
  content: Block[];
  /** A saída é obrigada a sair por aqui. Texto livre não é opção. */
  tool: { name: string; description: string; schema: Record<string, unknown> };
  maxTokens?: number;
};

export type ModelAnswer = {
  /** O que a ferramenta devolveu, ainda sem validar. Quem valida é o chamador. */
  raw: unknown;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
};

/** Teto padrão de saída. Um parecer com dez achados cabe folgado. */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Classificação de status HTTP, igual para todo provedor: 429 e 5xx melhoram
 * na próxima tentativa; 4xx de pedido ou de chave, não.
 */
export function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
