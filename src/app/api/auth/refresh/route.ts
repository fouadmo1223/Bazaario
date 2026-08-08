import { NextResponse, type NextRequest } from "next/server";
import { authService } from "@/server/services/auth.service";
import { routing } from "@/i18n/routing";

/**
 * Silent session refresh.
 *
 * The `proxy` sends a navigation here when the short-lived `access_token` cookie
 * has expired but a `refresh_token` cookie is still present: rather than bounce
 * the visitor to login every 15 minutes, we rotate the session and send them on
 * to where they were going. On any failure — no valid refresh, reuse detected, a
 * since-suspended account — we fall back to login.
 *
 * A Route Handler (not the edge proxy) because rotation needs the JWT secrets
 * and the Redis allow-list, neither of which belongs at the edge.
 */
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  try {
    await authService.refresh();
    // `next` is locale-prefixed here (the proxy built it from the raw
    // pathname), which is exactly right for a real redirect URL.
    return NextResponse.redirect(new URL(next, request.url));
  } catch {
    // `/login` reads `next` client-side and hands it to next-intl's router,
    // which prepends the current locale itself — forwarding the same
    // locale-prefixed value here would double it up into `/en/en/...`.
    const url = new URL("/login", request.url);
    url.searchParams.set("next", stripLocalePrefix(next));
    return NextResponse.redirect(url);
  }
}

function stripLocalePrefix(path: string): string {
  const [, maybeLocale, ...rest] = path.split("/");
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return `/${rest.join("/")}`.replace(/\/$/, "") || "/";
  }
  return path;
}

/**
 * Only same-origin relative paths, to keep this off the list of open redirects.
 * A value that isn't a single leading-slash path (`//evil.com`, `https://…`) is
 * discarded for the site root.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
