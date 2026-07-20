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

  const env = getServerEnv();
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    enableAutoPipelining: true,
    // Empty outside tests, so real keys are unprefixed and unchanged.
    keyPrefix: env.REDIS_KEY_PREFIX,
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

/**
 * Rejects Mongoose documents anywhere in a cached value.
 *
 * A document does not survive a JSON round-trip as itself: `JSON.stringify`
 * calls the schema's `toJSON`, and `basePlugin` renames `_id` to `id`. A cache
 * miss therefore hands back a document while every hit for the rest of the TTL
 * hands back a differently-shaped plain object, with the type signature
 * claiming both are the same thing. That produced a real bug — the vendor page
 * read `_id`, got `undefined` on cached reads, and gave every product card the
 * same React key.
 *
 * `toObject` is the marker: Mongoose documents have it, plain values do not.
 * Producers must map to plain objects before returning.
 */
type NoDocuments<T> = T extends { toObject: (...args: never[]) => unknown }
  ? [never, "Cache a plain object, not a Mongoose document — see NoDocuments"]
  : T extends Date
    ? T
    : T extends readonly (infer U)[]
      ? readonly NoDocuments<U>[]
      : T extends object
        ? { [K in keyof T]: NoDocuments<T[K]> }
        : T;

/**
 * Read-through cache with JSON serialization.
 *
 * The value must be plain — see `NoDocuments`.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T & NoDocuments<T>>,
): Promise<T> {
  const redis = getRedis();
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;

  const value = await producer();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}
