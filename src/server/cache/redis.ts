import Redis from "ioredis";
import { getServerEnv } from "@/shared/config/env";
import { logger } from "@/shared/lib/logger";

/**
 * Serverless-safe Redis singleton (sessions, rate limiting, idempotency,
 * guest carts, hot reads). Cached on globalThis like the Mongo connection.
 */
const globalForRedis = globalThis as unknown as { _redis?: Redis };

export function getRedis(): Redis {
  if (globalForRedis._redis) return globalForRedis._redis;

  const client = new Redis(getServerEnv().REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    enableAutoPipelining: true,
  });

  client.on("error", (err) => logger.error({ err }, "Redis error"));
  client.on("connect", () => logger.info("Redis connected"));

  globalForRedis._redis = client;
  return client;
}

/** Read-through cache helper with JSON serialization. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;

  const value = await producer();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}
