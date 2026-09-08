import { defineConfig, devices } from "@playwright/test";

/**
 * The layout-invariant run — a separate config, and separate from
 * `playwright.config.ts` on purpose.
 *
 * `e2e/` needs a live stack on `localhost:3000` and a seeded library; the
 * specs there skip themselves when no drive answers, which is why they
 * are not in CI (docs/developer-guide/testing.md, "Why e2e is not in
 * CI"). `e2e-layout/` needs neither: it opens a static page off `file://`
 * with the app's own compiled stylesheet and measures the boxes the
 * browser produces. Two runs with nothing in common but the runner, so
 * they get two configs — putting the new one in as a project would have
 * made `pnpm test:e2e` run both.
 */
export default defineConfig({
  testDir: "./e2e-layout",

  // Compiles src/app/globals.css into the sheet the fixture links.
  globalSetup: "./e2e-layout/build-fixture-css.ts",

  fullyParallel: true,
  forbidOnly: true,

  // No retries, unlike `e2e/`. Nothing here waits on a server, an
  // animation or a network round trip — a case either measures the same
  // boxes every time or has found something. A retry would only turn
  // that finding into an intermittent green.
  retries: 0,

  reporter: process.env.CI ? "line" : "html",

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
