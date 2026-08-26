import assert from "node:assert/strict";
import { test } from "node:test";
import { layerOf, resolveRules, specificityOf, type RuleLike } from "./resolve";

function rule(over: Partial<RuleLike> & { id: string; code: string }): RuleLike {
  return {
    companyId: null,
    skill: null,
    format: null,
    overridesRuleId: null,
    ...over,
  };
}

test("a camada sai do que a regra preencheu", () => {
  assert.equal(layerOf({ companyId: null, skill: null, format: null }), "universal");
  assert.equal(layerOf({ companyId: "c", skill: null, format: null }), "empresa");
  assert.equal(layerOf({ companyId: null, skill: "Arte de post", format: null }), "tipo");
  assert.equal(layerOf({ companyId: null, skill: null, format: "Carrossel" }), "tipo");
  assert.equal(layerOf({ companyId: "c", skill: "Arte de post", format: null }), "empresa-tipo");
});

test("cada dimensão preenchida conta um ponto de especificidade", () => {
  assert.equal(specificityOf({ companyId: null, skill: null, format: null }), 0);
  assert.equal(specificityOf({ companyId: "c", skill: "Arte de post", format: "Carrossel" }), 3);
});

test("sem sobreposição declarada, tudo continua valendo", () => {
  const rules = [rule({ id: "1", code: "A" }), rule({ id: "2", code: "B", companyId: "c" })];
  const { applied, overlaps } = resolveRules(rules);

  assert.deepEqual(
    applied.map((r) => r.code),
    ["A", "B"],
  );
  assert.deepEqual(overlaps, []);
});

test("a mais específica vence, e a derrotada fica registrada", () => {
  const universal = rule({ id: "1", code: "PT-01" });
  const daEmpresa = rule({ id: "2", code: "CAR-PT-01", companyId: "c", overridesRuleId: "1" });

  const { applied, overlaps } = resolveRules([universal, daEmpresa]);

  assert.deepEqual(
    applied.map((r) => r.code),
    ["CAR-PT-01"],
  );
  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0].winner, "CAR-PT-01");
  assert.equal(overlaps[0].loser, "PT-01");
  assert.equal(overlaps[0].applied, true);
});

test("substituir uma regra mais específica não cala nenhuma das duas", () => {
  const especifica = rule({ id: "1", code: "CAR-01", companyId: "c", skill: "Arte de post" });
  const generica = rule({ id: "2", code: "GER-01", overridesRuleId: "1" });

  const { applied, overlaps } = resolveRules([especifica, generica]);

  assert.deepEqual(
    applied.map((r) => r.code).sort(),
    ["CAR-01", "GER-01"],
  );
  assert.equal(overlaps[0].applied, false);
  assert.match(overlaps[0].why, /corrija o escopo/);
});

test("empatar em especificidade também não derruba ninguém", () => {
  const a = rule({ id: "1", code: "A", companyId: "c" });
  const b = rule({ id: "2", code: "B", companyId: "c", overridesRuleId: "1" });

  const { applied, overlaps } = resolveRules([a, b]);

  assert.equal(applied.length, 2);
  assert.equal(overlaps[0].applied, false);
});

test("substituir regra que não está neste recorte não faz nada", () => {
  const so = rule({ id: "2", code: "B", companyId: "c", overridesRuleId: "fora-do-recorte" });
  const { applied, overlaps } = resolveRules([so]);

  assert.deepEqual(
    applied.map((r) => r.code),
    ["B"],
  );
  assert.deepEqual(overlaps, []);
});

test("uma regra derrubada não derruba a que ela mesma substituía", () => {
  // A substitui B, B substitui C. B sai; C continua valendo, porque quem
  // mandava tirá-la não está mais no conjunto.
  const c = rule({ id: "3", code: "C" });
  const b = rule({ id: "2", code: "B", companyId: "x", overridesRuleId: "3" });
  const a = rule({ id: "1", code: "A", companyId: "x", skill: "Arte de post", overridesRuleId: "2" });

  const { applied } = resolveRules([a, b, c]);

  assert.deepEqual(
    applied.map((r) => r.code).sort(),
    ["A", "C"],
  );
});
