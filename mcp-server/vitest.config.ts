import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // `src/__tests__/**`, not `*.test.ts`: `testClient.ts` lives in that
      // directory and matches neither `*.test.*` nor `*.spec.*`.
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
      // `json-summary` is not optional: the denominator check reads this
      // report, and that check is what earns the thresholds below the right to
      // be lower bounds. Dropping the reporter disarms it without failing
      // anything — the thresholds go on passing over whatever population is
      // left. The check names itself and the file it wanted when it fails.
      reporter: ["text-summary", "json-summary"],
      reportOnFailure: true,
      // Set at the CI figures. vitest compares the same truncated number it
      // displays, so these are the displayed values.
      thresholds: {
        statements: 91.84,
        branches: 88.31,
        functions: 95,
        lines: 91.84,
      },
    },
  },
});
