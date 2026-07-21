import { defineConfig } from "vitest/config";

/**
 * Tests run against a **real MongoDB and Redis**, not mocks.
 *
 * Nearly every invariant worth protecting here is a database behaviour: the
 * oversell guard is a conditional update that two concurrent writers must race
 * on, tenant isolation is a query filter, and unread counts are an aggregation.
 * Mocking Mongo would test the mock and leave all three unverified.
 *
 * `test/setup.ts` points the connection at a separate database and wipes it
 * between files, so a run cannot touch development data.
 */
export default defineConfig({
  resolve: {
    // Resolves the `@/*` alias from tsconfig.json. Native since Vite 7; the
    // vite-tsconfig-paths plugin is no longer needed for this.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // Suites share one database, so they must not interleave writes.
    fileParallelism: false,

    /**
     * Generous, because these are real network round-trips.
     *
     * If `.env.local` points at hosted Mongo/Redis (Atlas, Redis Cloud) every
     * assertion pays that latency, a full run takes minutes, and the earlier
     * 20s timeout produced *flaky* failures — suites that pass alone failing in
     * a full run, which reads like a real bug and is not.
     *
     * Pointing MONGODB_URI and REDIS_URL at local instances for tests is the
     * actual fix; these ceilings just stop the flakiness in the meantime.
     */
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
