import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cellState,
  daysForRoutine,
  generatesFor,
  missingOccurrences,
  mondayOf,
  shiftWeek,
  weekDays,
  weekLabel,
} from "./week";

/*
  A fronteira da semana é onde este cálculo erra. Domingo é o caso que quebra
  quem usa o `getDay()` cru do JavaScript, em que domingo é 0 e vira o começo
  de uma semana que ainda não chegou.
*/

test("segunda-feira é a própria segunda", () => {
  assert.equal(mondayOf("2026-08-24"), "2026-08-24");
});

test("domingo pertence à semana que começou na segunda anterior", () => {
  // 30/08/2026 é domingo. A segunda dele é 24/08, não 31/08.
  assert.equal(mondayOf("2026-08-30"), "2026-08-24");
});

test("sábado também fica na semana que já começou", () => {
  assert.equal(mondayOf("2026-08-29"), "2026-08-24");
});

test("a semana tem sete dias, de segunda a domingo", () => {
  assert.deepEqual(weekDays("2026-08-24"), [
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
  ]);
});

test("a semana atravessa a virada do mês sem pular dia", () => {
  assert.deepEqual(weekDays("2026-08-31"), [
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
  ]);
});

test("a semana atravessa a virada do ano", () => {
  // 28/12/2026 é segunda.
  const days = weekDays("2026-12-28");
  assert.equal(days[0], "2026-12-28");
  assert.equal(days[6], "2027-01-03");
});

test("andar uma semana para trás e para frente volta ao mesmo lugar", () => {
  const monday = "2026-08-24";
  assert.equal(shiftWeek(shiftWeek(monday, -1), 1), monday);
  assert.equal(shiftWeek(monday, 1), "2026-08-31");
});

test("o rótulo da semana mostra o intervalo", () => {
  assert.equal(weekLabel("2026-08-24"), "24 de ago a 30 de ago");
});

test("dias da rotina saem na ordem da semana, sem repetir", () => {
  // Segunda, quinta e de novo segunda.
  assert.deepEqual(daysForRoutine("2026-08-24", [3, 0, 0]), ["2026-08-24", "2026-08-27"]);
});

test("dia de semana fora da faixa é ignorado, não derruba a linha", () => {
  assert.deepEqual(daysForRoutine("2026-08-24", [0, 9, -2, 6]), ["2026-08-24", "2026-08-30"]);
});

test("story diário são sete dias numa linha só", () => {
  assert.equal(daysForRoutine("2026-08-24", [0, 1, 2, 3, 4, 5, 6]).length, 7);
});

/* ------------------------------------------------------------ estado da célula */

test("dia sem nada previsto fica fora, mesmo no passado", () => {
  assert.equal(
    cellState({ scheduled: false, published: false, day: "2026-08-20", today: "2026-08-26" }),
    "fora",
  );
});

test("publicado é feito, mesmo atrasado", () => {
  assert.equal(
    cellState({ scheduled: true, published: true, day: "2026-08-20", today: "2026-08-26" }),
    "feito",
  );
});

test("hoje continua previsto, não atrasado", () => {
  // Cobrar às nove da manhã o post que sai às seis da tarde ensina a ignorar
  // a cor vermelha.
  assert.equal(
    cellState({ scheduled: true, published: false, day: "2026-08-26", today: "2026-08-26" }),
    "previsto",
  );
});

test("ontem sem publicar é atrasado", () => {
  assert.equal(
    cellState({ scheduled: true, published: false, day: "2026-08-25", today: "2026-08-26" }),
    "atrasado",
  );
});

test("amanhã é previsto", () => {
  assert.equal(
    cellState({ scheduled: true, published: false, day: "2026-08-27", today: "2026-08-26" }),
    "previsto",
  );
});

/* ---------------------------------------------------------------- geração */

test("gera só o que falta", () => {
  const faltando = missingOccurrences(
    [{ id: "r1", weekdays: [0, 3] }],
    "2026-08-24",
    [{ routineId: "r1", day: "2026-08-24" }],
  );

  assert.deepEqual(faltando, [{ routineId: "r1", day: "2026-08-27" }]);
});

test("rodar de novo com tudo criado não gera nada", () => {
  const rotinas = [{ id: "r1", weekdays: [0, 3] }];
  const existentes = [
    { routineId: "r1", day: "2026-08-24" },
    { routineId: "r1", day: "2026-08-27" },
  ];

  assert.deepEqual(missingOccurrences(rotinas, "2026-08-24", existentes), []);
});

test("ocorrência de outra rotina no mesmo dia não conta como existente", () => {
  const faltando = missingOccurrences(
    [{ id: "r2", weekdays: [0] }],
    "2026-08-24",
    [{ routineId: "r1", day: "2026-08-24" }],
  );

  assert.deepEqual(faltando, [{ routineId: "r2", day: "2026-08-24" }]);
});

test("rotina sem dia nenhum não gera nada", () => {
  assert.deepEqual(missingOccurrences([{ id: "r1", weekdays: [] }], "2026-08-24", []), []);
});

/* ------------------------------------------------- semana que ainda gera */

test("semana passada não gera: tarefa não nasce atrasada por clique na seta", () => {
  // 24/08 é a segunda da semana anterior a 31/08.
  assert.equal(generatesFor("2026-08-24", "2026-08-31"), false);
});

test("a semana corrente gera até o domingo", () => {
  assert.equal(generatesFor("2026-08-24", "2026-08-24"), true);
  assert.equal(generatesFor("2026-08-24", "2026-08-30"), true);
});

test("semana futura gera: a grade existe para planejar adiante", () => {
  assert.equal(generatesFor("2026-09-07", "2026-08-27"), true);
});
