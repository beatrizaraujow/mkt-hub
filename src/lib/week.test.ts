import assert from "node:assert/strict";
import { test } from "node:test";
import { dentroDa, mondayOf, semanaDe, shiftWeek, sundayOf, weekIdOf } from "./week";

/*
  A fronteira da semana é onde este tipo de cálculo erra, e o erro não aparece:
  o fechamento fica alguns pontos fora e ninguém sabe de quem. Domingo e a
  virada de ano são os dois casos que quebram quem usa `getDay()` cru.
*/

test("domingo pertence à semana que começou na segunda anterior", () => {
  // 30/08/2026 é domingo. Com `getDay()` cru ele viraria o começo de uma
  // semana que ainda não chegou, e o trabalho de domingo cairia na semana
  // seguinte — depois do fechamento.
  assert.equal(mondayOf("2026-08-30"), "2026-08-24");
  assert.equal(sundayOf("2026-08-24"), "2026-08-30");
});

test("segunda é o primeiro dia, e é dela mesma", () => {
  assert.equal(mondayOf("2026-08-24"), "2026-08-24");
});

test("a semana atravessa a virada de mês sem se partir", () => {
  assert.equal(mondayOf("2026-09-01"), "2026-08-31");
  assert.equal(sundayOf("2026-08-31"), "2026-09-06");
});

test("o identificador usa o ano da quinta-feira, não o do dia", () => {
  // 31/12/2026 é quinta. 01/01/2027 cai na mesma semana e precisa receber o
  // mesmo identificador — senão o ano novo abre com uma semana de um dia só e
  // ninguém sabe para qual fechamento ela conta.
  assert.equal(weekIdOf("2026-12-31"), weekIdOf("2027-01-01"));
  assert.equal(weekIdOf("2026-12-31"), "2026-W53");
});

test("a primeira semana do ano é a que contém a primeira quinta", () => {
  // 01/01/2026 é quinta, então a semana 1 de 2026 começa em 29/12/2025.
  assert.equal(weekIdOf("2026-01-01"), "2026-W01");
  assert.equal(mondayOf("2026-01-01"), "2025-12-29");
  // E 29/12/2025, apesar de ser 2025, pertence à semana 1 de 2026.
  assert.equal(weekIdOf("2025-12-29"), "2026-W01");
});

test("semanas consecutivas incrementam de um", () => {
  assert.equal(weekIdOf("2026-08-24"), "2026-W35");
  assert.equal(weekIdOf("2026-08-31"), "2026-W36");
});

test("shiftWeek anda de sete em sete e cai sempre na segunda", () => {
  assert.equal(shiftWeek("2026-08-27", -1), "2026-08-17");
  assert.equal(shiftWeek("2026-08-27", 1), "2026-08-31");
  assert.equal(shiftWeek("2026-08-27", 0), "2026-08-24");
});

test("semanaDe devolve o trio coerente", () => {
  assert.deepEqual(semanaDe("2026-08-27"), {
    id: "2026-W35",
    inicio: "2026-08-24",
    fim: "2026-08-30",
  });
});

test("dentroDa inclui as duas pontas", () => {
  const semana = semanaDe("2026-08-27");

  assert.equal(dentroDa(semana, "2026-08-24"), true);
  assert.equal(dentroDa(semana, "2026-08-30"), true);
  assert.equal(dentroDa(semana, "2026-08-23"), false);
  assert.equal(dentroDa(semana, "2026-08-31"), false);
});
