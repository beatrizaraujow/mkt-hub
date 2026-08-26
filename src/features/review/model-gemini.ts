import "server-only";
import {
  DEFAULT_MAX_TOKENS,
  ModelError,
  retryableStatus,
  type Block,
  type ModelAnswer,
  type ModelRequest,
} from "./model-contract";
import { geminiSchema, readGeminiAnswer, type GeminiBody } from "./model-gemini-read";

/**
 * O Gemini, por `fetch`.
 *
 * Existe porque a camada gratuita do Google é a única das gratuitas com saída
 * estruturada de primeira classe — e saída estruturada é inegociável aqui:
 * texto livre teria que ser interpretado, e interpretação de texto livre erra
 * em silêncio, transformando um parecer ilegível em "nenhum problema
 * encontrado".
 *
 * Este arquivo **não julga nada** e não conhece o outro provedor.
 */

/**
 * O padrão precisa ser um modelo liberado para projeto **novo**.
 *
 * O `gemini-2.5-flash` deixou de ser: chave criada depois do corte recebe
 * `404 ... is no longer available to new users`. A falha é boa — sai explícita,
 * com o substituto no corpo da resposta — mas custa uma rodada e um redeploy.
 * `GEMINI_MODEL` continua existindo para fixar outro.
 */
const DEFAULT_MODEL = "gemini-3.6-flash";

/**
 * A base é configurável para atravessar um gateway ou um proxy da empresa —
 * e é o que permite apontar os testes para um servidor local em vez de gastar
 * chamada de verdade. Sem chave nenhuma no meio.
 */
function endpoint(model: string): string {
  const base = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
  return `${base}/v1beta/models/${model}:generateContent`;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/* -------------------------------------------------------------- o pedido */

/** Os blocos do contrato no formato que o Gemini entende. */
function parts(content: Block[]) {
  return content.map((block) =>
    block.type === "text"
      ? { text: block.text }
      : { inlineData: { mimeType: block.source.media_type, data: block.source.data } },
  );
}

export async function askGemini(input: ModelRequest): Promise<ModelAnswer> {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new ModelError(
      "Falta GEMINI_API_KEY no ambiente: o revisor não tem como perguntar nada.",
      { retry: false },
    );
  }

  const model = geminiModel();
  let response: Response;

  try {
    response = await fetch(endpoint(model), {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: parts(input.content) }],
        tools: [
          {
            functionDeclarations: [
              {
                name: input.tool.name,
                description: input.tool.description,
                parameters: geminiSchema(input.tool.schema),
              },
            ],
          },
        ],
        /**
         * `ANY` com um nome só obriga a resposta a sair pela ferramenta. É o
         * equivalente do `tool_choice` fixo do outro provedor: ou vem no
         * formato, ou é erro explícito.
         */
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: [input.tool.name] },
        },
        generationConfig: {
          maxOutputTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
          // O mesmo parecer para a mesma entrada, na medida do possível.
          temperature: 0,
        },
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "erro desconhecido";
    throw new ModelError(`Não foi possível falar com o Gemini: ${detail}`, { retry: true });
  }

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new ModelError(`O Gemini respondeu ${response.status}: ${body}`, {
      retry: retryableStatus(response.status),
    });
  }

  return readGeminiAnswer((await response.json()) as GeminiBody, input.tool.name, model);
}
