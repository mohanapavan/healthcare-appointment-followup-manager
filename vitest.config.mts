import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // These are integration tests against one real, shared Postgres test DB
    // (deliberately — the spec's concurrency/outbox claims need proving
    // against real transactions, not mocks). Running test *files* in
    // parallel lets one file's cleanup delete rows another file's
    // drainOutbox() is mid-retry on (drainOutbox claims any due row by
    // design, not just the caller's own — that's correct for production).
    // Sequential files trade suite speed for not fighting over shared state.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
