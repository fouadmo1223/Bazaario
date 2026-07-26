import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Two projects, one `vitest run`.
 *
 * "integration" runs against a **real MongoDB and Redis**, not mocks. Nearly
 * every invariant worth protecting there is a database behaviour: the oversell
 * guard is a conditional update that two concurrent writers must race on,
 * tenant isolation is a query filter, and unread counts are an aggregation.
 * Mocking Mongo would test the mock and leave all three unverified.
 * `test/setup.ts` points the connection at a separate database and wipes it
 * between files, so a run cannot touch development data.
 *
 * "components" is jsdom + React Testing Library, for UI state that isn't a
 * database behaviour (badge reconciliation, typing indicator, read receipts).
 * It mocks the socket/router/server-action boundaries rather than touching a
 * real socket server or Mongo.
 */
export default defineConfig({
  resolve: {
    // Resolves the `@/*` alias from tsconfig.json. Native since Vite 7; the
    // vite-tsconfig-paths plugin is no longer needed for this.
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          setupFiles: ["./test/setup.ts"],
          include: ["test/**/*.test.ts"],
          // Suites share one database, so they must not interleave writes.
          fileParallelism: false,

          /**
           * Generous, because these are real network round-trips.
           *
           * If `.env.local` points at hosted Mongo/Redis (Atlas, Redis Cloud)
           * every assertion pays that latency, a full run takes minutes, and
           * the earlier 20s timeout produced *flaky* failures — suites that
           * pass alone failing in a full run, which reads like a real bug and
           * is not.
           *
           * Pointing MONGODB_URI and REDIS_URL at local instances for tests
           * is the actual fix; these ceilings just stop the flakiness in the
           * meantime.
           */
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "components",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./test/components/setup.ts"],
          include: ["test/components/**/*.test.tsx"],
        },
      },
    ],
  },
});
