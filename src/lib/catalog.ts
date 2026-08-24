/**
 * Listas de opcoes herdadas do board House Quatro5 (ver
 * docs/02-clickup-house-quatro5.md). Ficam em codigo de proposito: sao
 * estaveis, entram em filtro e em relatorio, e uma tela de administracao
 * para editar isso nao se paga hoje. Vira tabela quando alguem precisar
 * mudar sem deploy — nao antes.
 */

/** "Tarefas SKILL" — que tipo de trabalho a demanda e. */
export const SKILLS = [
  "Captação",
  "Fotos",
  "Edição de foto",
  "Edição de vídeo",
  "Decupagem",
  "Roteiro de vídeo",
  "Vídeo de post",
  "Vídeo de criativo",
  "ADS vídeos",
  "Animação",
  "Capa de reels",
  "Post feed",
  "Stories",
  "Arte de post",
  "Arte de criativo",
  "Arte de endomarketing",
  "Arte de site",
  "Arte OFF",
  "Id visual",
  "Copy",
  "Planejamento de conteúdos",
  "Apresentações comerciais",
  "Criação de landing page",
  "Otimização de landing page",
  "Setup do Instagram",
  "Catálogo",
  "Tráfego",
  "Participação no evento",
  "Alteração",
  "Demanda extra",
] as const;

/** "Formato SKILL" — formato da peca entregue. */
export const FORMATS = [
  "Estático",
  "Carrossel",
  "Vídeo",
  "Stories",
  "Capa de reels",
  "Estático Ads",
  "Carrossel Ads",
  "Vídeo Ads",
  "Mídia OFF",
  "Outros",
] as const;

/** Tipo de demanda — a pergunta que abre o formulario de solicitacao. */
export const REQUEST_TYPES = [
  "Criação de arte/conteúdo",
  "Edição",
  "Captação",
  "Redação",
  "Nova campanha/Novo projeto",
  "Ativação/Evento",
  "Manutenção/otimização",
  "Demanda avulsa",
] as const;

export type Skill = (typeof SKILLS)[number];
export type Format = (typeof FORMATS)[number];
export type RequestType = (typeof REQUEST_TYPES)[number];

export function isSkill(value: string): value is Skill {
  return (SKILLS as readonly string[]).includes(value);
}

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}

export function isRequestType(value: string): value is RequestType {
  return (REQUEST_TYPES as readonly string[]).includes(value);
}

/** Rotulo curto de prioridade, na ordem em que o banco ordena. */
export const PRIORITY_LABEL = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
} as const;

/**
 * Grupos para a lista de escolha. Trinta opcoes soltas nao se leem com o
 * olho; agrupadas, a pessoa acha pelo caminho que ja conhece.
 */
export type OptionGroup = { label: string | null; items: readonly string[] };

export const SKILL_GROUPS: OptionGroup[] = [
  { label: "Captação", items: ["Captação", "Fotos"] },
  {
    label: "Vídeo",
    items: [
      "Edição de vídeo",
      "Decupagem",
      "Roteiro de vídeo",
      "Vídeo de post",
      "Vídeo de criativo",
      "ADS vídeos",
      "Animação",
      "Capa de reels",
    ],
  },
  {
    label: "Arte",
    items: [
      "Arte de post",
      "Arte de criativo",
      "Arte de endomarketing",
      "Arte de site",
      "Arte OFF",
      "Id visual",
      "Edição de foto",
    ],
  },
  {
    label: "Conteúdo",
    items: ["Copy", "Post feed", "Stories", "Planejamento de conteúdos"],
  },
  {
    label: "Web e mídia",
    items: [
      "Criação de landing page",
      "Otimização de landing page",
      "Setup do Instagram",
      "Catálogo",
      "Tráfego",
      "Apresentações comerciais",
    ],
  },
  { label: "Outros", items: ["Participação no evento", "Alteração", "Demanda extra"] },
];

export const FORMAT_GROUPS: OptionGroup[] = [
  { label: null, items: ["Estático", "Carrossel", "Vídeo", "Stories", "Capa de reels"] },
  { label: "Pago", items: ["Estático Ads", "Carrossel Ads", "Vídeo Ads"] },
  { label: null, items: ["Mídia OFF", "Outros"] },
];
