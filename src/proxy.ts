import { NextResponse, type NextRequest } from "next/server";

/**
 * Checagem otimista: so olha se o cookie existe, para nao renderizar
 * a aplicacao inteira para quem nao esta logado. A verificacao real da
 * sessao acontece no servidor, em `requireUser()`.
 */
const SESSION_COOKIE = "mkt_session";

/**
 * Aberto para qualquer um, logado ou nao: o formulario de pedido, o link de
 * convite e a saida. Quem recebe um convite ainda nao tem conta para logar.
 *
 * `/sair` precisa passar **justamente por ter cookie**: e ele que apaga o
 * cookie invalido. Barrar a saida aqui recriaria o laco que ela existe para
 * quebrar.
 */
const OPEN_PATHS = ["/solicitar", "/convite", "/sair"];

/** Porta de entrada: quem ja entrou nao volta para ela. */
const AUTH_PATHS = ["/login"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (matches(pathname, OPEN_PATHS)) return NextResponse.next();

  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isAuthPage = matches(pathname, AUTH_PATHS);

  if (!hasCookie && !isAuthPage) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasCookie && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
