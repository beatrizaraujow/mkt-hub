import assert from "node:assert/strict";
import test from "node:test";
import { formatarDuracao, parseDuration, relogio } from "./duration";

/** Atalho: falha o teste se a leitura tiver dado erro. */
function seg(texto: string): number {
  const r = parseDuration(texto);
  assert.ok("segundos" in r, `esperava ler "${texto}", veio: ${"erro" in r ? r.erro : "?"}`);
  return r.segundos;
}

function erroDe(texto: string): string {
  const r = parseDuration(texto);
  assert.ok("erro" in r, `esperava recusar "${texto}"`);
  return r.erro;
}

/* ------------------------------------------------------------------ ler */

test("hora e minuto juntos, com e sem espaco", () => {
  assert.equal(seg("3h 20m"), 3 * 3600 + 20 * 60);
  assert.equal(seg("3h20m"), 3 * 3600 + 20 * 60);
  assert.equal(seg("3h20"), 3 * 3600 + 20 * 60);
  assert.equal(seg("3 h 20 min"), 3 * 3600 + 20 * 60);
});

test("so hora, so minuto, so segundo", () => {
  assert.equal(seg("2h"), 7200);
  assert.equal(seg("90m"), 5400);
  assert.equal(seg("90min"), 5400);
  assert.equal(seg("45s"), 45);
});

test("numero sozinho vale como minuto", () => {
  // Quem digita 45 quer 45 minutos. Ler como hora viraria dois dias de jornada.
  assert.equal(seg("45"), 45 * 60);
  assert.equal(seg("270"), 4 * 3600 + 30 * 60);
});

test("relogio com dois pontos", () => {
  assert.equal(seg("1:30"), 5400);
  assert.equal(seg("0:45"), 45 * 60);
  assert.equal(seg("10:05"), 10 * 3600 + 5 * 60);
});

test("aceita virgula e ponto decimal", () => {
  assert.equal(seg("1,5h"), 5400);
  assert.equal(seg("1.5h"), 5400);
});

test("por extenso em portugues", () => {
  assert.equal(seg("2 horas"), 7200);
  assert.equal(seg("1 hora 30 minutos"), 5400);
  assert.equal(seg("30 minutos"), 1800);
});

test("nao confunde o m de min com minuto solto", () => {
  // Se o `m` casasse antes de `min`, sobraria "in" e a leitura inteira cairia.
  assert.equal(seg("20min"), 1200);
  assert.equal(seg("20m"), 1200);
});

test("soma partes repetidas em vez de ignorar", () => {
  assert.equal(seg("2h 90m"), 2 * 3600 + 90 * 60);
});

/* --------------------------------------------------------------- recusar */

test("recusa vazio, zero e negativo", () => {
  assert.match(erroDe(""), /escreva quanto tempo/i);
  assert.match(erroDe("0"), /maior que zero/i);
  assert.match(erroDe("0h0m"), /maior que zero/i);
});

test("recusa acima de 24 horas", () => {
  assert.match(erroDe("25h"), /24 horas/i);
  assert.match(erroDe("1500"), /24 horas/i);
});

test("recusa texto que nao e tempo", () => {
  assert.match(erroDe("abc"), /nao entendi|não entendi/i);
  assert.match(erroDe("3x"), /nao entendi|não entendi/i);
});

test("recusa numero solto ambiguo no meio da expressao", () => {
  // "2h 20 30": nao ha leitura obvia. Chutar cria numero errado que ninguem confere.
  assert.ok("erro" in parseDuration("2h 20 30"));
});

test("a mensagem de erro ensina o formato", () => {
  assert.match(erroDe("abc"), /1h30|45m/);
});

/* --------------------------------------------------------------- escrever */

test("escreve de forma legivel", () => {
  assert.equal(formatarDuracao(4 * 3600 + 30 * 60), "4h 30m");
  assert.equal(formatarDuracao(7200), "2h");
  assert.equal(formatarDuracao(1800), "30m");
  assert.equal(formatarDuracao(42), "42s");
  assert.equal(formatarDuracao(0), "0s");
});

test("meia hora nunca aparece como zero hora", () => {
  // O formato antigo escrevia 0h30, que se le como "zero" no primeiro olhar.
  assert.equal(formatarDuracao(1800), "30m");
  assert.ok(!formatarDuracao(1800).startsWith("0"));
});

test("ler e escrever fecham o ciclo", () => {
  for (const texto of ["4h 30m", "2h", "30m", "1h 5m"]) {
    assert.equal(formatarDuracao(seg(texto)), texto);
  }
});

test("relogio mantem largura estavel e mostra os segundos", () => {
  assert.equal(relogio(9), "0:09");
  assert.equal(relogio(69), "1:09");
  assert.equal(relogio(3600), "1:00:00");
  assert.equal(relogio(3849), "1:04:09");
});
