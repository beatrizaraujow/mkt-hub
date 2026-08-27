import assert from "node:assert/strict";
import { test } from "node:test";
import { acharPessoa, lerDias, marcarRepetidas, parseImport } from "./import";

const PESSOAS = [
  { id: "z", name: "Zion Bagatoli", email: "zion.bagatoli@grupoquatro5.com" },
  { id: "m", name: "Maria Luiza Mariz", email: "marialuiza.mariz@grupoquatro5.com" },
  { id: "c", name: "Maria Clara Carvalho", email: "mariaclara@seubone.com" },
];

/* ------------------------------------------------------------------- dias */

test("aceita a lista do jeito que a pessoa escreve", () => {
  assert.deepEqual(lerDias("seg, qua e sex"), { dias: [0, 2, 4] });
  assert.deepEqual(lerDias("SEG/TER/QUA"), { dias: [0, 1, 2] });
  assert.deepEqual(lerDias("sáb dom"), { dias: [5, 6] });
  assert.deepEqual(lerDias("terça"), { dias: [1] });
});

test("atalhos: diária, dias úteis, fim de semana", () => {
  assert.deepEqual(lerDias("diária"), { dias: [0, 1, 2, 3, 4, 5, 6] });
  assert.deepEqual(lerDias("todos os dias"), { dias: [0, 1, 2, 3, 4, 5, 6] });
  assert.deepEqual(lerDias("dias úteis"), { dias: [0, 1, 2, 3, 4] });
  assert.deepEqual(lerDias("fds"), { dias: [5, 6] });
});

test("intervalo com a ou hífen", () => {
  assert.deepEqual(lerDias("seg a sex"), { dias: [0, 1, 2, 3, 4] });
  assert.deepEqual(lerDias("ter-qui"), { dias: [1, 2, 3] });
});

test("dia repetido não vira rotina em dobro", () => {
  assert.deepEqual(lerDias("seg, seg, ter"), { dias: [0, 1] });
});

test("número é recusado, e não adivinhado", () => {
  // A armadilha que custou uma conferência inteira no import do sistema
  // antigo: la 1 era segunda, aqui zero é segunda. Deslocar um dia não
  // levanta erro nenhum, só deixa a grade errada.
  const r = lerDias("1,3,5");
  assert.ok("erro" in r);
  assert.match(r.erro, /ambíguo/);
});

test("intervalo de trás para frente é erro, não lista vazia", () => {
  const r = lerDias("sex a seg");
  assert.ok("erro" in r);
});

test("dia que não existe diz qual não foi reconhecido", () => {
  const r = lerDias("seg, terca-feiraa");
  assert.ok("erro" in r);
  assert.match(r.erro, /terca-feiraa/);
});

/* ----------------------------------------------------------------- pessoa */

test("acha por e-mail, por nome inteiro e por primeiro nome único", () => {
  const achou = (busca: string) => {
    const r = acharPessoa(busca, PESSOAS);
    return "pessoa" in r ? r.pessoa?.id : `erro: ${r.erro}`;
  };

  assert.equal(achou("zion.bagatoli@grupoquatro5.com"), "z");
  assert.equal(achou("zion bagatoli"), "z");
  assert.equal(achou("Zion"), "z");
  // Acento e caixa não podem separar a pessoa dela mesma.
  assert.equal(achou("MARIA LUIZA MARIZ"), "m");
});

test("nome ambíguo é erro, nunca chute", () => {
  // Duas Marias no time. Escolher uma seria atribuir rotina para a pessoa
  // errada sem ninguém perceber.
  const r = acharPessoa("Maria", PESSOAS);
  assert.ok("erro" in r);
  assert.match(r.erro, /2 pessoas/);
});

test("coluna de responsável vazia é rotina sem responsável, não erro", () => {
  const r = acharPessoa("   ", PESSOAS);
  assert.ok("pessoa" in r && r.pessoa === null);
});

/* ------------------------------------------------------------------ linha */

test("lê uma lista colada de planilha, separada por tabulação", () => {
  const linhas = parseImport(
    "Instagram\t5 Stories\tdiária\tZion\nTikTok\t1 vídeo\tseg, qua e sex\t",
    PESSOAS,
  );

  assert.equal(linhas.length, 2);
  assert.deepEqual(linhas[0], {
    tipo: "ok",
    numero: 1,
    plataforma: "Instagram",
    label: "5 Stories",
    dias: [0, 1, 2, 3, 4, 5, 6],
    pessoaId: "z",
    pessoaNome: "Zion Bagatoli",
  });
  assert.equal(linhas[1].tipo === "ok" && linhas[1].pessoaId, null);
});

test("aceita ponto-e-vírgula e o separador de exibição", () => {
  const ponto = parseImport("Instagram; 8 Stories; diária", PESSOAS);
  const ponto2 = parseImport("Instagram · 8 Stories · diária", PESSOAS);

  assert.equal(ponto[0].tipo, "ok");
  assert.equal(ponto2[0].tipo, "ok");
});

test("marcador de lista na frente é resquício de onde foi copiado", () => {
  const linhas = parseImport("- Instagram; 5 Stories; diária\n2) TikTok; 1 vídeo; seg", PESSOAS);

  assert.equal(linhas.filter((l) => l.tipo === "ok").length, 2);
});

test("linha vazia não conta, e não desloca a numeração do que veio depois", () => {
  const linhas = parseImport("\n\nInstagram; 5 Stories; diária\n\n", PESSOAS);

  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].numero, 1);
});

test("erro é por linha: uma ruim não derruba as boas", () => {
  const linhas = parseImport(
    "Instagram; 5 Stories; diária\nInstagram; 1 feed; xpto\nTikTok; 1 vídeo; seg",
    PESSOAS,
  );

  assert.deepEqual(
    linhas.map((l) => l.tipo),
    ["ok", "erro", "ok"],
  );
  assert.equal(linhas[1].numero, 2);
});

test("label acima do teto do banco é recusado aqui, não lá", () => {
  const linhas = parseImport(`Instagram; ${"a".repeat(61)}; diária`, PESSOAS);

  assert.equal(linhas[0].tipo, "erro");
  assert.match(linhas[0].tipo === "erro" ? linhas[0].motivo : "", /61 caracteres/);
});

test("faltando coluna, diz quais são as colunas", () => {
  const linhas = parseImport("Instagram; 5 Stories", PESSOAS);

  assert.equal(linhas[0].tipo, "erro");
  assert.match(linhas[0].tipo === "erro" ? linhas[0].motivo : "", /plataforma, o que sai, dias/);
});

/* -------------------------------------------------------------- repetidas */

test("marca o que já existe na empresa e o que repete dentro da lista", () => {
  const linhas = parseImport(
    "Instagram; 5 Stories; diária\nInstagram; 1 feed; seg\nInstagram; 1 Feed; ter",
    PESSOAS,
  );
  const marcadas = marcarRepetidas(linhas, [{ platform: "Instagram", label: "5 stories" }]);

  assert.equal(marcadas[0].repetida, "ja-existe");
  assert.equal(marcadas[1].repetida, undefined);
  // "1 Feed" e "1 feed" são a mesma rotina — a grade não saberia diferenciar.
  assert.equal(marcadas[2].repetida, "na-lista");
});
