import "server-only";
import {
  DEFAULT_MAX_TOKENS,
  ModelError,
  retryableStatus,
  type ModelAnswer,
  type ModelRequest,
} from "./model-contract";

/**
 * A Anthropic, por `fetch`.
 *
 * Sem SDK: é uma chamada e um formato de resposta. Uma dependência a mais é
 * peso permanente — versão para acompanhar, superfície para auditar — e não
 * economiza nada aqui.
 *
 * Este arquivo **não julga nada** e não conhece o outro provedor.
 */

const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

/** Ver a nota em `model-gemini.ts`: a base existe para gateway e para teste. */
function endpoint(): string {
  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  return `${base}/v1/messages`;
}

/** O modelo é configuração, não constante: muda sem deploy quando precisar. */
export function anthropicModel(): string {
  return process.env.REVIEW_MODEL || DEFAULT_MODEL;
}

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Pergunta e obriga a resposta a sair pela ferramenta.
 *
 * Texto livre teria que ser interpretado, e interpretação de texto livre erra
 * em silêncio: um parecer que não deu para ler viraria "nenhum problema
 * encontrado". Com `tool_choice` fixo, ou vem no formato ou é erro explícito.
 */
export async function askAnthropic(input: ModelRequest): Promise<ModelAnswer> {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    throw new ModelError(
      "Falta ANTHROPIC_API_KEY no ambiente: o revisor não tem como perguntar nada.",
      { retry: false },
    );
  }

  const model = anthropicModel();
  let response: Response;

  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
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
    throw new ModelError(`Modelo respondeu ${response.status}: ${body}`, {
      retry: retryableStatus(response.status),
    });
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
     * parecer vazio a partir de algo que não chegou.
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
