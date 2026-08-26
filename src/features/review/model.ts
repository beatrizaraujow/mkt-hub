import "server-only";
import { anthropicConfigured, anthropicModel, askAnthropic } from "./model-anthropic";
import { askGemini, geminiConfigured, geminiModel } from "./model-gemini";
import type { ModelAnswer, ModelRequest, Provider } from "./model-contract";

export { ModelError } from "./model-contract";
export type { Block, ModelAnswer, ModelRequest, Provider } from "./model-contract";

/**
 * Qual modelo responde.
 *
 * Este arquivo escolhe o provedor e passa adiante. **Não julga nada**, e é
 * de propósito que ele seja a única coisa que muda quando se troca de modelo:
 * o porteiro, o julgamento, o veredito e as telas não sabem quem respondeu.
 *
 * Trocar de provedor é uma variável de ambiente. Trocar de raciocínio seria
 * outra obra — e é exatamente essa diferença que a fronteira compra.
 */

/**
 * `REVIEW_PROVIDER` manda. Sem ele, vale a chave que existir: quem configurou
 * só o Gemini não deve receber um erro dizendo que falta a chave da Anthropic.
 */
export function provider(): Provider {
  const chosen = process.env.REVIEW_PROVIDER?.trim().toLowerCase();
  if (chosen === "gemini" || chosen === "anthropic") return chosen;

  if (!anthropicConfigured() && geminiConfigured()) return "gemini";
  return "anthropic";
}

export function modelName(): string {
  return provider() === "gemini" ? geminiModel() : anthropicModel();
}

/** Se existe chave para o provedor escolhido. A tela de regras mostra isto. */
export function modelConfigured(): boolean {
  return provider() === "gemini" ? geminiConfigured() : anthropicConfigured();
}

export async function askModel(input: ModelRequest): Promise<ModelAnswer> {
  return provider() === "gemini" ? askGemini(input) : askAnthropic(input);
}
