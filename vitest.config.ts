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
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
