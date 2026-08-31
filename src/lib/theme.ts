/**
 * Claro, escuro, ou o que o sistema operacional disser.
 *
 * A preferencia mora no `localStorage`, nao no banco. Tema e escolha de
 * aparelho, nao de pessoa: a mesma pessoa quer escuro no notebook a noite e
 * claro no monitor da mesa de dia. Guardar no banco sincronizaria os dois pelo
 * pior dos dois, e ainda custaria migration numa tabela viva.
 *
 * Nao ha estado padrao gravado: `sistema` e a ausencia da chave. Assim quem
 * nunca escolheu continua seguindo o aparelho para sempre, inclusive se o
 * aparelho mudar de ideia ao anoitecer.
 */

export type Tema = "claro" | "escuro" | "sistema";

export const TEMA_CHAVE = "tema";

/** Trocar o tema numa aba avisa as outras. `storage` so cruza abas. */
export const TEMA_EVENTO = "mkt-hub:tema";

/**
 * O script que roda antes da primeira pintura.
 *
 * Precisa ser sincrono e estar no HTML: qualquer coisa que espere o React
 * hidratar pinta a tela clara primeiro e escurece depois, e esse pisco branco
 * na cara de quem abre o sistema as sete da manha e pior que nao ter a opcao.
 *
 * Escrito como string porque e injetado inteiro no `<head>`. O `try` existe
 * porque `localStorage` lanca em janela anonima com dados de site bloqueados —
 * e ai o certo e seguir o sistema, nao quebrar a pagina.
 */
export const TEMA_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  TEMA_CHAVE,
)});var c=document.documentElement.classList;c.remove("light","dark");if(t==="claro")c.add("light");else if(t==="escuro")c.add("dark");}catch(e){}})();`;

/** O que esta gravado. Qualquer coisa fora do combinado vira `sistema`. */
export function lerTema(): Tema {
  try {
    const valor = localStorage.getItem(TEMA_CHAVE);
    return valor === "claro" || valor === "escuro" ? valor : "sistema";
  } catch {
    return "sistema";
  }
}

/** Escreve, aplica e avisa. As tres coisas juntas, senao alguma fica para tras. */
export function gravarTema(tema: Tema) {
  try {
    if (tema === "sistema") localStorage.removeItem(TEMA_CHAVE);
    else localStorage.setItem(TEMA_CHAVE, tema);
  } catch {
    // Sem armazenamento a escolha vale so ate recarregar. Melhor que recusar.
  }

  aplicarTema(tema);
  window.dispatchEvent(new Event(TEMA_EVENTO));
}

export function aplicarTema(tema: Tema) {
  const classes = document.documentElement.classList;
  classes.remove("light", "dark");
  if (tema === "claro") classes.add("light");
  if (tema === "escuro") classes.add("dark");
}
