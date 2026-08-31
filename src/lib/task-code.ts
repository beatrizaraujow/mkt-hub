/**
 * O nome curto da tarefa: `mkt-123`.
 *
 * Existe porque o identificador de verdade e um UUID, e UUID nao se fala. Ate
 * aqui, mandar uma tarefa para alguem era colar trinta e seis caracteres de
 * hexadecimal no WhatsApp; combinar uma no corredor era impossivel. Com o
 * numero, a mesma tarefa vira "a mkt-123" numa conversa e um link curto numa
 * mensagem.
 *
 * O numero vem de uma sequencia do Postgres, entao ele **nunca se repete e
 * nunca muda** — nem quando a tarefa troca de empresa, de etapa ou de dono.
 * Buraco na contagem e esperado: tarefa apagada leva o numero dela junto, e
 * reaproveitar numero faria um link antigo abrir a tarefa errada.
 */

const PREFIXO = "mkt-";

/** O codigo a partir do numero. Sempre minusculo: e o que vai no link. */
export function codigoDaTarefa(numero: number): string {
  return `${PREFIXO}${numero}`;
}

/**
 * O numero a partir do que veio na URL, ou `null` se aquilo nao e um codigo.
 *
 * Aceita maiuscula porque link colado em conversa volta capitalizado com uma
 * frequencia que surpreende. **Nao aceita numero solto**: `?item=123` seria
 * ambiguo com o UUID e faria a tela abrir a tarefa errada em vez de nao abrir
 * nada.
 */
export function numeroDoCodigo(referencia: string): number | null {
  const limpo = referencia.trim().toLowerCase();
  if (!limpo.startsWith(PREFIXO)) return null;

  const resto = limpo.slice(PREFIXO.length);
  // `Number` aceitaria " 12 ", "0x1f" e "1e3"; nenhum desses e um codigo.
  if (!/^\d+$/.test(resto)) return null;

  const numero = Number(resto);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/** O caminho canonico da tarefa. O painel de detalhe so monta em Trabalho. */
export function caminhoDaTarefa(numero: number): string {
  return `/trabalho?item=${codigoDaTarefa(numero)}`;
}
