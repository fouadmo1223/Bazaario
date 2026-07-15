import { getRedis } from "@/server/cache/redis";
import { Errors } from "@/shared/lib/errors";

export type RateLimitOptions = {
  /** Max allowed hits within the window. */
  max: number;
  /** Window length in seconds. */
  windowSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetSec: number;
};

/**
 * Fixed-window rate limiter backed by Redis (atomic INCR + EXPIRE).
 * Cheap and good enough for auth/abuse protection; upgrade to a sliding-window
 * Lua script if precise smoothing is later required.
 *
 * `check()` returns the decision; `rateLimit()` throws RATE_LIMITED when exceeded.
 */
export async function check(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getRedis();
  const redisKey = `ratelimit:${key}`;

  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, opts.windowSec);
  }
  const ttl = await redis.ttl(redisKey);

  return {
    allowed: count <= opts.max,
    remaining: Math.max(0, opts.max - count),
    resetSec: ttl < 0 ? opts.windowSec : ttl,
  };
}

export async function rateLimit(key: string, opts: RateLimitOptions): Promise<void> {
  const result = await check(key, opts);
  if (!result.allowed) {
    throw Errors.rateLimited(`Too many requests. Try again in ${result.resetSec}s.`);
  }
}
