import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: ["e2e/**", "node_modules/**"],
    pool: "forks",
    teardownTimeout: 5000,
    // Above `asyncUtilTimeout` in src/test/setup.ts, so a wait that runs
    // out reports what it could not find instead of a bare test timeout.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    preserveSymlinks: true,
  },
});
