import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coinsDaMeta,
  coinsDoPodio,
  montarFechamento,
  percentualDe,
  type Bruto,
  type Regua,
} from "./snapshot";

function regua(over: Partial<Regua> = {}): Regua {
  return {
    pessoaId: "p1",
    nome: "Samuel",
    cargo: "Diretor de Arte",
    rule: "pontos",
    meta: 130,
    meta120: 156,
    // Os numeros reais da casa, iguais aos do MKT Hub 1.
    coinsAos100: 3,
    coinsAos120: 4,
    ...over,
  };
}

function bruto(over: Partial<Bruto> = {}): Bruto {
  return {
    pessoaId: "p1",
    pontos: 0,
    entregas: 0,
    semPonto: 0,
    rotinasFeitas: 0,
    rotinasCobradas: 0,
    ...over,
  };
}

/* -------------------------------------------------------------- percentual */

test("régua de pontos mede pontos sobre a meta", () => {
  assert.equal(percentualDe(regua(), bruto({ pontos: 130 })), 100);
  assert.equal(percentualDe(regua(), bruto({ pontos: 65 })), 50);
});

test("régua de rotinas mede o que saiu sobre o que venceu", () => {
  // Mesma conta da grade de Rotinas: o denominador é o que venceu, não a
  // semana inteira. Contar o que ainda nem chegou marcaria todo mundo mal na
  // segunda de manhã.
  const r = regua({ rule: "rotinas", meta: null, meta120: null });

  assert.equal(percentualDe(r, bruto({ rotinasFeitas: 9, rotinasCobradas: 10 })), 90);
  assert.equal(percentualDe(r, bruto({ rotinasFeitas: 0, rotinasCobradas: 0 })), null);
});

test("sem meta cadastrada é null, não zero por cento", () => {
  assert.equal(percentualDe(regua({ meta: null }), bruto({ pontos: 40 })), null);
});

/* ------------------------------------------------------------------ coins */

test("as cinco faixas da meta, portadas do MKT Hub 1", () => {
  const r = regua(); // meta 130, meta120 156 — a proporção redonda de 120%.

  assert.equal(coinsDaMeta(r, 130), 4);
  assert.equal(coinsDaMeta(r, 120), 4);
  assert.equal(coinsDaMeta(r, 119), 3);
  assert.equal(coinsDaMeta(r, 100), 3);
  assert.equal(coinsDaMeta(r, 99), 2);
  assert.equal(coinsDaMeta(r, 80), 2);
  assert.equal(coinsDaMeta(r, 79), 1);
  assert.equal(coinsDaMeta(r, 60), 1);
  assert.equal(coinsDaMeta(r, 59), 0);
  assert.equal(coinsDaMeta(r, 0), 0);
});

test("entrega parcial paga parcial — era o buraco da regra anterior", () => {
  // A 85% da meta, a regra antiga do MKT Hub 2 pagava zero. O fluxo de
  // snapshot do MKT Hub 1, que é o que a casa usou, paga 2.
  assert.equal(coinsDaMeta(regua(), 85), 2);
});

test("a faixa de 120% é a meta120 da pessoa, e nem sempre dá 120%", () => {
  /*
   * A meta120 é guardada, não derivada. A da Anny é 70 sobre 60, que dá 117% —
   * comparar contra 120 fixo tirava dela uma faixa que ela alcança.
   */
  const anny = regua({ nome: "Anny", meta: 60, meta120: 70 });

  assert.equal(coinsDaMeta(anny, 117), 4);
  assert.equal(coinsDaMeta(anny, 116), 3);
  // E o Samuel, cuja meta120 é a proporção redonda, não muda.
  assert.equal(coinsDaMeta(regua(), 117), 3);
});

test("sem meta120 cadastrada, o limiar volta a ser 120", () => {
  assert.equal(coinsDaMeta(regua({ meta120: null }), 120), 4);
  assert.equal(coinsDaMeta(regua({ meta120: null }), 119), 3);
});

test("sem régua não sugere coin, e isso não é punição", () => {
  // Punir alguém por um cadastro que falta seria o pior jeito de estrear.
  assert.equal(coinsDaMeta(regua({ meta: null }), null), 0);
});

/* ------------------------------------------------------------------ pódio */

test("o pódio paga 3, 2 e 1", () => {
  const base = { rule: "pontos" as const, percentual: 100 };

  assert.equal(coinsDoPodio({ ...base, posicao: 1 }), 3);
  assert.equal(coinsDoPodio({ ...base, posicao: 2 }), 2);
  assert.equal(coinsDoPodio({ ...base, posicao: 3 }), 1);
  assert.equal(coinsDoPodio({ ...base, posicao: 4 }), 0);
});

test("primeiro lugar sem bater a meta não leva bônus", () => {
  /*
   * Sem esta trava, numa semana ruim o pódio premia ser menos pior que os
   * outros em vez de entregar o combinado.
   */
  assert.equal(coinsDoPodio({ rule: "pontos", percentual: 99, posicao: 1 }), 0);
  assert.equal(coinsDoPodio({ rule: "pontos", percentual: 100, posicao: 1 }), 3);
});

test("quem é medido por rotina não entra no pódio", () => {
  // A régua dela é presença, e presença no máximo empata em 100%.
  assert.equal(coinsDoPodio({ rule: "rotinas", percentual: 100, posicao: 1 }), 0);
});

test("sem percentual e sem posição, nenhum bônus", () => {
  assert.equal(coinsDoPodio({ rule: "pontos", percentual: null, posicao: 1 }), 0);
  assert.equal(coinsDoPodio({ rule: "pontos", percentual: 100, posicao: null }), 0);
});

/* ------------------------------------------------------------ fechamento */

test("quem não entregou nada entra na lista com zero", () => {
  // Sumir da lista esconderia exatamente quem precisa de conversa.
  const entradas = montarFechamento([regua()], []);

  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].pontos, 0);
  assert.equal(entradas[0].percentual, 0);
});

test("a posição é dentro do grupo de régua, nunca entre grupos", () => {
  // Comparar quem entrega pontos com quem entrega presença produziria um
  // ranking que não quer dizer nada.
  const entradas = montarFechamento(
    [
      regua({ pessoaId: "a", nome: "Samuel", rule: "pontos", meta: 100 }),
      regua({ pessoaId: "b", nome: "Thiago", rule: "pontos", meta: 100 }),
      regua({ pessoaId: "c", nome: "Zion", rule: "rotinas", meta: null }),
    ],
    [
      bruto({ pessoaId: "a", pontos: 50 }),
      bruto({ pessoaId: "b", pontos: 100 }),
      bruto({ pessoaId: "c", rotinasFeitas: 1, rotinasCobradas: 10 }),
    ],
  );

  const porNome = new Map(entradas.map((e) => [e.nome, e]));

  assert.equal(porNome.get("Thiago")?.posicao, 1);
  assert.equal(porNome.get("Samuel")?.posicao, 2);
  // Zion tem 10%, o pior número da tela — e mesmo assim é 1º, porque é o
  // único da régua dele.
  assert.equal(porNome.get("Zion")?.posicao, 1);
});

test("empate divide a posição e pula a seguinte", () => {
  const entradas = montarFechamento(
    [
      regua({ pessoaId: "a", nome: "Ana", meta: 100 }),
      regua({ pessoaId: "b", nome: "Bruno", meta: 100 }),
      regua({ pessoaId: "c", nome: "Caio", meta: 100 }),
    ],
    [
      bruto({ pessoaId: "a", pontos: 100 }),
      bruto({ pessoaId: "b", pontos: 100 }),
      bruto({ pessoaId: "c", pontos: 50 }),
    ],
  );

  const porNome = new Map(entradas.map((e) => [e.nome, e.posicao]));

  assert.equal(porNome.get("Ana"), 1);
  assert.equal(porNome.get("Bruno"), 1);
  assert.equal(porNome.get("Caio"), 3);
});

test("quem não tem percentual fica sem posição, não em último", () => {
  const entradas = montarFechamento(
    [regua({ pessoaId: "a", nome: "Ana", meta: 100 }), regua({ pessoaId: "b", nome: "Bruno", meta: null })],
    [bruto({ pessoaId: "a", pontos: 100 })],
  );

  const porNome = new Map(entradas.map((e) => [e.nome, e.posicao]));

  assert.equal(porNome.get("Ana"), 1);
  assert.equal(porNome.get("Bruno"), null);
});

test("a lista sai em ordem alfabética, não da pior para a melhor", () => {
  const entradas = montarFechamento(
    [regua({ pessoaId: "a", nome: "Zion", meta: 100 }), regua({ pessoaId: "b", nome: "Ana", meta: 100 })],
    [bruto({ pessoaId: "a", pontos: 200 }), bruto({ pessoaId: "b", pontos: 10 })],
  );

  assert.deepEqual(
    entradas.map((e) => e.nome),
    ["Ana", "Zion"],
  );
});

test("o buraco de entrega sem ponto atravessa para o fechamento", () => {
  const entradas = montarFechamento([regua()], [bruto({ pontos: 130, entregas: 5, semPonto: 2 })]);

  assert.equal(entradas[0].semPonto, 2);
  assert.equal(entradas[0].coinsDaMeta, 3);
});

test("o total sugerido é a meta mais o pódio, e as parcelas ficam separadas", () => {
  const entradas = montarFechamento(
    [
      regua({ pessoaId: "a", nome: "Samuel" }),
      regua({ pessoaId: "b", nome: "Thiago" }),
      regua({ pessoaId: "c", nome: "Klenio" }),
    ],
    [
      bruto({ pessoaId: "a", pontos: 200 }), // 154% — 1º
      bruto({ pessoaId: "b", pontos: 140 }), // 108% — 2º
      bruto({ pessoaId: "c", pontos: 100 }), //  77% — 3º, mas não bateu a meta
    ],
  );

  const por = (nome: string) => entradas.find((e) => e.nome === nome)!;

  assert.deepEqual(
    [por("Samuel").coinsDaMeta, por("Samuel").coinsDoPodio, por("Samuel").coinsSugeridas],
    [4, 3, 7],
  );
  assert.deepEqual(
    [por("Thiago").coinsDaMeta, por("Thiago").coinsDoPodio, por("Thiago").coinsSugeridas],
    [3, 2, 5],
  );
  // Terceiro lugar, mas a 77%: leva a faixa parcial e nenhum bônus.
  assert.deepEqual(
    [por("Klenio").coinsDaMeta, por("Klenio").coinsDoPodio, por("Klenio").coinsSugeridas],
    [1, 0, 1],
  );
});

test("o teto real é o da faixa de 120 mais 3", () => {
  // Com os números da casa, 7. O MKT Hub 1 tinha um CHECK de 0 a 6 que não
  // comportava nem isso, e uma linha fora da faixa derrubava a gravação da
  // equipe inteira dentro de um catch vazio.
  const entradas = montarFechamento([regua()], [bruto({ pontos: 300 })]);
  assert.equal(entradas[0].coinsSugeridas, 7);
});

test("as faixas de cima saem do cadastro da pessoa, não de constante", () => {
  // Se um dia alguém combinar outro número, a faixa acompanha sem tocar no código.
  const generosa = regua({ coinsAos100: 6, coinsAos120: 9 });

  assert.equal(coinsDaMeta(generosa, 100), 6);
  assert.equal(coinsDaMeta(generosa, 120), 9);
  // As de baixo continuam fixas: a casa usa o mesmo 1 e o mesmo 2 para todos.
  assert.equal(coinsDaMeta(generosa, 80), 2);
  assert.equal(coinsDaMeta(generosa, 60), 1);
});

test("empate no pódio leva o mesmo bônus, e a posição seguinte fica vazia", () => {
  const entradas = montarFechamento(
    [regua({ pessoaId: "a", nome: "Ana" }), regua({ pessoaId: "b", nome: "Bruno" })],
    [bruto({ pessoaId: "a", pontos: 130 }), bruto({ pessoaId: "b", pontos: 130 })],
  );

  // Os dois em primeiro: +3 cada, e ninguém em segundo. Desempatar aqui
  // inventaria um critério que não existe.
  assert.deepEqual(
    entradas.map((e) => [e.posicao, e.coinsDoPodio]),
    [
      [1, 3],
      [1, 3],
    ],
  );
});

test("quem é medido por rotina fica fora do pódio no fechamento", () => {
  const entradas = montarFechamento(
    [regua({ pessoaId: "a", nome: "Malu", rule: "rotinas", meta: null, meta120: null })],
    [bruto({ pessoaId: "a", rotinasFeitas: 10, rotinasCobradas: 10 })],
  );

  assert.equal(entradas[0].percentual, 100);
  assert.equal(entradas[0].coinsDaMeta, 3);
  assert.equal(entradas[0].coinsDoPodio, 0);
});
