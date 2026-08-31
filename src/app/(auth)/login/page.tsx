import type { Metadata } from "next";
import { LoginLockup } from "@/components/login-lockup";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · MKT Hub" };

/**
 * A porta de entrada.
 *
 * Duas metades: a citação sobre um degradê quente à esquerda, o formulário à
 * direita. **É a única tela do sistema que não usa os tokens de cor**, e isso é
 * escolha, não esquecimento: quem chega aqui ainda não tem sessão, então não há
 * tema para respeitar, e o desenho é fechado em preto e ouro — metade dele é um
 * degradê que só existe no escuro. Por isso o preto é pintado explicitamente,
 * em vez de herdar o `--bg` do corpo, que no tema claro é quase branco.
 *
 * O ouro daqui **não** é o `--reward`. Aquele âmbar codifica coin, ranking e
 * meta batida dentro da aplicação; este é a cor da marca na porta, onde não há
 * nenhuma das três coisas para confundir com ele.
 *
 * A citação some abaixo de `lg`. Ela é um cartão de altura inteira com um
 * degradê pesado: espremida num celular vira uma faixa que não diz nada e
 * empurra o formulário para baixo da dobra. No lugar dela fica o mesmo brilho,
 * difuso, atrás do formulário — a tela continua sendo a mesma tela.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    // `color-scheme: dark` faz o navegador pintar cursor, barra de rolagem e
    // seleção no escuro mesmo com o sistema no claro. Sem isso a tela preta
    // ganha uma barra de rolagem branca em metade das máquinas da casa.
    <main className="grid min-h-dvh grid-cols-1 bg-black [color-scheme:dark] lg:grid-cols-[1.02fr_.98fr]">
      <div className="hidden p-[clamp(20px,3.2vh,34px)] pl-[clamp(28px,4.2vw,60px)] pr-0 lg:block">
        <div className="login-entra relative flex h-full flex-col justify-between overflow-hidden rounded-[26px] bg-[#050505] p-[clamp(34px,5.6vh,66px)] px-[clamp(30px,3.4vw,50px)]">
          {/*
            O degradê é um radial só, deslocado para a direita, com a sombra
            interna fechando as bordas. Sem a sombra o cartão parece uma foto
            recortada; com ela, parece iluminado por dentro.
          */}
          <div
            aria-hidden
            className="login-brilho pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(78% 66% at 76% 58%, #f6f0d6 0%, #e3d29a 16%, #b99e42 34%, #6a5a1c 54%, #2a2409 72%, rgba(6,5,2,0) 92%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[26px] shadow-[inset_0_0_120px_40px_rgba(0,0,0,.5)]"
          />

          <div className="login-sobe relative flex flex-col gap-[clamp(14px,2.4vh,28px)]">
            <h2 className="font-display text-[clamp(34px,4.6vw,68px)] font-semibold leading-[1.04] tracking-[-0.025em] text-white">
              O prazer
              <br />
              no trabalho
              <br />
              aperfeiçoa
              <br />
              a obra.
            </h2>
            <span
              aria-hidden
              className="block text-[clamp(52px,6vw,92px)] font-extrabold leading-[.4] text-[#ffc71c]"
            >
              &rdquo;
            </span>
          </div>

          <p className="login-sobe login-sobe-2 relative text-[clamp(16px,1.5vw,23px)] font-medium text-[#f4f4f0]">
            — Aristóteles
          </p>
        </div>
      </div>

      <div className="relative flex items-center px-[clamp(28px,6vw,110px)] py-[clamp(28px,5vh,64px)]">
        {/* O mesmo brilho da citação, difuso, para o celular não ficar num preto liso. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[.22] lg:hidden"
          style={{
            background:
              "radial-gradient(90% 46% at 50% 0%, #b99e42 0%, #2a2409 46%, rgba(6,5,2,0) 78%)",
          }}
        />

        <div className="relative flex w-full min-w-0 max-w-[560px] flex-col gap-[clamp(22px,3.4vh,40px)]">
          <LoginLockup className="login-sobe text-[#ffc71c]" />

          <h1 className="login-sobe login-sobe-2 font-display text-[clamp(34px,4.4vw,64px)] font-bold leading-[1.05] tracking-[-0.03em] text-white">
            Pronto para
            <br />
            começar?
          </h1>

          <div className="login-sobe login-sobe-3">
            <LoginForm next={next} />
          </div>

          <p className="login-sobe login-sobe-4 text-[13px] leading-relaxed text-[#7d7a72]">
            Acesso interno. Perdeu a senha? Fale com quem administra o sistema.
          </p>
        </div>
      </div>
    </main>
  );
}
