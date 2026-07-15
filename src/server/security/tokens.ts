import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { getServerEnv } from "@/shared/config/env";
import { Errors } from "@/shared/lib/errors";
import type { Role } from "@/shared/constants/rbac";

/**
 * Access token = short-lived, stateless, carries identity + roles.
 * Refresh token = long-lived, carries a rotating `jti` that is allow-listed in
 * Redis (see session.ts). Rotation + allowlist lets us revoke on logout and
 * detect token reuse.
 */

export type AccessClaims = {
  sub: string; // user id
  email: string;
  roles: Role[];
  activeMarket?: string;
};

export type RefreshClaims = {
  sub: string;
  jti: string; // unique per issuance, tracked in Redis
  family: string; // rotation family for reuse detection
};

const ttl = (v: string) => v as unknown as SignOptions["expiresIn"];

export function signAccessToken(claims: AccessClaims): string {
  const env = getServerEnv();
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: ttl(env.ACCESS_TOKEN_TTL),
    algorithm: "HS256",
  });
}

export function signRefreshToken(sub: string, family?: string): RefreshClaims & { token: string } {
  const env = getServerEnv();
  const payload: RefreshClaims = { sub, jti: randomUUID(), family: family ?? randomUUID() };
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: ttl(env.REFRESH_TOKEN_TTL),
    algorithm: "HS256",
  });
  return { ...payload, token };
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    return jwt.verify(token, getServerEnv().JWT_ACCESS_SECRET) as AccessClaims;
  } catch {
    throw Errors.unauthorized("Invalid or expired access token");
  }
}

export function verifyRefreshToken(token: string): RefreshClaims {
  try {
    return jwt.verify(token, getServerEnv().JWT_REFRESH_SECRET) as RefreshClaims;
  } catch {
    throw Errors.unauthorized("Invalid or expired refresh token");
  }
}
