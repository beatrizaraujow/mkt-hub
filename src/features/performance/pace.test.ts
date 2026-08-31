import assert from "node:assert/strict";
import test from "node:test";
import { faixaDoRitmo, ritmoEsperado, textoDoRitmo } from "./pace";

test("na segunda nao se espera nada ainda", () => {
  // Cinco dias restantes de cinco: o dia de hoje ainda esta acontecendo.
  assert.equal(ritmoEsperado(5), 0);
});

test("o esperado sobe conforme a semana anda", () => {
  assert.equal(ritmoEsperado(4), 20); // terca
  assert.equal(ritmoEsperado(3), 40); // quarta
  assert.equal(ritmoEsperado(2), 60); // quinta
  assert.equal(ritmoEsperado(1), 80); // sexta
  assert.equal(ritmoEsperado(0), 100); // acabou
});

test("33% na segunda nao e vermelho", () => {
  // Era o defeito: a escala absoluta pintava o time inteiro de vermelho toda
  // segunda de manha, e alarme que dispara sempre deixa de ser alarme.
  assert.equal(faixaDoRitmo(33, 5), "boa");
});

test("os mesmos 33% na sexta sao vermelho", () => {
  assert.equal(faixaDoRitmo(33, 1), "ruim");
});

test("a margem de 20 pontos evita a cor piscando na fronteira", () => {
  // Quarta espera 40%. Em 25% ainda e aviso, nao vermelho.
  assert.equal(faixaDoRitmo(25, 3), "atencao");
  assert.equal(faixaDoRitmo(19, 3), "ruim");
});

test("semana encerrada volta a regua absoluta", () => {
  assert.equal(faixaDoRitmo(95, 0), "boa");
  assert.equal(faixaDoRitmo(75, 0), "atencao");
  assert.equal(faixaDoRitmo(40, 0), "ruim");
});

test("sem percentual nao inventa faixa", () => {
  assert.equal(faixaDoRitmo(null, 3), "sem-dado");
  assert.equal(textoDoRitmo(null, 3), "sem régua para medir ainda");
});

test("o texto acompanha o ritmo, nao o numero cru", () => {
  assert.equal(textoDoRitmo(33, 5), "adiantado para o ponto da semana");
  assert.equal(textoDoRitmo(40, 3), "no ritmo da semana");
  assert.equal(textoDoRitmo(10, 1), "atrás do ritmo da semana");
  assert.equal(textoDoRitmo(100, 3), "meta da semana batida");
  assert.equal(textoDoRitmo(50, 0), "a semana já virou");
});
