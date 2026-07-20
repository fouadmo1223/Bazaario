import { beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";

/**
 * Redirect every test at throwaway datastores *before* any application module
 * is imported.
 *
 * `connectToDatabase` and `getRedis` read their configuration through the
 * validated env at call time, so overriding the variables here is enough — but
 * only because this file is a `setupFile` and therefore runs before the tests'
 * own imports. Setting them inside a test would come too late for a module that
 * had already connected.
 */

// Vitest has no --env-file, and Vite only exposes prefixed variables, so the
// real connection strings are loaded here. This must come before the overrides
// below, or .env.local's own values would win and the wipes would run against
// development data.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent in CI, where the variables come from the environment instead.
}

// Secrets the env schema demands. Values are irrelevant to the assertions but
// must exist and satisfy the minimum lengths, or `getServerEnv()` throws.
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-long-enough";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-long-enough";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

/**
 * Stripe. Both are overridden unconditionally, not defaulted, so the webhook
 * suite signs with a secret it knows regardless of what .env.local holds.
 *
 * No network call is made: `constructEvent` is pure HMAC verification, and the
 * secret key is only needed because the client is constructed to reach it.
 */
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_tests";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_for_signature_checks";

process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME_TEST ?? "commerce_test";

/**
 * Namespace every Redis key this run writes.
 *
 * An earlier version pointed tests at logical database 1 and flushed it. That
 * is wrong against hosted Redis — Redis Cloud and Upstash expose only database
 * 0, so `SELECT 1` fails, the client stays on database 0, and the flush wipes
 * the shared development data instead. ioredis only logs the failed SELECT, so
 * nothing about it is obvious at the call site.
 *
 * A prefix cannot fail that way: if it is not applied the cleanup below simply
 * finds nothing, rather than deleting somebody else's keys.
 */
const REDIS_PREFIX = process.env.REDIS_TEST_PREFIX ?? "vitest:";
process.env.REDIS_KEY_PREFIX = REDIS_PREFIX;

beforeAll(async () => {
  const { connectToDatabase } = await import("@/server/database/connection");
  await connectToDatabase();

  // A misconfigured URI that silently pointed at the development database would
  // let the wipe below delete real data. Refuse to run rather than risk it.
  const name = mongoose.connection.name;
  if (!name.includes("test")) {
    throw new Error(
      `Refusing to run tests against database "${name}" — the name must contain "test".`,
    );
  }

  await clearPrefixedRedisKeys();
});

/**
 * Delete only this run's keys.
 *
 * Uses a raw client rather than the application's: ioredis applies `keyPrefix`
 * to key arguments but not to a SCAN `MATCH` pattern, so the prefixed client
 * would scan for `vitest:*` unprefixed and then delete the names it found with
 * a second prefix bolted on. Doing it raw keeps the pattern and the delete
 * talking about the same keys.
 */
async function clearPrefixedRedisKeys(): Promise<void> {
  const { default: Redis } = await import("ioredis");
  const raw = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 3 });
  try {
    let cursor = "0";
    do {
      const [next, keys] = await raw.scan(cursor, "MATCH", `${REDIS_PREFIX}*`, "COUNT", 500);
      cursor = next;
      if (keys.length) await raw.del(...keys);
    } while (cursor !== "0");
  } finally {
    await raw.quit();
  }
}

/**
 * Wipe collections rather than dropping the database: dropping also drops the
 * indexes, and several suites depend on unique indexes being present to assert
 * that a duplicate is actually rejected.
 */
beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();

  // The Redis client is a module-level singleton with a persistent connection;
  // without closing it the process hangs after the last test.
  const { closeRedis } = await import("@/server/cache/redis");
  await closeRedis();
});
