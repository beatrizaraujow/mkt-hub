import assert from "node:assert/strict";
import { test } from "node:test";
import { podeAtravessar, podeMarcarExcecao, saidaDe, type Movimento } from "./esteira";

function mov(over: Partial<Movimento> & { de: string | null; para: string }): Movimento {
  return { ehSubtarefa: false, isento: false, temMotivo: false, ...over };
}

test("o caminho normal da esteira passa inteiro", () => {
  for (const [de, para] of [
    ["em_andamento", "pre_revisao"],
    ["pre_revisao", "revisao_ia"],
    ["revisao_ia", "ajustar"],
    ["ajustar", "revisao_ia"],
    ["revisao_ia", "aprovacao"],
    ["aprovacao", "aprovacao_lider"],
    ["aprovacao_lider", "publicar"],
    ["publicar", "completo"],
  ]) {
    assert.equal(podeAtravessar(mov({ de, para })).ok, true, `${de} -> ${para}`);
  }
});

test("sem a exceção, não se chega em Aprovação vindo de antes da esteira", () => {
  const r = podeAtravessar(mov({ de: "em_andamento", para: "aprovacao" }));
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /Pré revisão/);
});

test("da Pré revisão para Aprovação pula a Revisão IA", () => {
  const r = podeAtravessar(mov({ de: "pre_revisao", para: "aprovacao" }));
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /Revisão IA/);
});

test("a exceção com motivo abre a Aprovação, e só ela", () => {
  assert.equal(
    podeAtravessar(mov({ de: "em_andamento", para: "aprovacao", isento: true, temMotivo: true })).ok,
    true,
  );
  assert.equal(
    podeAtravessar(
      mov({ de: "em_andamento", para: "aprovacao_lider", isento: true, temMotivo: true }),
    ).ok,
    false,
  );
});

test("marcada sem motivo não vale como marcada", () => {
  const r = podeAtravessar(mov({ de: "em_andamento", para: "aprovacao", isento: true }));
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /sem motivo/);
});

test("ninguém vai direto para Publicar, marcada ou não", () => {
  for (const isento of [false, true]) {
    const r = podeAtravessar(mov({ de: "em_andamento", para: "publicar", isento, temMotivo: isento }));
    assert.equal(r.ok, false, `isento=${isento}`);
  }
});

test("a caixinha de concluir não pula a esteira", () => {
  assert.equal(podeAtravessar(mov({ de: "em_andamento", para: "completo" })).ok, false);
  assert.equal(podeAtravessar(mov({ de: "pendente", para: "banco_criativos" })).ok, false);
});

test("subtarefa não anda na esteira", () => {
  assert.equal(
    podeAtravessar(mov({ de: "em_andamento", para: "completo", ehSubtarefa: true })).ok,
    true,
  );
});

test("voltar nunca é barrado", () => {
  assert.equal(podeAtravessar(mov({ de: "aprovacao", para: "em_andamento" })).ok, true);
  assert.equal(podeAtravessar(mov({ de: "revisao_ia", para: "pre_revisao" })).ok, true);
});

test("peça marcada não entra na esteira", () => {
  const r = podeAtravessar(
    mov({ de: "em_andamento", para: "pre_revisao", isento: true, temMotivo: true }),
  );
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : "", /desmarque/i);
});

test("etapa de outro pipeline não é barrada por uma esteira que não é dela", () => {
  assert.equal(podeAtravessar(mov({ de: "rascunho", para: "publicado" })).ok, true);
  assert.equal(podeAtravessar(mov({ de: null, para: "aprovacao" })).ok, true);
});

test("o campo tranca quando a peça entra na esteira, menos para o líder", () => {
  assert.equal(podeMarcarExcecao("em_andamento", false), true);
  assert.equal(podeMarcarExcecao("pendente", false), true);
  assert.equal(podeMarcarExcecao("pre_revisao", false), false);
  assert.equal(podeMarcarExcecao("aprovacao", false), false);
  assert.equal(podeMarcarExcecao("pre_revisao", true), true);
});

test("onde a marcação aconteceu decide qual saída ela é", () => {
  assert.equal(saidaDe("em_andamento"), "declarada");
  assert.equal(saidaDe("pre_revisao"), "aprovacao_excecao");
  assert.equal(saidaDe("aprovacao"), "aprovacao_excecao");
});
