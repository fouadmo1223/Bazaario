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

/**
 * Close the connection and clear the singleton.
 *
 * The client keeps a persistent socket and an internal reconnect timer, so any
 * process that wants to exit — a test run, a worker draining on SIGTERM — hangs
 * until this is called. Clearing the cached instance means a later `getRedis()`
 * builds a fresh client rather than handing back a closed one.
 */
export async function closeRedis(): Promise<void> {
  const client = globalForRedis._redis;
  if (!client) return;
  globalForRedis._redis = undefined;
  await client.quit();
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
