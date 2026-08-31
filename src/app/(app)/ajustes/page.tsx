import type { Metadata } from "next";
import Link from "next/link";
import { canManage, requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChangePassword } from "@/features/people/change-password";

export const metadata: Metadata = { title: "Ajustes · MKT Hub" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  colaborador: "Colaborador",
  observador: "Observador",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[13.5px] text-ink">{value}</span>
    </div>
  );
}

export default async function AjustesPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Ajustes" description="Sua conta e o seu acesso." />

      <div className="max-w-[560px] px-5 py-5 md:px-7">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <Row label="Nome" value={user.name} />
          <Row label="E-mail" value={user.email} />
          <Row label="Função" value={user.jobTitle ?? "—"} />
          <Row
            label="Papel"
            value={`${ROLE_LABEL[user.role] ?? user.role}${user.isMaster ? " · master" : ""}`}
          />
          <Row
            label="Empresas"
            value={`${user.companyIds.length} ${user.companyIds.length === 1 ? "empresa" : "empresas"}`}
          />
        </div>

        <section className="mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 className="label-mono">Tema</h2>
          <p className="mb-3 mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-faint">
            Vale neste aparelho. Em <strong className="font-medium text-muted">Sistema</strong>, a
            tela acompanha o computador — inclusive quando ele escurece sozinho ao anoitecer.
          </p>
          <ThemeToggle />
        </section>

        <ChangePassword />

        {/*
          O revisor nao ganhou item de menu: enquanto ele estiver em modo
          silencioso, so quem calibra abre — entrada fixa na navegacao para
          ferramenta que o time todo nao usa e ruido.
        */}
        {canManage(user) && (
          <Link
            href="/revisor"
            className="mt-4 flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-dashed border-line px-4 py-3 transition-colors hover:border-line-strong"
          >
            <span>
              <span className="block text-[13px] font-medium text-ink">Revisor de entregas</span>
              <span className="block text-[12px] text-faint">
                Cadastre as regras, aponte para uma entrega e veja o parecer antes de ele valer.
              </span>
            </span>
            <span className="text-[12.5px] text-accent">abrir</span>
          </Link>
        )}

        <p className="mt-4 text-[12.5px] text-faint">
          Regras de pontuação e metas entram na V1.5. Pessoas e permissões ficam em Time.
        </p>
      </div>
    </>
  );
}
