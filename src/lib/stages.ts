import type { StageKind, UserRole } from "@/db/schema";

/**
 * As etapas do pipeline de tarefa: ordem, cor, ícone e quem consegue sair.
 *
 * **O banco manda, este arquivo pinta.** As linhas de verdade vivem em
 * `work_item_stages`, uma por organização — é o que permite uma empresa
 * renomear a etapa dela na V2 sem deploy. O que mora aqui é o que não faz
 * sentido guardar por linha: a cor da marca, o ícone e a regra de papel.
 *
 * A ligação entre os dois é o `slug`, que é estável. O `name` é livre e pode
 * mudar; o slug não muda nunca — se mudar, a etapa perde a cor e vira cinza,
 * que é uma falha visível e não um erro silencioso.
 *
 * Nenhum componente pode ter cor de etapa, rótulo ou regra de papel escritos à
 * mão. Tudo sai daqui.
 */

export type StagePresentation = {
  slug: string;
  /** Nome semeado no banco. A tela mostra o `name` da linha, não este. */
  label: string;
  kind: StageKind;
  /** Cor sólida do pill. A mesma na lista e no quadro, sempre. */
  color: string;
  /**
   * Cor do texto sobre o pill, medida e não escolhida no olho.
   *
   * Texto branco só passa em contraste 4.5:1 sobre duas das onze cores — sobre
   * o amarelo ele dá 1.63:1, que é ilegível. Escuro passa em dez das onze.
   * Um pill branco no meio de dez escuros pareceria defeito, então é escuro em
   * todos, e o único que fica abaixo do ideal está anotado no fim do arquivo.
   */
  ink: string;
  position: number;
  /** Fim de linha: o arquivo do que já rodou. Não é para onde "concluir" leva. */
  terminal: boolean;
  /** Nome do ícone. Função não atravessa a fronteira servidor/cliente. */
  icon: string;
  /**
   * Papel mínimo para **tirar** o item desta etapa. Nulo = qualquer pessoa que
   * já pode escrever. Conferido no servidor, em `setStage` — o cliente não
   * decide nada, ele só evita mostrar o que vai ser recusado.
   */
  minRoleToLeave: UserRole | null;
};

const INK = "#0B0F14";

export const TASK_STAGES: StagePresentation[] = [
  {
    slug: "solicitado",
    label: "Solicitado",
    kind: "backlog",
    color: "#8A8F98",
    ink: INK,
    position: 10,
    terminal: false,
    icon: "inbox",
    minRoleToLeave: null,
  },
  {
    slug: "pendente",
    label: "Pendente",
    kind: "todo",
    color: "#6B7280",
    ink: INK,
    position: 20,
    terminal: false,
    icon: "list",
    minRoleToLeave: null,
  },
  {
    slug: "em_andamento",
    label: "Em andamento",
    kind: "doing",
    color: "#F5C518",
    ink: INK,
    position: 30,
    terminal: false,
    icon: "play",
    minRoleToLeave: null,
  },
  {
    slug: "pre_revisao",
    label: "Pré revisão",
    kind: "review",
    color: "#8B5CF6",
    ink: INK,
    position: 40,
    terminal: false,
    icon: "eye",
    minRoleToLeave: null,
  },
  {
    slug: "revisao_ia",
    label: "Revisão IA",
    kind: "review",
    color: "#06B6D4",
    ink: INK,
    position: 50,
    terminal: false,
    icon: "sparkles",
    minRoleToLeave: null,
  },
  {
    slug: "ajustar",
    label: "Ajustar",
    kind: "doing",
    color: "#E5352B",
    ink: INK,
    position: 60,
    terminal: false,
    icon: "rotate",
    minRoleToLeave: null,
  },
  {
    slug: "aprovacao",
    label: "Aprovação",
    kind: "review",
    color: "#14B8A6",
    ink: INK,
    position: 70,
    terminal: false,
    icon: "check",
    minRoleToLeave: null,
  },
  {
    slug: "aprovacao_lider",
    label: "Aprovação líder",
    kind: "review",
    color: "#F07C1E",
    ink: INK,
    position: 80,
    terminal: false,
    icon: "shield",
    // O aval final é da liderança. Colaborador vê o item aqui e não o move.
    minRoleToLeave: "gestor",
  },
  {
    slug: "publicar",
    label: "Publicar",
    kind: "doing",
    color: "#E5187F",
    ink: INK,
    position: 90,
    terminal: false,
    icon: "send",
    minRoleToLeave: null,
  },
  {
    slug: "completo",
    label: "Completo",
    kind: "done",
    color: "#16A34A",
    ink: INK,
    position: 100,
    terminal: false,
    icon: "checkCheck",
    minRoleToLeave: null,
  },
  {
    slug: "banco_criativos",
    label: "Banco de criativos",
    kind: "done",
    color: "#2F6BFF",
    ink: INK,
    position: 110,
    terminal: true,
    icon: "archive",
    minRoleToLeave: null,
  },
];

const BY_SLUG = new Map(TASK_STAGES.map((stage) => [stage.slug, stage]));

/** Cinza neutro para etapa sem apresentação — conteúdo, captação, ou slug novo. */
export const NEUTRAL: Pick<StagePresentation, "color" | "ink" | "icon"> = {
  color: "#6B7280",
  ink: INK,
  icon: "list",
};

export function presentationFor(slug: string | null | undefined) {
  return (slug && BY_SLUG.get(slug)) || null;
}

export function stageColor(slug: string | null | undefined) {
  return presentationFor(slug) ?? NEUTRAL;
}

/**
 * Pode tirar o item desta etapa?
 *
 * Vale para qualquer chamador — o servidor usa para recusar, o cliente para
 * não oferecer o que seria recusado. A recusa que conta é a do servidor.
 */
export function canLeaveStage(role: UserRole, slug: string | null | undefined) {
  const needed = presentationFor(slug)?.minRoleToLeave;
  if (!needed) return true;
  return RANK[role] >= RANK[needed];
}

export function leaveDeniedMessage(slug: string | null | undefined) {
  const stage = presentationFor(slug);
  return `Só a liderança tira um item de "${stage?.label ?? "esta etapa"}".`;
}

/**
 * Espelha `lib/auth`. Fica repetido de propósito: este arquivo é importado
 * pelo cliente, e `lib/auth` puxa sessão, cookie e banco junto.
 */
const RANK: Record<UserRole, number> = {
  observador: 0,
  colaborador: 1,
  gestor: 2,
  admin: 3,
};

/**
 * Contraste medido do texto `#0B0F14` sobre cada cor, em 26/08/2026:
 *
 *   em_andamento 12.88 · revisao_ia 8.65 · aprovacao 8.44 · aprovacao_lider 7.61
 *   solicitado 6.46 · completo 6.37 · pre_revisao 4.96 · ajustar 4.88
 *   publicar 4.77 · banco_criativos 4.67 · pendente 4.34
 *
 * Dez passam o mínimo de 4.5:1. **`pendente` (#6B7280) fica em 4.34** — falha
 * por pouco e continua legível, mas é o único fora do padrão. Clarear o cinza
 * resolveria; a cor é decisão de quem desenhou o pipeline, não minha.
 */
