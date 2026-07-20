import { beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";

/**
 * Redirect every test at a throwaway database *before* any application module
 * is imported.
 *
 * `connectToDatabase` reads `MONGODB_DB_NAME` through the validated env at call
 * time, so overriding the variable here is enough — but only because this file
 * is a `setupFile` and therefore runs before the test's own imports. Setting it
 * inside a test would come too late for a module that had already connected.
 */
// Vitest has no --env-file, and Vite only exposes prefixed variables, so the
// real connection strings are loaded here. This must come *before* the test-db
// override below, or .env.local's own MONGODB_DB_NAME would win and the wipe
// would run against development data.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent in CI, where the variables come from the environment instead.
}

const TEST_DB = process.env.MONGODB_DB_NAME_TEST ?? "commerce_test";

process.env.MONGODB_DB_NAME = TEST_DB;

// Secrets the env schema demands. Values are irrelevant to the assertions but
// must exist and satisfy the minimum lengths, or `getServerEnv()` throws.
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-long-enough";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-long-enough";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

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
