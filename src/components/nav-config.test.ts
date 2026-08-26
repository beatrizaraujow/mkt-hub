import assert from "node:assert/strict";
import { test } from "node:test";
import { NAV, visibleNav } from "./nav-config";

/**
 * A navegação é conforto, nunca segurança — a trava de verdade é o
 * `requireUser` de cada página. Mas oferecer no menu uma tela que a pessoa não
 * pode abrir é prometer o que não se cumpre, e é isso que estes testes seguram.
 */

const rotas = (papel: Parameters<typeof visibleNav>[0]) =>
  visibleNav(papel).map((item) => item.href);

test("colaborador não vê as telas de quem gerencia", () => {
  const vistas = rotas("colaborador");

  assert.ok(!vistas.includes("/revisor"));
  assert.ok(!vistas.includes("/time"));
  assert.ok(vistas.includes("/trabalho"));
});

test("observador vê ainda menos, nunca mais", () => {
  assert.ok(rotas("observador").length <= rotas("colaborador").length);
});

test("gestor e admin veem o revisor", () => {
  assert.ok(rotas("gestor").includes("/revisor"));
  assert.ok(rotas("admin").includes("/revisor"));
});

test("nenhum item aparece duas vezes, e todo href é único", () => {
  const hrefs = NAV.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("o que está marcado como `soon` não promete papel nenhum", () => {
  // Item apagado com restrição de papel confundiria duas coisas diferentes:
  // "ainda não existe" e "não é para você".
  for (const item of NAV.filter((i) => i.soon)) {
    assert.equal(item.minRole, undefined, `${item.href} mistura soon com minRole`);
  }
});
