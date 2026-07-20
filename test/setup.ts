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

process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME_TEST ?? "commerce_test";

/**
 * Move Redis to a separate logical database too.
 *
 * Checkout increments a per-vendor order counter and the rate limiter writes
 * per-user keys; on the default database those would accumulate in whatever
 * Redis development is using. Database 1 is flushed wholesale below, which is
 * only safe because nothing else is expected to use it.
 */
{
  const url = new URL(process.env.REDIS_URL);
  url.pathname = `/${process.env.REDIS_TEST_DB ?? "1"}`;
  process.env.REDIS_URL = url.toString();
}

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

  const { getRedis } = await import("@/server/cache/redis");
  await getRedis().flushdb();
});

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
