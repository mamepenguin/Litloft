import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // All three Playwright directories. They are browser suites — vitest
    // would collect their `.spec.ts` and fail on the Playwright import.
    exclude: [
      "e2e/**",
      "e2e-layout/**",
      "e2e-components/**",
      "node_modules/**",
    ],
    pool: "forks",
    teardownTimeout: 5000,
    // Above `asyncUtilTimeout` in src/test/setup.ts, so a wait that runs
    // out reports what it could not find instead of a bare test timeout.
    testTimeout: 15000,
    coverage: {
      // `istanbul`, not `v8`, and the reason is the denominator. v8 takes
      // coverage from the engine, so it only knows about code that executed,
      // and a floor over a population that moves cannot distinguish "the
      // code got worse" from "that module did not load this time". istanbul
      // instruments the AST, so the population is fixed before anything runs.
      provider: "istanbul",

      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/__tests__/**",
        "**/*.test.*",
        "**/*.spec.*",
        "src/messages/**",
        "src/test/**",
        "**/*.d.ts",
      ],

      // `json-summary` is not optional: `scripts/check-coverage-denominator.mjs`
      // reads it.
      reporter: ["text-summary", "json-summary"],

      // A failing run still writes the report. Without this (the default) a
      // red suite produces no summary at all, so the denominator check cannot
      // tell "a test failed" from "the population collapsed".
      reportOnFailure: true,

      // **These are CI's figures, not a local machine's**: coverage here is
      // machine-dependent, so a local run just above a floor is not headroom.
      // When one goes red, the answer is to re-run the commit, not to move
      // the number.
      thresholds: {
        statements: 77.32,
        lines: 79.76,
        functions: 73.83,
        branches: 71.86,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    preserveSymlinks: true,
  },
});
