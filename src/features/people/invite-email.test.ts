import assert from "node:assert/strict";
import test from "node:test";
import { inviteEmail } from "./invite-email";

const base = {
  name: "Zion Bagatoli",
  inviterName: "Anny Beatriz",
  url: "https://mkt-hub-wheat.vercel.app/convite/abc123",
  expiresAt: new Date("2026-09-06T21:44:00Z"),
};

test("trata a pessoa pelo primeiro nome", () => {
  const { subject, text } = inviteEmail(base);
  assert.match(subject, /^Zion, /);
  assert.match(text, /^Oi, Zion\./);
});

test("diz quem convidou, nas duas versoes", () => {
  const { text, html } = inviteEmail(base);
  // Sem isto a mensagem chega anonima, que e a forma de um golpe.
  assert.ok(text.includes("Anny Beatriz"));
  assert.ok(html.includes("Anny Beatriz"));
});

test("ensina o que fazer se o convite nao era esperado", () => {
  const { text } = inviteEmail(base);
  assert.match(text, /nao esperava|não esperava/i);
});

test("o link aparece clicavel e em texto puro", () => {
  const { text, html } = inviteEmail(base);
  assert.ok(text.includes(base.url));
  assert.ok(html.includes(`href="${base.url}"`));
  // O endereco tambem cru, para quem le num cliente que bloqueia botao.
  assert.ok(html.lastIndexOf(base.url) > html.indexOf(`href="${base.url}"`));
});

test("mostra o vencimento em horario de Brasilia", () => {
  const { text } = inviteEmail(base);
  // 21:44 UTC do dia 6 e 18:44 do dia 6 em BRT. Em UTC o dia poderia virar.
  assert.ok(text.includes("06 de setembro"));
  assert.ok(text.includes("18:44"));
});

test("escapa o que vier de nome de pessoa", () => {
  const { html } = inviteEmail({ ...base, inviterName: '<script>alert(1)</script>' });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("nome com um unico termo nao quebra", () => {
  const { subject } = inviteEmail({ ...base, name: "Zion" });
  assert.equal(subject, "Zion, seu acesso ao MKT Hub");
});
