import assert from "node:assert/strict";
import { test } from "node:test";
import { semanaDe } from "@/lib/week";
import { percentualDaMeta, pontuar, type Entrega } from "./score";

const SEMANA = semanaDe("2026-08-27"); // 24/08 a 30/08

function entrega(over: Partial<Entrega> = {}): Entrega {
  return {
    id: crypto.randomUUID(),
    pessoaId: "zion",
    pontos: 5,
    etapa: "completo",
    concluidaEm: "2026-08-26",
    ...over,
  };
}

test("soma por pessoa dentro da semana", () => {
  const r = pontuar([entrega(), entrega({ pontos: 3 }), entrega({ pessoaId: "malu", pontos: 2 })], SEMANA);

  assert.deepEqual(r.linhas, [
    { pessoaId: "malu", pontos: 2, entregas: 1, semPonto: 0 },
    { pessoaId: "zion", pontos: 8, entregas: 2, semPonto: 0 },
  ]);
  assert.equal(r.total, 10);
});

test("não concluída não pontua, por mais pontos que tenha", () => {
  const r = pontuar([entrega({ concluidaEm: null, pontos: 99 })], SEMANA);

  assert.equal(r.linhas.length, 0);
  assert.equal(r.total, 0);
});

test("concluída fora da semana fica fora", () => {
  const r = pontuar(
    [entrega({ concluidaEm: "2026-08-23" }), entrega({ concluidaEm: "2026-08-31" })],
    SEMANA,
  );

  assert.equal(r.total, 0);
});

test("domingo conta para a semana que fecha nele", () => {
  // O caso que separa quem trabalhou no domingo de quem perdeu o ponto.
  const r = pontuar([entrega({ concluidaEm: "2026-08-30" })], SEMANA);

  assert.equal(r.total, 5);
});

test("etapa que não pontua não conta, mesmo concluída na semana", () => {
  // `aprovacao` é revisão: a peça pode voltar. Contar aqui seria pagar por
  // trabalho que ainda pode ser reprovado.
  const r = pontuar([entrega({ etapa: "aprovacao" })], SEMANA);

  assert.equal(r.total, 0);
});

test("a lista de etapas é parâmetro: mudar quando pontua é configuração", () => {
  const r = pontuar([entrega({ etapa: "aprovacao" })], SEMANA, ["aprovacao", "completo"]);

  assert.equal(r.total, 5);
});

test("banco de criativos pontua junto com completo", () => {
  const r = pontuar([entrega({ etapa: "banco_criativos", pontos: 4 })], SEMANA);

  assert.equal(r.total, 4);
});

test("entrega sem ponto é contada em separado, nunca somada como zero", () => {
  // O buraco que o board antigo não tinha: lá o ponto era obrigatório. Aqui a
  // coluna aceita nulo, e somar zero em silêncio esconderia o problema até o
  // fechamento não bater.
  const r = pontuar([entrega({ pontos: null }), entrega({ pontos: 5 })], SEMANA);

  assert.deepEqual(r.linhas, [{ pessoaId: "zion", pontos: 5, entregas: 2, semPonto: 1 }]);
  assert.equal(r.total, 5);
});

test("concluída sem responsável não some, é contada à parte", () => {
  const r = pontuar([entrega({ pessoaId: null })], SEMANA);

  assert.equal(r.semResponsavel, 1);
  assert.equal(r.linhas.length, 0);
});

test("o total fecha com a soma das linhas", () => {
  const r = pontuar(
    [entrega({ pontos: 3 }), entrega({ pontos: 8, pessoaId: "malu" }), entrega({ pontos: null })],
    SEMANA,
  );

  assert.equal(
    r.total,
    r.linhas.reduce((soma, linha) => soma + linha.pontos, 0),
  );
});

/* ------------------------------------------------------------------ meta */

test("sem meta cadastrada devolve null, que não é zero por cento", () => {
  // Pessoa sem régua não está com desempenho ruim: está sem configuração.
  assert.equal(percentualDaMeta(40, null), null);
  assert.equal(percentualDaMeta(40, 0), null);
});

test("percentual arredonda e passa de cem", () => {
  assert.equal(percentualDaMeta(40, 80), 50);
  assert.equal(percentualDaMeta(96, 80), 120);
  assert.equal(percentualDaMeta(41, 80), 51);
});
