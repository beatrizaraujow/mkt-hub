import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { inviteHolder } from "@/features/people/actions";
import { AcceptInviteForm } from "@/features/people/accept-invite-form";

export const metadata: Metadata = { title: "Convite · MKT Hub", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const holder = await inviteHolder(token);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <Logo className="w-[150px]" />
      </div>

      {!holder ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h1 className="font-display text-[19px] font-semibold text-ink">Convite não vale mais</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Ele pode ter vencido, já ter sido usado, ou um novo pode ter sido gerado no lugar dele.
            Peça outro a quem administra o sistema.
          </p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h1 className="font-display text-[19px] font-semibold text-ink">
            Bem-vindo, {holder.name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Defina a sua senha para entrar. Ela é sua — ninguém mais vê, nem quem convidou.
          </p>
          <p className="mt-1 text-[12.5px] text-faint">{holder.email}</p>

          <AcceptInviteForm token={token} />
        </div>
      )}
    </main>
  );
}
