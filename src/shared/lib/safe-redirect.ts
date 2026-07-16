/**
 * Constrain a caller-supplied redirect target to somewhere inside this app.
 *
 * A `?next=` value reaches us from the URL, so it is attacker-controlled. Handing
 * it straight to a router turns any auth page into an open redirect: a link to
 * `/login?next=https://evil.example` is a real link, on the real domain, showing
 * the real login form — and it lands the user on the attacker's page afterwards,
 * which is exactly what a credential-phishing flow wants.
 *
 * Only same-origin *paths* are allowed through. Everything else falls back.
 */

/** NUL–US and DEL. A legitimate in-app path never contains these. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;

  // Must be a rooted path. Absolute URLs ("https://…", "javascript:…") are out.
  if (!value.startsWith("/")) return fallback;

  // "//evil.example" is protocol-relative — the browser reads it as another
  // origin. "/\evil.example" is the backslash variant of the same trick, which
  // some URL parsers normalise into "//".
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // Control characters can smuggle a second header or confuse a parser.
  if (CONTROL_CHARS.test(value)) return fallback;

  return value;
}
