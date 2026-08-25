/**
 * Busca ignora acento e caixa: ninguém digita "vídeo" com acento num filtro,
 * e quem digita não pode ficar sem resultado por isso.
 */
export function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Os mesmos pares de tradução, para o Postgres fazer a dobra do lado dele.
 *
 * `unaccent` resolveria em uma linha, mas é extensão: exigiria migration e
 * privilégio para criar. `translate` é função nativa, trabalha por caractere
 * e não precisa de nada instalado — o texto já vem em minúscula, então só as
 * minúsculas entram na tabela.
 */
export const PG_ACCENTED = "áàâãäéèêëíìîïóòôõöúùûüçñ";
export const PG_PLAIN = "aaaaaeeeeiiiiooooouuuucn";
