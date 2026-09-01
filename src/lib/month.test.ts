import assert from "node:assert/strict";
import test from "node:test";
import { isMonth, monthBounds, monthLabel, monthOf, shiftMonth } from "./month";

test("o mês sai da data sem passar por Date", () => {
  /*
   * `new Date("2026-08-01")` é meia-noite UTC, que no Brasil ainda é 31 de
   * julho. A semana que fecha no dia primeiro cairia no mês anterior.
   */
  assert.equal(monthOf("2026-08-01"), "2026-08");
  assert.equal(monthOf("2026-08-31"), "2026-08");
  assert.equal(monthOf("2026-12-31"), "2026-12");
});

test("os limites pegam o último dia certo, inclusive fevereiro bissexto", () => {
  assert.deepEqual(monthBounds("2026-08"), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(monthBounds("2026-09"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(monthBounds("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthBounds("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
});

test("andar pelos meses atravessa a virada do ano", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-08", 0), "2026-08");
});

test("o formato é conferido antes de virar consulta", () => {
  assert.ok(isMonth("2026-08"));
  assert.ok(!isMonth("2026-13"));
  assert.ok(!isMonth("2026-00"));
  assert.ok(!isMonth("2026-8"));
  assert.ok(!isMonth("2026-08-01"));
  assert.ok(!isMonth(undefined));
});

test("o rótulo do mês vem capitalizado", () => {
  assert.equal(monthLabel("2026-08"), "Agosto de 2026");
});
