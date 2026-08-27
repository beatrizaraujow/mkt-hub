import assert from "node:assert/strict";
import { test } from "node:test";
import { cellState } from "./week";
import { porEmpresa, porPessoa, resumir, SEM_RESPONSAVEL, type Ocorrencia } from "./stats";

/*
  O que estes testes seguram e uma propriedade, nao um numero: a contagem do
  resumo tem que classificar cada ocorrencia igual ao quadradinho que a grade
  pinta para ela. Se um dia alguem mudar o corte de "atrasado" em `cellState`
  e esquecer daqui, o painel passa a contradizer a tela — e o ultimo teste
  quebra antes de isso chegar em producao.
*/

const HOJE = "2026-08-27";

function oc(over: Partial<Ocorrencia> = {}): Ocorrencia {
  return {
    empresaId: "e1",
    empresaNome: "SeuBoné",
    empresaCor: "#000",
    pessoaId: "p1",
    pessoaNome: "Zion",
    dia: HOJE,
    publicada: false,
    ...over,
  };
}

test("hoje ainda nao venceu: fica em previstas, fora da porcentagem", () => {
  const r = resumir([oc({ dia: HOJE })], HOJE);

  assert.equal(r.previstas, 1);
  assert.equal(r.atrasadas, 0);
  assert.equal(r.cobradas, 0);
  assert.equal(r.pct, null);
});

test("nada cobrado devolve null, que nao e zero por cento", () => {
  // Segunda de manha com a semana inteira pela frente nao e 0% de aderencia.
  const r = resumir([oc({ dia: "2026-08-28" }), oc({ dia: "2026-08-30" })], HOJE);

  assert.equal(r.pct, null);
  assert.equal(r.feitas, 0);
});

test("o que passou e nao saiu conta como atrasado e derruba a porcentagem", () => {
  const r = resumir(
    [
      oc({ dia: "2026-08-24", publicada: true }),
      oc({ dia: "2026-08-25", publicada: true }),
      oc({ dia: "2026-08-26" }),
      oc({ dia: HOJE }),
    ],
    HOJE,
  );

  assert.equal(r.feitas, 2);
  assert.equal(r.atrasadas, 1);
  assert.equal(r.previstas, 1);
  assert.equal(r.cobradas, 3);
  assert.equal(r.pct, 67);
});

test("publicar hoje adiantado conta, e nao existe atraso para diluir", () => {
  const r = resumir([oc({ dia: HOJE, publicada: true }), oc({ dia: HOJE })], HOJE);

  assert.equal(r.pct, 100);
  assert.equal(r.cobradas, 1);
});

test("empresa vem pior primeiro, e quem nada teve cobrado vai para o fim", () => {
  const fatias = porEmpresa(
    [
      oc({ empresaId: "boa", empresaNome: "Boa", dia: "2026-08-25", publicada: true }),
      oc({ empresaId: "ruim", empresaNome: "Ruim", dia: "2026-08-25" }),
      oc({ empresaId: "nova", empresaNome: "Nova", dia: "2026-08-30" }),
    ],
    HOJE,
  );

  assert.deepEqual(
    fatias.map((f) => f.id),
    ["ruim", "boa", "nova"],
  );
});

test("pessoa vem em ordem alfabetica, nunca da pior para a melhor", () => {
  const fatias = porPessoa(
    [
      oc({ pessoaId: "z", pessoaNome: "Zion", dia: "2026-08-25", publicada: true }),
      oc({ pessoaId: "m", pessoaNome: "Maria Luiza", dia: "2026-08-25" }),
    ],
    HOJE,
  );

  // Maria tem 0% e Zion 100%. Se a ordem fosse por desempenho, Maria viria
  // primeiro por ser a pior — e a tela viraria um ranking de exposicao.
  assert.deepEqual(
    fatias.map((f) => f.nome),
    ["Maria Luiza", "Zion"],
  );
});

test("rotina sem responsavel e contada, e vai para o fim da lista", () => {
  const fatias = porPessoa(
    [oc({ pessoaId: null, pessoaNome: null }), oc({ pessoaId: "z", pessoaNome: "Zion" })],
    HOJE,
  );

  assert.equal(fatias.at(-1)?.id, SEM_RESPONSAVEL);
  assert.equal(fatias.length, 2);
});

test("a classificacao do resumo é a mesma da grade, celula por celula", () => {
  const dias = ["2026-08-25", HOJE, "2026-08-30"];

  for (const dia of dias) {
    for (const publicada of [true, false]) {
      const resumo = resumir([oc({ dia, publicada })], HOJE);
      const estado = cellState({ scheduled: true, published: publicada, day: dia, today: HOJE });

      const doResumo =
        resumo.feitas === 1 ? "feito" : resumo.atrasadas === 1 ? "atrasado" : "previsto";

      assert.equal(doResumo, estado, `${dia} publicada=${publicada}`);
    }
  }
});
