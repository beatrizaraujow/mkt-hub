import { ModelError, type ModelAnswer } from "./model-contract";

/**
 * O dialeto do Gemini: traduzir o esquema na ida, entender a resposta na
 * volta.
 *
 * Fica separado de `model-gemini.ts` porque aquele arquivo é `server-only` e
 * não carrega em teste de linha de comando. Estas são as duas partes que mais
 * mudam entre versões da API e as que ninguém quer descobrir quebradas em
 * produção, no meio de um parecer — então são as duas que precisam de teste.
 */

/* ------------------------------------------------------------- o esquema */

/** O que o Gemini aceita dentro de `parameters`. O resto ele recusa com 400. */
const KEEP = new Set([
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
]);

/**
 * Traduz o esquema para o dialeto do Gemini.
 *
 * Ele não aceita JSON Schema inteiro: é um recorte do OpenAPI, os tipos vão em
 * maiúsculas e qualquer chave desconhecida — `additionalProperties`, `$schema`,
 * `default` — derruba o pedido inteiro com 400. Como o esquema vem de quem
 * chama, a limpeza acontece aqui, na fronteira, e não vira regra que o
 * julgamento precisa lembrar.
 */
export function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!KEEP.has(key)) continue;

    if (key === "type" && typeof value === "string") {
      out.type = value.toUpperCase();
      continue;
    }

    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, sub]) => [
          name,
          geminiSchema(sub),
        ]),
      );
      continue;
    }

    out[key] = key === "items" ? geminiSchema(value) : value;
  }

  return out;
}

/* ------------------------------------------------------------ a resposta */

export type GeminiBody = {
  candidates?: Array<{
    content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
};

/** Motivos de parada que a próxima tentativa não conserta. */
const HOPELESS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);

/**
 * Lê a resposta e diz o que aconteceu. Puro de propósito: é a parte que mais
 * varia entre versões da API e a que ninguém quer descobrir quebrada em
 * produção, no meio de um parecer.
 */
export function readGeminiAnswer(
  body: GeminiBody,
  toolName: string,
  fallbackModel: string,
): ModelAnswer {
  if (body.promptFeedback?.blockReason) {
    throw new ModelError(
      `O Gemini recusou o pedido (${body.promptFeedback.blockReason}).`,
      { retry: false },
    );
  }

  const candidate = body.candidates?.[0];
  if (!candidate) {
    throw new ModelError("O Gemini respondeu sem nenhum candidato.", { retry: true });
  }

  const call = candidate.content?.parts?.find(
    (part) => part.functionCall && part.functionCall.name === toolName,
  )?.functionCall;

  if (!call) {
    const reason = candidate.finishReason ?? "?";

    if (reason === "MAX_TOKENS") {
      /**
       * Resposta cortada no meio. Vale repetir; o que não vale é deduzir
       * "sem achados" de algo que não chegou inteiro.
       */
      throw new ModelError("A resposta do Gemini foi cortada pelo teto de tokens.", {
        retry: true,
      });
    }

    throw new ModelError(`O Gemini não respondeu pela ferramenta (${reason}).`, {
      retry: !HOPELESS.has(reason),
    });
  }

  return {
    raw: call.args ?? {},
    model: body.modelVersion ?? fallbackModel,
    tokensIn: body.usageMetadata?.promptTokenCount ?? null,
    tokensOut: body.usageMetadata?.candidatesTokenCount ?? null,
  };
}
