import assert from "node:assert/strict";
import { test } from "node:test";
import { coinsSugeridas, montarFechamento, percentualDe, type Bruto, type Regua } from "./snapshot";

function regua(over: Partial<Regua> = {}): Regua {
  return {
    pessoaId: "p1",
    nome: "Samuel",
    cargo: "Diretor de Arte",
    rule: "pontos",
    meta: 130,
    meta120: 156,
    coinsAos100: 3,
    coinsAos120: 5,
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

test("as faixas sugerem 120, 100 ou nenhuma", () => {
  const r = regua();

  assert.equal(coinsSugeridas(r, 130), 5);
  assert.equal(coinsSugeridas(r, 120), 5);
  assert.equal(coinsSugeridas(r, 119), 3);
  assert.equal(coinsSugeridas(r, 100), 3);
  assert.equal(coinsSugeridas(r, 99), 0);
});

test("sem régua não sugere coin, e isso não é punição", () => {
  // Punir alguém por um cadastro que falta seria o pior jeito de estrear.
  assert.equal(coinsSugeridas(regua({ meta: null }), null), 0);
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
  assert.equal(entradas[0].coinsSugeridas, 3);
});
