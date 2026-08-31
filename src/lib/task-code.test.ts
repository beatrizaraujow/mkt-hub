import assert from "node:assert/strict";
import test from "node:test";
import { caminhoDaTarefa, codigoDaTarefa, numeroDoCodigo } from "./task-code";

test("o codigo e o prefixo mais o numero", () => {
  assert.equal(codigoDaTarefa(1), "mkt-1");
  assert.equal(codigoDaTarefa(4291), "mkt-4291");
});

test("le o codigo de volta", () => {
  assert.equal(numeroDoCodigo("mkt-1"), 1);
  assert.equal(numeroDoCodigo("mkt-4291"), 4291);
});

test("link colado em conversa volta capitalizado, e ainda assim abre", () => {
  assert.equal(numeroDoCodigo("MKT-12"), 12);
  assert.equal(numeroDoCodigo("Mkt-12"), 12);
  assert.equal(numeroDoCodigo("  mkt-12  "), 12);
});

test("numero solto nao e codigo", () => {
  // Seria ambiguo com o UUID, e abrir a tarefa errada e pior que nao abrir.
  assert.equal(numeroDoCodigo("12"), null);
  assert.equal(numeroDoCodigo("7b94e943-acd2-4133-9bcc-2af87d82671d"), null);
});

test("o que `Number` aceitaria e um codigo nao aceita", () => {
  assert.equal(numeroDoCodigo("mkt-0x1f"), null);
  assert.equal(numeroDoCodigo("mkt-1e3"), null);
  assert.equal(numeroDoCodigo("mkt- 12"), null);
  assert.equal(numeroDoCodigo("mkt-12.5"), null);
  assert.equal(numeroDoCodigo("mkt--12"), null);
  assert.equal(numeroDoCodigo("mkt-"), null);
});

test("zero e negativo nao existem: a sequencia comeca em um", () => {
  assert.equal(numeroDoCodigo("mkt-0"), null);
  assert.equal(numeroDoCodigo("mkt--1"), null);
});

test("ida e volta", () => {
  for (const n of [1, 9, 10, 262, 1000, 99999]) {
    assert.equal(numeroDoCodigo(codigoDaTarefa(n)), n);
  }
});

test("o caminho canonico e Trabalho, que e onde o painel monta", () => {
  assert.equal(caminhoDaTarefa(123), "/trabalho?item=mkt-123");
});
