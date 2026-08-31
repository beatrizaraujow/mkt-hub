"use server";

import { assertCanManage, requireUserAction } from "@/lib/auth";
import { pickCandidates, type PickFilters, type PickRow } from "./pick";

/**
 * A busca da caixa de trocar entrega. Roda a cada tecla, então erro aqui não
 * vira mensagem vermelha: vira lista vazia, e a caixa continua respondendo.
 *
 * A autorização é a mesma da página — o revisor inteiro é de quem gerencia, e
 * uma action que devolvesse tarefa para quem não abre a tela seria um vazamento
 * por porta lateral.
 */
export async function searchDeliveries(
  filters: PickFilters,
): Promise<{ rows: PickRow[]; total: number }> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    if (typeof filters?.term === "string" && filters.term.length > 120) {
      return { rows: [], total: 0 };
    }

    return await pickCandidates(user, filters);
  } catch {
    return { rows: [], total: 0 };
  }
}
