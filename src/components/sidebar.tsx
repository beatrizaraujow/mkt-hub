"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  CircleDot,
  Factory,
  ListChecks,
  LogOut,
  Settings,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import type { NavIcon, NavItem } from "@/components/nav-config";
import { TimerWidget } from "@/features/time/timer-widget";
import { GlobalSearch } from "@/features/search/global-search";
import type { RunningTimer } from "@/features/time/queries";

const ICONS: Record<NavIcon, LucideIcon> = {
  hoje: CircleDot,
  trabalho: ListChecks,
  producao: Factory,
  rotinas: CalendarCheck,
  desempenho: Trophy,
  time: Users,
  empresas: Building2,
  // O mesmo icone do pill da etapa REVISÃO IA: quem ve um reconhece o outro.
  revisor: Sparkles,
  ajustes: Settings,
};

type Props = {
  items: NavItem[];
  running: RunningTimer | null;
  user: { name: string; jobTitle: string | null; avatarUrl: string | null };
  logoutAction: () => Promise<void>;
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({ items, user, running, logoutAction }: Props) {
  const pathname = usePathname();

  return (
    <>
      {/*
        desktop — presa no topo, com a altura da janela.

        `sticky` em vez de fazer o conteudo rolar num container proprio: assim
        quem rola continua sendo o documento, e o `sticky` dos cabecalhos de
        coluna do quadro (que se prende ao scroll do documento) segue
        funcionando. Trocar o elemento que rola quebraria aquilo sem aviso, e
        tambem a restauracao de posicao ao voltar de uma tela para outra.
      */}
      <aside className="sticky top-0 hidden h-dvh w-[212px] shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-14 items-center px-4">
          <Logo className="w-[124px]" />
        </div>

        {/* A caixa fica montada aqui e o atalho vale em qualquer tela. */}
        <div className="px-2.5 pb-1">
          <GlobalSearch />
        </div>

        {/*
          Rola por dentro quando a janela e baixa demais para os itens. Sem
          isto, `h-dvh` cortaria o rodape com o nome de quem esta logado — e o
          botao de sair junto.
        */}
        <nav className="scroll-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-2">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = ICONS[item.icon];

            if (item.soon) {
              return (
                <span
                  key={item.href}
                  className="flex cursor-default items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-[7px] text-[13.5px] text-faint"
                  title="Ainda não construído"
                >
                  <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="label-mono shrink-0 whitespace-nowrap !text-[9px]">breve</span>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-[7px] text-[13.5px] transition-colors duration-150",
                  active
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:bg-hover hover:text-ink",
                )}
              >
                <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <TimerWidget running={running} />

        <div className="flex items-center gap-2.5 border-t border-line px-3 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
            {user.jobTitle ? (
              <p className="truncate text-[11.5px] text-faint">{user.jobTitle}</p>
            ) : null}
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </aside>

      {/* celular — barra inferior, nao o desktop encolhido */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {items
          .filter((i) => i.mobile)
          .map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px]",
                  active ? "text-accent" : "text-faint",
                )}
              >
                <Icon size={19} strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
      </nav>
    </>
  );
}
