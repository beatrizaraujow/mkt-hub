import assert from "node:assert/strict";
import { test } from "node:test";
import { geminiSchema, readGeminiAnswer } from "./model-gemini-read";
import { ModelError } from "./model-contract";

/* ------------------------------------------------------------- o esquema */

test("os tipos vão em maiúsculas, em qualquer profundidade", () => {
  const out = geminiSchema({
    type: "object",
    properties: {
      achados: {
        type: "array",
        items: { type: "object", properties: { regra: { type: "string" } } },
      },
    },
  }) as Record<string, never>;

  assert.deepEqual(out, {
    type: "OBJECT",
    properties: {
      achados: {
        type: "ARRAY",
        items: { type: "OBJECT", properties: { regra: { type: "STRING" } } },
      },
    },
  });
});

test("chave que o Gemini não conhece é removida, não repassada", () => {
  const out = geminiSchema({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    default: {},
    description: "fica",
    required: ["a"],
  }) as Record<string, unknown>;

  assert.deepEqual(Object.keys(out).sort(), ["description", "required", "type"]);
});

test("o que ele aceita passa intacto", () => {
  const out = geminiSchema({
    type: "string",
    description: "o código",
    enum: ["a", "b"],
    nullable: true,
    format: "enum",
  }) as Record<string, unknown>;

  assert.equal(out.description, "o código");
  assert.deepEqual(out.enum, ["a", "b"]);
  assert.equal(out.nullable, true);
  assert.equal(out.format, "enum");
});

test("o esquema real do parecer atravessa sem perder nada que importa", () => {
  const out = geminiSchema({
    type: "object",
    properties: {
      achados: {
        type: "array",
        items: {
          type: "object",
          properties: { regra: { type: "string" }, trecho: { type: "string" } },
          required: ["regra", "trecho"],
        },
      },
    },
    required: ["achados"],
  }) as { properties: { achados: { items: { required: string[] } } } };

  assert.deepEqual(out.properties.achados.items.required, ["regra", "trecho"]);
});

/* ------------------------------------------------------------ a resposta */

const OK = {
  modelVersion: "gemini-3.6-flash",
  usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 320 },
  candidates: [
    {
      finishReason: "STOP",
      content: {
        parts: [{ functionCall: { name: "registrar_parecer", args: { achados: [] } } }],
      },
    },
  ],
};

test("resposta boa devolve o argumento cru e o custo separado", () => {
  const answer = readGeminiAnswer(OK, "registrar_parecer", "gemini-3.6-flash");

  assert.deepEqual(answer.raw, { achados: [] });
  assert.equal(answer.model, "gemini-3.6-flash");
  assert.equal(answer.tokensIn, 1100);
  assert.equal(answer.tokensOut, 320);
});

test("sem uso relatado, o custo é nulo — nunca zero", () => {
  const answer = readGeminiAnswer(
    { ...OK, usageMetadata: undefined },
    "registrar_parecer",
    "gemini-3.6-flash",
  );

  // Zero diria "não gastou nada". Nulo diz "não sei", que é a verdade.
  assert.equal(answer.tokensIn, null);
  assert.equal(answer.tokensOut, null);
});

test("chamada com outro nome não é a nossa: não vira parecer", () => {
  assert.throws(
    () => readGeminiAnswer(OK, "outra_ferramenta", "gemini-3.6-flash"),
    (error: unknown) => error instanceof ModelError,
  );
});

test("resposta cortada pelo teto vale nova tentativa", () => {
  const cut = { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] };

  assert.throws(
    () => readGeminiAnswer(cut, "registrar_parecer", "m"),
    (error: unknown) => error instanceof ModelError && error.retry === true,
  );
});

test("recusa por segurança não melhora na terceira tentativa", () => {
  const blocked = { candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] };

  assert.throws(
    () => readGeminiAnswer(blocked, "registrar_parecer", "m"),
    (error: unknown) => error instanceof ModelError && error.retry === false,
  );
});

test("pedido barrado antes de rodar é falha explícita, sem repetição", () => {
  assert.throws(
    () => readGeminiAnswer({ promptFeedback: { blockReason: "SAFETY" } }, "x", "m"),
    (error: unknown) => error instanceof ModelError && error.retry === false,
  );
});

test("resposta sem candidato nenhum não vira parecer vazio", () => {
  // A falha mais perigosa deste sistema seria virar "aprovado" aqui.
  assert.throws(
    () => readGeminiAnswer({ candidates: [] }, "registrar_parecer", "m"),
    (error: unknown) => error instanceof ModelError && error.retry === true,
  );
});
