import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getServerEnv } from "@/shared/config/env";

/**
 * Anonymous cart ownership.
 *
 * A guest cart needs a stable owner before the visitor authenticates, so we mint
 * an opaque random token and keep it in a cookie. It carries no identity and
 * grants no privileges — it only names a Cart document — but it is httpOnly so
 * page scripts cannot lift a visitor's cart handle.
 *
 * Next only permits cookie writes from Server Actions and Route Handlers, so the
 * read and create paths are deliberately separate: RSC render may call
 * `readGuestToken`, while only actions may call `getOrCreateGuestToken`.
 */

const GUEST_COOKIE = "guest_token";

/** Matches `cartService`'s 30-day guest-cart expiry so cookie and row age out together. */
const GUEST_TTL_SECONDS = 30 * 86400;

/** Read the guest token without creating one. Safe to call during RSC render. */
export async function readGuestToken(): Promise<string | undefined> {
  return (await cookies()).get(GUEST_COOKIE)?.value;
}

/**
 * Read the guest token, minting and setting one when absent.
 * Server Actions / Route Handlers only — throws during RSC render.
 */
export async function getOrCreateGuestToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  if (existing) return existing;

  const token = randomUUID();
  jar.set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_TTL_SECONDS,
  });
  return token;
}

/** Drop the guest token — called once its cart has been merged into a user's. */
export async function clearGuestToken(): Promise<void> {
  (await cookies()).delete(GUEST_COOKIE);
}

/**
 * Identify the cart owner for a request: the user when signed in, otherwise the
 * guest token. `create` mints a guest token when missing and must therefore only
 * be set from an action.
 */
export async function resolveCartOwner(
  userId: string | undefined,
  opts: { create?: boolean } = {},
): Promise<{ userId?: string; guestToken?: string }> {
  if (userId) return { userId };
  const guestToken = opts.create ? await getOrCreateGuestToken() : await readGuestToken();
  return guestToken ? { guestToken } : {};
}
