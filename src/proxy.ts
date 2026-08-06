import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Next.js 16 Proxy (formerly Middleware). Only one proxy function is
 * supported per project, so next-intl's locale-routing middleware and this
 * app's own auth-redirect logic are composed here rather than registered
 * separately: next-intl resolves/redirects the `[locale]` prefix first
 * (matching the URL to `/en/...` or `/ar/...`, or issuing that redirect if
 * missing), then the auth checks below run against the locale-stripped
 * pathname and re-attach whatever locale was resolved to any redirect they
 * build.
 *
 * The auth checks themselves are optimistic edge checks ONLY — the
 * authoritative authorization happens in the service layer (`requireUser`,
 * `requireVendorPermission`). We deliberately do NOT verify the JWT here (no
 * secrets at the edge, no DB) — a forged cookie only reaches a server
 * component that then rejects it.
 *
 * Silent refresh: the access cookie lasts 15 minutes, but the refresh cookie
 * lasts far longer, so a visitor whose access token has simply aged out
 * still holds a valid session. Rather than send them to login, we route the
 * navigation through `/api/auth/refresh` (locale-agnostic — it's a route
 * handler, not a page), which rotates the session and bounces them back to
 * the locale-prefixed URL they started at. Only for GET navigations — a
 * server action (POST) that meets an expired token gets the normal 401 its
 * client already knows how to handle, and 307-redirecting a POST to a
 * GET-only handler would 405.
 */

const PROTECTED_PREFIXES = ["/account", "/dashboard", "/platform", "/checkout"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

// Routes that must never get a `[locale]` prefix: OAuth endpoints (Google's
// redirect target is a fixed registered URL), the PWA icon/manifest routes
// (referenced by fixed URLs from manifest.ts / <link> tags), and the service
// worker. API routes are already excluded by the matcher below.
const LOCALE_EXEMPT_PREFIXES = [
  "/auth/google",
  "/icons",
  "/apple-icon",
  "/icon",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw.js",
];

const intlMiddleware = createIntlMiddleware(routing);

export function proxy(request: NextRequest) {
  const { pathname: rawPathname } = request.nextUrl;
  if (LOCALE_EXEMPT_PREFIXES.some((p) => rawPathname === p || rawPathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const intlResponse = intlMiddleware(request);

  // next-intl issued a redirect (missing/wrong locale prefix) — honor it
  // before running auth checks against a not-yet-prefixed URL.
  if (intlResponse.headers.get("location")) {
    return intlResponse;
  }

  const { pathname, search } = request.nextUrl;
  const { locale, rest } = splitLocale(pathname);
  const hasAccess = Boolean(request.cookies.get("access_token")?.value);
  const hasRefresh = Boolean(request.cookies.get("refresh_token")?.value);

  const isProtected = PROTECTED_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`));
  if (isProtected && !hasAccess) {
    // Access token aged out but the refresh cookie is still here — renew
    // rather than log out. GET only, so a redirect can't turn a POST into a 405.
    if (hasRefresh && request.method === "GET") {
      const url = new URL("/api/auth/refresh", request.url);
      url.searchParams.set("next", `/${locale}${rest}${search}`);
      return NextResponse.redirect(url);
    }
    const url = new URL(`/${locale}/login`, request.url);
    url.searchParams.set("next", `/${locale}${rest}`);
    return NextResponse.redirect(url);
  }

  const isAuthPage = AUTH_PAGES.some((p) => rest === p);
  if (isAuthPage && hasAccess) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  return intlResponse;
}

/** Splits `/en/dashboard/orders` into `{ locale: "en", rest: "/dashboard/orders" }`. */
function splitLocale(pathname: string): { locale: string; rest: string } {
  const [, maybeLocale, ...segments] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return { locale: maybeLocale, rest: `/${segments.join("/")}`.replace(/\/$/, "") || "/" };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

export const config = {
  // Run on everything except API routes, Next internals, and static assets.
  // `LOCALE_EXEMPT_PREFIXES` above handles the app routes that must stay
  // unprefixed but still need this matcher's reach (icons, OAuth, sw.js).
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
