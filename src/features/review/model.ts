import "server-only";

/**
 * A chamada ao modelo, por `fetch`.
 *
 * Sem SDK: são duas chamadas e um formato de resposta. Uma dependência a mais
 * é peso permanente — versão para acompanhar, superfície para auditar — e não
 * economiza nada aqui.
 *
 * Este arquivo **não julga nada**. Ele leva a pergunta e traz a resposta. Quem
 * decide é `judge.ts`, e a fronteira é de propósito: trocar de modelo um dia
 * não pode obrigar a reescrever o raciocínio.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** O modelo é configuração, não constante: muda sem deploy quando precisar. */
export function modelName() {
  return process.env.REVIEW_MODEL || "claude-sonnet-5";
}

export function modelConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Falha que tentar de novo **resolve** (rede, limite de uso, indisponibilidade)
 * é diferente de falha que tentar de novo só repete (chave ausente, pedido
 * malformado). A fila usa essa distinção para não gastar três tentativas no
 * que já se sabe que não vai andar.
 */
export class ModelError extends Error {
  readonly retry: boolean;

  constructor(message: string, options: { retry: boolean }) {
    super(message);
    this.name = "ModelError";
    this.retry = options.retry;
  }
}

export type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export type ModelAnswer = {
  /** O que a ferramenta devolveu, ainda sem validar. Quem valida é o chamador. */
  raw: unknown;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
};

/**
 * Pergunta e obriga a resposta a sair pela ferramenta.
 *
 * Texto livre teria que ser interpretado, e interpretação de texto livre erra
 * em silêncio: um parecer que não deu para ler viraria "nenhum problema
 * encontrado". Com `tool_choice` fixo, ou vem no formato ou é erro explícito.
 */
export async function askModel(input: {
  system: string;
  content: Block[];
  tool: { name: string; description: string; schema: Record<string, unknown> };
  maxTokens?: number;
}): Promise<ModelAnswer> {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    throw new ModelError(
      "Falta ANTHROPIC_API_KEY no ambiente: o revisor não tem como perguntar nada.",
      { retry: false },
    );
  }

  const model = modelName();
  let response: Response;

  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: input.maxTokens ?? 4096,
        system: input.system,
        messages: [{ role: "user", content: input.content }],
        tools: [
          {
            name: input.tool.name,
            description: input.tool.description,
            input_schema: input.tool.schema,
          },
        ],
        tool_choice: { type: "tool", name: input.tool.name },
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "erro desconhecido";
    throw new ModelError(`Não foi possível falar com o modelo: ${detail}`, { retry: true });
  }

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    // 429 e 5xx passam; 4xx de pedido ou de chave não passa nunca.
    const retry = response.status === 429 || response.status >= 500;
    throw new ModelError(`Modelo respondeu ${response.status}: ${body}`, { retry });
  }

  const data = (await response.json()) as {
    model?: string;
    content?: Array<{ type: string; name?: string; input?: unknown }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string;
  };

  const call = data.content?.find(
    (block) => block.type === "tool_use" && block.name === input.tool.name,
  );

  if (!call) {
    /**
     * Acontece quando a resposta foi cortada no meio pelo teto de tokens. Vale
     * repetir: a próxima tentativa costuma caber. O que não vale é inventar um
     * parecer vazio a partir de uma resposta que não chegou.
     */
    throw new ModelError(
      `O modelo não respondeu pela ferramenta (stop_reason: ${data.stop_reason ?? "?"}).`,
      { retry: true },
    );
  }

  return {
    raw: call.input,
    model: data.model ?? model,
    tokensIn: data.usage?.input_tokens ?? null,
    tokensOut: data.usage?.output_tokens ?? null,
  };
}
