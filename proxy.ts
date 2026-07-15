import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 Proxy (formerly Middleware). Optimistic edge checks ONLY — the
 * authoritative authorization happens in the service layer (`requireUser`,
 * `requireMarketPermission`). Here we just do cheap cookie-presence redirects to
 * keep unauthenticated users out of protected shells and authenticated users
 * off the auth pages. We deliberately do NOT verify the JWT here (no secrets at
 * the edge, no DB) — a forged cookie only reaches a server component that then
 * rejects it.
 */

const PROTECTED_PREFIXES = ["/account", "/dashboard", "/platform", "/checkout"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("access_token")?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const isAuthPage = AUTH_PAGES.some((p) => pathname === p);
  if (isAuthPage && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
