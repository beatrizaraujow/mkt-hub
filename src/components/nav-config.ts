import type { UserRole } from "@/db/schema";

/**
 * So dado serializavel aqui. O componente de icone e resolvido dentro do
 * Sidebar, que e client — funcao nao atravessa a fronteira servidor/cliente.
 */
export type NavIcon =
  | "hoje"
  | "trabalho"
  | "producao"
  | "rotinas"
  | "desempenho"
  | "time"
  | "empresas"
  | "revisor"
  | "ajustes";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Ainda nao construido — aparece apagado e nao navega. */
  soon?: boolean;
  /** Papel minimo para ver o item. */
  minRole?: UserRole;
  /**
   * Item que so aparece para quem a rotina alcanca.
   *
   * Papel nao resolve isto: Samuel, Thiago e Klenio sao colaboradores como o
   * Zion e a Maria Luiza, mas a regua deles e pontos. A grade de rotina, para
   * eles, sao trinta e oito linhas do trabalho de outra pessoa.
   */
  soComRotina?: boolean;
  /** Aparece na barra inferior do celular. */
  mobile?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Hoje", icon: "hoje", mobile: true },
  { href: "/trabalho", label: "Trabalho", icon: "trabalho", mobile: true },
  { href: "/producao", label: "Produção", icon: "producao", soon: true },
  { href: "/rotinas", label: "Rotinas", icon: "rotinas", mobile: true, soComRotina: true },
  { href: "/desempenho", label: "Desempenho", icon: "desempenho", mobile: true },
  /**
   * O revisor fica no bloco de quem gerencia, junto de Time, e nao logo apos
   * Trabalho: entre os tres itens apagados de "breve", um item vivo no meio
   * quebra a leitura da lista. Colaborador nao ve nenhum dos dois.
   */
  { href: "/revisor", label: "Revisor", icon: "revisor", minRole: "gestor" },
  { href: "/time", label: "Time", icon: "time", minRole: "gestor" },
  { href: "/empresas", label: "Empresas", icon: "empresas", mobile: true },
  { href: "/ajustes", label: "Ajustes", icon: "ajustes", mobile: true },
];

const RANK: Record<UserRole, number> = {
  observador: 0,
  colaborador: 1,
  gestor: 2,
  admin: 3,
};

/**
 * O menu de quem esta olhando.
 *
 * `temRotina` vem do banco, nao do papel: e a resposta a "existe rotina
 * atribuida a esta pessoa". Quem gerencia ve de qualquer jeito — a aderencia
 * entra na pontuacao da semana, e nao da para validar um fechamento sem poder
 * conferir a grade que o alimenta.
 */
export function visibleNav(
  role: UserRole,
  opcoes: { temRotina?: boolean } = {},
) {
  const gerencia = RANK[role] >= RANK.gestor;
  return NAV.filter((item) => {
    if (item.minRole && RANK[role] < RANK[item.minRole]) return false;
    if (item.soComRotina && !gerencia && !opcoes.temRotina) return false;
    return true;
  });
}
