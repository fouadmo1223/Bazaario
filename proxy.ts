import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 Proxy (formerly Middleware). Optimistic edge checks ONLY — the
 * authoritative authorization happens in the service layer (`requireUser`,
 * `requireVendorPermission`). Here we just do cheap cookie-presence redirects to
 * keep unauthenticated users out of protected shells and authenticated users
 * off the auth pages. We deliberately do NOT verify the JWT here (no secrets at
 * the edge, no DB) — a forged cookie only reaches a server component that then
 * rejects it.
 *
 * The one non-trivial bit is silent refresh: the access cookie lasts 15 minutes,
 * but the refresh cookie lasts far longer, so a visitor whose access token has
 * simply aged out still holds a valid session. Rather than send them to login,
 * we route the navigation through `/api/auth/refresh`, which rotates the session
 * and bounces them back. Only for GET navigations — a server action (POST) that
 * meets an expired token gets the normal 401 its client already knows how to
 * handle, and 307-redirecting a POST to a GET-only handler would 405.
 */

const PROTECTED_PREFIXES = ["/account", "/dashboard", "/platform", "/checkout"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasAccess = Boolean(request.cookies.get("access_token")?.value);
  const hasRefresh = Boolean(request.cookies.get("refresh_token")?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !hasAccess) {
    // Access token aged out but the refresh cookie is still here — renew rather
    // than log out. GET only, so a redirect can't turn a POST into a 405.
    if (hasRefresh && request.method === "GET") {
      const url = new URL("/api/auth/refresh", request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const isAuthPage = AUTH_PAGES.some((p) => pathname === p);
  if (isAuthPage && hasAccess) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
