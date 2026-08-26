import assert from "node:assert/strict";
import { test } from "node:test";
import { minCopyFor, quotesTheCopy } from "./copy";

test("roteiro exige texto de roteiro, stories cabe numa linha", () => {
  assert.equal(minCopyFor("Roteiro de vídeo", "Vídeo"), 120);
  assert.equal(minCopyFor("Stories", null), 12);
  assert.equal(minCopyFor("Arte de post", "Carrossel"), 25);
  assert.equal(minCopyFor(null, null), 25);
  assert.equal(minCopyFor("Arte de post", "Stories"), 12);
});

const COPY = "Compre agora   e ganhe 20% de desconto.\nSó até sexta, na loja toda!";

test("trecho literal é aceito mesmo com espaço e caixa diferentes", () => {
  assert.equal(quotesTheCopy(COPY, "compre AGORA e ganhe 20%"), true);
  assert.equal(quotesTheCopy(COPY, "Só até sexta"), true);
});

test("trecho que a peça não tem é recusado", () => {
  assert.equal(quotesTheCopy(COPY, "compre já"), false);
  assert.equal(quotesTheCopy(COPY, ""), false);
});

test("acento conta: é o que se está revisando", () => {
  assert.equal(quotesTheCopy(COPY, "so ate sexta"), false);
});

test("reticências no meio são corte de citação, e a ordem importa", () => {
  assert.equal(quotesTheCopy(COPY, "Compre agora ... na loja toda"), true);
  assert.equal(quotesTheCopy(COPY, "na loja toda … Compre agora"), false);
});

test("aspas em volta da citação não invalidam", () => {
  assert.equal(quotesTheCopy(COPY, '"Só até sexta"'), true);
  assert.equal(quotesTheCopy(COPY, "“Só até sexta”"), true);
});
