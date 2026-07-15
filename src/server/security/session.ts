import { cookies } from "next/headers";
import { getRedis } from "@/server/cache/redis";
import { getServerEnv } from "@/shared/config/env";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessClaims,
} from "./tokens";
import { Errors } from "@/shared/lib/errors";

/**
 * Cookie-based session with a Redis-backed refresh-token allowlist.
 *
 * Cookies (httpOnly, secure, sameSite=lax):
 *   - `access_token`  : short-lived JWT with identity + roles
 *   - `refresh_token` : long-lived JWT whose `jti` must be allow-listed in Redis
 *
 * Rotation: every refresh issues a new refresh token in the same `family` and
 * revokes the previous `jti`. A refresh presenting a `jti` that isn't allow-listed
 * is treated as reuse → the whole family is revoked (defense against token theft).
 */

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const refreshKey = (jti: string) => `refresh:${jti}`;
const familyKey = (family: string) => `refresh_family:${family}`;

// Parse "30d" / "15m" / "3600" into seconds for Redis TTL.
function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!m) return 60 * 60 * 24 * 30;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 3600;
    case "d": return n * 86400;
    default: return n;
  }
}

async function baseCookieOptions(maxAgeSeconds: number, rememberMe: boolean) {
  const isProd = getServerEnv().NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    // Remember-me: persistent cookie; otherwise a session cookie (no maxAge).
    ...(rememberMe ? { maxAge: maxAgeSeconds } : {}),
  };
}

/** Issue a fresh access+refresh pair, persist the refresh jti, and set cookies. */
export async function createSession(
  claims: AccessClaims,
  opts: { rememberMe?: boolean; family?: string } = {},
): Promise<void> {
  const env = getServerEnv();
  const redis = getRedis();
  const jar = await cookies();

  const access = signAccessToken(claims);
  const refresh = signRefreshToken(claims.sub, opts.family);
  const refreshTtl = ttlToSeconds(env.REFRESH_TOKEN_TTL);

  // Allow-list the refresh jti and track it in its rotation family.
  await redis
    .multi()
    .set(refreshKey(refresh.jti), claims.sub, "EX", refreshTtl)
    .sadd(familyKey(refresh.family), refresh.jti)
    .expire(familyKey(refresh.family), refreshTtl)
    .exec();

  jar.set(ACCESS_COOKIE, access, await baseCookieOptions(ttlToSeconds(env.ACCESS_TOKEN_TTL), true));
  jar.set(REFRESH_COOKIE, refresh.token, await baseCookieOptions(refreshTtl, opts.rememberMe ?? false));
}

/** Rotate the session from a valid refresh cookie. Detects & punishes reuse. */
export async function rotateSession(refreshClaimsProvider: () => Promise<AccessClaims>): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(REFRESH_COOKIE)?.value;
  if (!raw) throw Errors.unauthorized("No refresh token");

  const claims = verifyRefreshToken(raw);
  const redis = getRedis();
  const exists = await redis.get(refreshKey(claims.jti));

  if (!exists) {
    // Reuse or revoked token: nuke the entire family.
    const members = await redis.smembers(familyKey(claims.family));
    if (members.length) await redis.del(...members.map(refreshKey), familyKey(claims.family));
    throw Errors.unauthorized("Refresh token reuse detected");
  }

  // Revoke the presented jti, then mint a new pair in the same family.
  await redis.del(refreshKey(claims.jti));
  const fresh = await refreshClaimsProvider();
  await createSession(fresh, { rememberMe: true, family: claims.family });
}

/** Clear cookies and revoke the current refresh jti + its family. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(REFRESH_COOKIE)?.value;
  if (raw) {
    try {
      const claims = verifyRefreshToken(raw);
      const redis = getRedis();
      const members = await redis.smembers(familyKey(claims.family));
      const keys = [refreshKey(claims.jti), familyKey(claims.family), ...members.map(refreshKey)];
      await redis.del(...keys);
    } catch {
      // token already invalid — nothing to revoke
    }
  }
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Read the current access token cookie (used by the session resolver). */
export async function readAccessCookie(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}
