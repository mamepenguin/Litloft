import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-layout",

  globalSetup: "./e2e-layout/build-fixture-css.ts",

  fullyParallel: true,
  forbidOnly: true,

  // No retries. Nothing here waits on a server, an animation or a network
  // round trip — a case either measures the same boxes every time or has
  // found something. A retry would only turn that finding into an
  // intermittent green.
  retries: 0,

  reporter: process.env.CI ? "line" : "html",

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
