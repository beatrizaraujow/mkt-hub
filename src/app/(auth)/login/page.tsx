import type { Metadata } from "next";
import { Wordmark } from "@/components/wordmark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · MKT Hub" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-[340px]">
        <div className="mb-8">
          <Wordmark />
          <p className="mt-3 text-[13px] text-muted">
            Gestão de equipe, tarefas e produção de conteúdo.
          </p>
        </div>

        <LoginForm next={next} />

        <p className="mt-8 text-[12px] text-faint">
          Acesso interno. Perdeu a senha? Fale com quem administra o sistema.
        </p>
      </div>
    </main>
  );
}
