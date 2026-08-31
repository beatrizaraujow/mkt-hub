"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { login, type LoginState } from "./actions";

/**
 * O formulário da porta de entrada.
 *
 * Fora do sistema de tokens de propósito: esta tela é um desenho fechado, preto
 * e ouro, e não acompanha o tema claro. Quem chega aqui ainda não tem sessão —
 * não há preferência de tema para respeitar, e metade da tela é um degradê que
 * só existe no escuro.
 */

const CAMPO =
  "login-field h-[clamp(56px,7.4vh,72px)] w-full rounded-[16px] border border-white/[.06] " +
  "bg-[#171717] px-5 text-[16px] text-white placeholder:text-[#54524c] " +
  "transition-[border-color,background-color] duration-300 " +
  "focus:border-[#ffc71c] focus:bg-[#1c1b17] focus:outline-none";

const ROTULO = "text-[15px] font-medium text-[#e9e9e5]";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "mt-[clamp(8px,2.4vh,26px)] h-[clamp(58px,8vh,76px)] rounded-[16px]",
        "bg-[#ffc71c] text-[17px] font-semibold text-[#191300]",
        "transition-[filter,transform] duration-200",
        "hover:-translate-y-px hover:brightness-[1.07] active:translate-y-0",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(login, {});
  const [aberta, setAberta] = useState(false);
  /**
   * O e-mail é controlado só para sobreviver ao envio. Formulário com server
   * action é limpo pelo React quando volta, e voltar de "senha incorreta" com o
   * e-mail apagado faz a pessoa digitar tudo de novo por um erro que não foi
   * dela. A senha continua sendo apagada, que é o certo.
   */
  const [email, setEmail] = useState("");

  return (
    <form action={action} className="flex flex-col gap-[clamp(16px,2.4vh,26px)]">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label className="flex flex-col gap-2.5">
        <span className={ROTULO}>Email</span>
        <input
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoFocus
          required
          placeholder="voce@grupo.com"
          className={CAMPO}
        />
      </label>

      <label className="flex flex-col gap-2.5">
        <span className={ROTULO}>Senha</span>
        <span className="relative block">
          <input
            name="password"
            /*
             * `type` alternado no cliente, e não um campo de texto com máscara
             * própria: assim o gerenciador de senhas do navegador continua
             * reconhecendo o campo e oferecendo o preenchimento.
             */
            type={aberta ? "text" : "password"}
            autoComplete="current-password"
            required
            className={cn(CAMPO, "pr-[60px]")}
          />
          <button
            type="button"
            onClick={() => setAberta((v) => !v)}
            aria-label={aberta ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={aberta}
            className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-[#8a8a84] transition-colors hover:text-white"
          >
            {aberta ? <EyeOff size={21} strokeWidth={1.6} /> : <Eye size={21} strokeWidth={1.6} />}
          </button>
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-[14px] font-medium text-[#e88a82]">
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
