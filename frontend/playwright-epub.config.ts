import { defineConfig, devices } from "@playwright/test";

/**
 * Both engines: the reader's defences are a sanitizer and a CSP, and each
 * engine enforces the policy and parses the book on its own.
 */
export default defineConfig({
  testDir: "./e2e-epub",
  globalSetup: "./e2e-epub/global-setup.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI ? "line" : "html",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1000, height: 800 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1000, height: 800 } } },
  ],
});
