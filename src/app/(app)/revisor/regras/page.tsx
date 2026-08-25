import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { assertCanManage, requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
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

      <div className="flex max-w-[860px] flex-col gap-4 px-5 py-5 md:px-7">
        <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-3 text-[12.5px] leading-relaxed text-muted">
          Antes de escrever uma regra, decida <strong className="font-medium">quem consegue
          verificar</strong>: o que a máquina confere olhando a entrega, o que depende de contexto
          que só uma pessoa tem, e o que nem é sobre a entrega. Na dúvida entre máquina e pessoa,
          escolha pessoa — uma reprovação errada custa muito mais caro que uma verificação a menos.
        </p>

        <RulesEditor data={data} />
      </div>
    </>
  );
}
