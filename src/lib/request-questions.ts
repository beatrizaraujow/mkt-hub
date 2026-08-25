import type { RequestType } from "./catalog";

/**
 * Perguntas extras por tipo de demanda.
 *
 * O board antigo tinha cerca de cem campos de briefing (ver
 * docs/02-clickup-house-quatro5.md) e a maioria chegava vazia. Aqui sao no
 * maximo quatro por tipo — as que mudam o que a pessoa vai produzir. Campo
 * que nao muda a entrega e campo que so atrasa quem pede.
 *
 * A resposta vai para `work_items.meta.briefing`, nao para coluna: nao entra
 * em calculo nem em filtro, e cada tipo pergunta uma coisa diferente.
 */
export type Question = {
  /** Chave em `meta.briefing`. Estavel — nao renomear depois de usada. */
  key: string;
  label: string;
  kind: "text" | "textarea" | "select";
  options?: readonly string[];
  placeholder?: string;
  required?: boolean;
};

export const QUESTIONS: Record<RequestType, readonly Question[]> = {
  "Criação de arte/conteúdo": [
    { key: "publico", label: "Para quem é", kind: "text", placeholder: "Quem precisa ver isso" },
    {
      key: "mensagem",
      label: "Mensagem principal",
      kind: "textarea",
      placeholder: "Se a pessoa lembrar de uma frase só, qual é?",
      required: true,
    },
    {
      key: "formato",
      label: "Formato",
      kind: "select",
      options: ["Estático", "Carrossel", "Vídeo", "Stories", "Ainda não sei"],
    },
    { key: "impulsionar", label: "Vai virar anúncio?", kind: "select", options: ["Não", "Sim"] },
  ],

  Edição: [
    {
      key: "material",
      label: "Link do material bruto",
      kind: "text",
      placeholder: "Drive, WeTransfer, YouTube…",
      required: true,
    },
    { key: "duracao", label: "Duração ou quantidade", kind: "text", placeholder: "30s · 3 cortes" },
    {
      key: "recorte",
      label: "O que precisa aparecer",
      kind: "textarea",
      placeholder: "Trechos, momentos, o que cortar fora",
    },
  ],

  Captação: [
    { key: "local", label: "Onde", kind: "text", placeholder: "Endereço ou nome do lugar", required: true },
    { key: "quando", label: "Dia e hora", kind: "text", placeholder: "12/09, das 9h às 11h", required: true },
    { key: "quem", label: "Quem aparece", kind: "text", placeholder: "Nome de quem vai ser filmado" },
    {
      key: "formato",
      label: "Formato",
      kind: "select",
      options: ["Vertical 9:16", "Horizontal 16:9", "Quadrado 1:1", "Ainda não sei"],
    },
  ],

  Redação: [
    { key: "onde", label: "Onde vai ser publicado", kind: "text", placeholder: "Instagram, site, e-mail…" },
    { key: "tom", label: "Tom", kind: "text", placeholder: "Direto, técnico, informal…" },
    {
      key: "obrigatorio",
      label: "O que não pode faltar",
      kind: "textarea",
      placeholder: "Dados, nomes, condições, aviso legal",
    },
  ],

  "Nova campanha/Novo projeto": [
    {
      key: "plataforma",
      label: "Onde vai rodar",
      kind: "select",
      options: ["Meta", "Google", "TikTok", "LinkedIn", "Mais de uma", "Ainda não sei"],
    },
    { key: "verba", label: "Verba prevista", kind: "text", placeholder: "R$ 3.000 no mês" },
    { key: "duracao", label: "Por quanto tempo", kind: "text", placeholder: "Duas semanas" },
    {
      key: "sucesso",
      label: "O que conta como sucesso",
      kind: "text",
      placeholder: "40 leads, 15 vendas, alcance de 50 mil",
      required: true,
    },
  ],

  "Ativação/Evento": [
    { key: "local", label: "Onde", kind: "text", required: true },
    { key: "quando", label: "Dia e hora", kind: "text", required: true },
    {
      key: "entregas",
      label: "O que precisa estar pronto",
      kind: "textarea",
      placeholder: "Banner, camisa, convite, post de aquecimento…",
      required: true,
    },
  ],

  "Manutenção/otimização": [
    {
      key: "atual",
      label: "Link do que está no ar",
      kind: "text",
      placeholder: "Página, anúncio, perfil…",
      required: true,
    },
    { key: "mudar", label: "O que precisa mudar", kind: "textarea", required: true },
  ],

  // De propósito sem perguntas: é a saída para o que não se encaixa.
  "Demanda avulsa": [],
};

/** Captação vira item do pipeline de captação; o resto é tarefa. */
export function itemTypeFor(request: RequestType) {
  return request === "Captação" ? ("capture" as const) : ("task" as const);
}
