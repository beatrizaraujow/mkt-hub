"use server";

import { requireUserAction } from "@/lib/auth";
import { searchEverything } from "./queries";
import { EMPTY_RESULTS, type SearchResults } from "./types";

/**
 * A busca roda a cada tecla, então erro aqui não vira mensagem vermelha na
 * tela — vira lista vazia. O que importa é a caixa continuar respondendo.
 */
export async function search(term: string): Promise<SearchResults> {
  try {
    const user = await requireUserAction();
    if (typeof term !== "string" || term.length > 120) return EMPTY_RESULTS;
    return await searchEverything(user, term);
  } catch {
    return EMPTY_RESULTS;
  }
}
