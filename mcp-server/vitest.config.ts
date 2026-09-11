import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // `src/__tests__/**`, not `*.test.ts`. `testClient.ts` lives in that
      // directory and matches neither `*.test.*` nor `*.spec.*`, so the
      // narrower pattern leaves it in the denominator as production code — 9
      // files instead of 8.
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
      // `json-summary` is not optional: `scripts/check-coverage-population.py`
      // reads it, and that check is what earns the thresholds below the right
      // to be lower bounds.
      reporter: ["text-summary", "json-summary"],
      reportOnFailure: true,
      // Set at the CI figures, which five samples agreed on exactly — this
      // package has no timing-dependent path, so unlike the frontend there is
      // no spread to take a minimum of. vitest compares the same truncated
      // number it displays, so these are the displayed values.
      thresholds: {
        statements: 91.84,
        branches: 88.31,
        functions: 95,
        lines: 91.84,
      },
    },
  },
});
