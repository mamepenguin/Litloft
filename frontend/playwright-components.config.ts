import { defineConfig, devices } from "@playwright/test";

/**
 * The component-level browser run — a third config, for the reason the
 * second one exists.
 *
 * `e2e/` needs a live stack. `e2e-layout/` needs a static page and the
 * app's stylesheet, and measures boxes; it cannot import a `.tsx`, so no
 * component is ever run in it. This one bundles the real components with
 * the repo's vite and drives them with real gestures — including a long
 * press, which is not a `page.touchscreen` call and has to go through CDP.
 *
 * Pixel 5 rather than a desktop viewport: everything this target measures
 * is a touch behaviour, and `hasTouch` / `isMobile` are what make Chromium
 * synthesise the compatibility `click` from `touchend` itself. A test that
 * dispatches that click on its own is testing its own arithmetic.
 */
export default defineConfig({
  testDir: "./e2e-components",

  // Compiles the stylesheet and bundles `fixtures/app.tsx`, real
  // components included.
  globalSetup: "./e2e-components/build-bundle.ts",

  fullyParallel: true,
  forbidOnly: true,

  // No retries, for `playwright-layout.config.ts`'s reason: nothing here
  // waits on a server or a network round trip, so a case either measures
  // the same sequence every time or has found something.
  retries: 0,

  reporter: process.env.CI ? "line" : "html",

  projects: [{ name: "chromium", use: { ...devices["Pixel 5"] } }],
});
