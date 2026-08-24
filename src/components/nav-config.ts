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
  | "ajustes";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Ainda nao construido — aparece apagado e nao navega. */
  soon?: boolean;
  /** Papel minimo para ver o item. */
  minRole?: UserRole;
  /** Aparece na barra inferior do celular. */
  mobile?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Hoje", icon: "hoje", mobile: true },
  { href: "/trabalho", label: "Trabalho", icon: "trabalho", mobile: true },
  { href: "/producao", label: "Produção", icon: "producao", soon: true },
  { href: "/rotinas", label: "Rotinas", icon: "rotinas", soon: true },
  { href: "/desempenho", label: "Desempenho", icon: "desempenho", soon: true },
  { href: "/time", label: "Time", icon: "time", soon: true, minRole: "gestor" },
  { href: "/empresas", label: "Empresas", icon: "empresas", mobile: true },
  { href: "/ajustes", label: "Ajustes", icon: "ajustes", mobile: true },
];

const RANK: Record<UserRole, number> = {
  observador: 0,
  colaborador: 1,
  gestor: 2,
  admin: 3,
};

export function visibleNav(role: UserRole) {
  return NAV.filter((item) => !item.minRole || RANK[role] >= RANK[item.minRole]);
}
