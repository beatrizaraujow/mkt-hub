import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_REJECTIONS, shouldEscalate, verdictFrom } from "./verdict";

const ok = { isBlocking: false };
const grave = { isBlocking: true };

test("nada encontrado, passa", () => {
  assert.equal(verdictFrom([]), "aprovado");
});

test("só achado negociável manda ajustar, nunca reprova", () => {
  assert.equal(verdictFrom([ok]), "ajustar");
  assert.equal(verdictFrom([ok, ok, ok]), "ajustar");
});

test("um inegociável reprova, mesmo sozinho", () => {
  assert.equal(verdictFrom([grave]), "reprovado");
});

test("muitos de cada: o inegociável decide, e a ordem não importa", () => {
  assert.equal(verdictFrom([ok, ok, grave, ok]), "reprovado");
  assert.equal(verdictFrom([grave, ok, grave, ok, ok]), "reprovado");
  assert.equal(verdictFrom([ok, grave]), verdictFrom([grave, ok]));
});

test("a quantidade de achados não muda o veredito", () => {
  const muitos = Array.from({ length: 40 }, () => ok);
  assert.equal(verdictFrom(muitos), "ajustar");
});

test("escalona só na terceira reprovação seguida", () => {
  assert.equal(shouldEscalate([], "reprovado"), false);
  assert.equal(shouldEscalate(["reprovado"], "reprovado"), false);
  assert.equal(shouldEscalate(["reprovado", "reprovado"], "reprovado"), true);
});

test("aprovar no meio zera a contagem", () => {
  assert.equal(shouldEscalate(["reprovado", "aprovado", "reprovado"], "reprovado"), false);
  assert.equal(shouldEscalate(["reprovado", "reprovado", "ajustar"], "reprovado"), false);
});

test("quem não reprova agora nunca escalona", () => {
  assert.equal(shouldEscalate(["reprovado", "reprovado"], "aprovado"), false);
  assert.equal(shouldEscalate(["reprovado", "reprovado"], "ajustar"), false);
});

test("ciclo sem veredito (falhou, incompleto) corta a sequência", () => {
  assert.equal(shouldEscalate(["reprovado", null], "reprovado"), false);
});

test("o teto é o que a constante diz", () => {
  const seguidas = Array.from({ length: MAX_REJECTIONS - 1 }, () => "reprovado" as const);
  assert.equal(shouldEscalate(seguidas, "reprovado"), true);
  assert.equal(shouldEscalate(seguidas.slice(1), "reprovado"), MAX_REJECTIONS <= 2);
});
