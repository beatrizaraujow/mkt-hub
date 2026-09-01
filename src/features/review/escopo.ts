import "server-only";
import { isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Casar o recorte de uma regra ou de um item de checklist com a entrega.
 *
 * Parece igualdade de texto e não é, por dois motivos que só aparecem olhando
 * os dados de verdade:
 *
 * **1. A entrega guarda combinação.** O ClickUp permitia marcar mais de um
 * valor em "Tarefas SKILL" e em "Formato SKILL", e a migração trouxe isso
 * inteiro: existem tarefas com `"Captação, Edição de vídeo"` e com
 * `"Vídeo, Vídeo Ads"`. Comparar por igualdade fazia essas tarefas não casarem
 * com recorte nenhum — e o sintoma não é erro: é o checklist simplesmente não
 * aparecer, e a regra simplesmente não ser aplicada. Falha silenciosa e para o
 * lado permissivo.
 *
 * **2. O recorte também é lista.** O bloco de checklist de estático vale para
 * Estático, Estático Ads e Capa de reels. Uma linha por formato multiplicaria
 * o catálogo por três e, pior, faria "mexer no item universal" virar mexer em
 * doze linhas — que é exatamente o contrário do que o documento de validação
 * promete quando escreve UNIVERSAL.
 *
 * Então os dois lados são listas, e a comparação é elemento a elemento e sem
 * caixa: o board tem `"ADS VÍDEOS"` onde o catálogo tem `"ADS vídeos"`, e a
 * diferença de caixa não é uma decisão que alguém tomou.
 *
 * Acento não é normalizado de propósito. `unaccent()` exige extensão instalada
 * no banco, e uma comparação que depende de extensão volta a falhar em
 * silêncio no dia em que alguém subir um ambiente sem ela. Os dois lados vêm
 * do mesmo catálogo e escrevem os acentos igual.
 */

/** `null` no recorte significa "vale para qualquer valor". */
export function casaEscopo(coluna: AnyPgColumn, valor: string | null): SQL | undefined {
  /*
   * Entrega sem valor casa só com recorte vazio. O contrário — deixar a
   * entrega sem tipo pegar o checklist de todos os tipos — encheria a tela de
   * item que não se aplica, e item que não se aplica ensina a marcar sem ler.
   */
  if (!valor) return isNull(coluna);

  return or(
    isNull(coluna),
    sql`exists (
      select 1
        from unnest(string_to_array(${coluna}, ',')) as recorte(v)
        join unnest(string_to_array(${valor}, ',')) as entrega(v)
          on lower(btrim(recorte.v)) = lower(btrim(entrega.v))
    )`,
  );
}
