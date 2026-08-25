/**
 * Erro de banco, desembrulhado.
 *
 * O driver embrulha o erro do Postgres: a mensagem de fora só diz "Failed
 * query" com o SQL inteiro colado, e o motivo real — nome da constraint,
 * coluna, detalhe — fica em `cause`. Quem olha só a mensagem de fora não
 * consegue distinguir "código repetido" de qualquer outra falha, e o usuário
 * recebe um `insert into ...` na cara.
 *
 * Isto já tinha custado tempo uma vez, no log do cron. Mora aqui para não
 * custar de novo.
 */

/** A cadeia de mensagens, da de fora para a de dentro. */
export function describeError(error: unknown, limit = 5): string {
  const parts: string[] = [];
  let current = error;

  for (let i = 0; i < limit && current instanceof Error; i++) {
    parts.push(current.message);
    current = (current as Error & { cause?: unknown }).cause;
  }

  return parts.join(" | ") || "Erro desconhecido.";
}

/** Se o trecho aparece em qualquer nível — é como se reconhece uma constraint. */
export function errorMentions(error: unknown, needle: string): boolean {
  return describeError(error).includes(needle);
}
