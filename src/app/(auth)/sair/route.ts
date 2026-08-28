import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Apaga o cookie e devolve para o login.
 *
 * **Existe para quebrar um laco.** O proxy so olha se o cookie existe — ele nao
 * tem como saber se a conta ainda vale, porque isso mora no banco. Entao, com
 * um cookie de conta desativada, acontecia isto:
 *
 *   `/login` -> o proxy ve cookie e manda para `/`
 *   `/`      -> `requireUser` ve `is_active = false` e manda para `/login`
 *
 * E de novo, para sempre: `ERR_TOO_MANY_REDIRECTS`, e a pessoa presa sem
 * conseguir nem chegar na tela de entrada para logar como outra. Ninguem
 * apagava o cookie no caminho.
 *
 * Precisa ser Route Handler: componente de servidor nao pode escrever cookie
 * durante o render, entao `requireUser` nao consegue apagar sozinho — ele
 * manda para ca, e aqui o cookie morre antes do login.
 */
export function GET(request: NextRequest) {
  const destino = new URL("/login", request.url);

  // Preserva para onde a pessoa queria ir, se veio com isso.
  const next = request.nextUrl.searchParams.get("next");
  if (next?.startsWith("/")) destino.searchParams.set("next", next);

  const resposta = NextResponse.redirect(destino);
  resposta.cookies.delete(SESSION_COOKIE);
  return resposta;
}
