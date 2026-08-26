"use client";

import {
  Archive,
  Check,
  CheckCheck,
  Eye,
  Inbox,
  List,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { stageColor } from "@/lib/stages";

/**
 * O pill da etapa. O mesmo na lista e no quadro — etapa X tem a mesma cor nos
 * dois modos, sempre, porque a cor sai de um lugar só (`lib/stages`).
 *
 * O ícone é resolvido **aqui**, no cliente. O servidor manda o nome; função
 * não atravessa a fronteira.
 */
const ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  list: List,
  play: Play,
  eye: Eye,
  sparkles: Sparkles,
  rotate: RotateCcw,
  check: Check,
  shield: ShieldCheck,
  send: Send,
  checkCheck: CheckCheck,
  archive: Archive,
};

export function StagePill({
  name,
  slug,
  size = "md",
  className,
}: {
  /** O nome vem da linha do banco, não do módulo: ele é livre e customizável. */
  name: string;
  slug: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const style = stageColor(slug);
  const Icon = ICONS[style.icon] ?? List;

  return (
    <span
      style={{ background: style.color, color: style.ink }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold uppercase tracking-[0.04em]",
        size === "sm" ? "h-[19px] px-2 text-[10px]" : "h-[23px] px-2.5 text-[11px]",
        className,
      )}
    >
      <Icon size={size === "sm" ? 11 : 12} strokeWidth={2.5} aria-hidden />
      {name}
    </span>
  );
}
