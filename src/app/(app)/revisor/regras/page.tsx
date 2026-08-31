import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { assertCanManage, requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ModeBadge } from "@/features/review/mode-badge";
import { RulesEditor } from "@/features/review/rules-editor";
import { loadRules } from "@/features/review/rules-queries";

export const metadata: Metadata = { title: "Regras do revisor · MKT Hub" };
export const dynamic = "force-dynamic";

export default async function RegrasPage() {
  const user = await requireUser();
  assertCanManage(user);

  const data = await loadRules(user);

  return (
    <>
      <PageHeader
        title="Regras do revisor"
        badge={<ModeBadge mode={data.mode} />}
        description="O que o sistema confere. Se não está aqui, não é aplicado."
        actions={
          <Link
            href="/revisor"
            className="flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <ArrowLeft size={14} />
            Diagnóstico
          </Link>
        }
      />

      <div className="flex max-w-[880px] flex-col gap-4 px-5 py-5 md:px-7">
        {/*
          Deixou de ser um retângulo tracejado e virou citação: o texto é o
          método de classificar uma regra, não um aviso do sistema. Tracejado é
          para o que está vazio ou não existe ainda.
        */}
        <p className="max-w-[74ch] border-l-2 border-accent/50 py-0.5 pl-4 text-[13px] leading-relaxed text-muted">
          Máquina confere o que está escrito na peça e não depende de contexto. Pessoa confere o que
          exige ver, ouvir ou saber de onde veio. Se você precisa explicar a regra para a máquina em
          mais de três linhas, ela é de pessoa — e uma reprovação errada custa muito mais caro que
          uma verificação a menos.
        </p>

        <RulesEditor data={data} />
      </div>
    </>
  );
}
