import "server-only";
import { canManage, type CurrentUser } from "@/lib/auth";
import { revisoresDesignados } from "./settings";

/**
 * Quem pode abrir o Revisor.
 *
 * Gestor para cima entra sempre. Abaixo disso entra quem foi **designado**
 * revisor — o mesmo desenho das Rotinas, onde a seção aparece para quem
 * gerencia e para quem ela alcança.
 *
 * A alternativa seria promover a pessoa a gestor, o que abriria Time, Empresas,
 * Ajustes, Rotinas e Desempenho junto. Revisar peça não implica convidar gente
 * nem fechar semana; teto largo demais para abrir uma porta só.
 */
export async function podeVerRevisor(user: CurrentUser): Promise<boolean> {
  if (canManage(user)) return true;

  const ids = await revisoresDesignados(user.orgId);
  return ids.includes(user.id);
}

/**
 * O porteiro do servidor. **É este que vale** — o menu apenas reflete.
 *
 * Regras e Medição continuam em `assertCanManage`: são as telas que decidem
 * como o time inteiro é avaliado, e ver parecer não é o mesmo que escrever a
 * régua que o produz.
 */
export async function assertPodeVerRevisor(user: CurrentUser) {
  if (!(await podeVerRevisor(user))) {
    throw new Error("Ação restrita a gestores e revisores designados.");
  }
}
