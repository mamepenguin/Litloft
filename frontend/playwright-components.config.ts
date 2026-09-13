import { defineConfig, devices } from "@playwright/test";

import { DESKTOP_ONLY, DESKTOP_VIEWPORT } from "./e2e-components/projects";

/**
 * Pixel 5 rather than a desktop viewport: everything this target measures
 * is a touch behaviour, and `hasTouch` / `isMobile` are what make Chromium
 * synthesise the compatibility `click` from `touchend` itself.
 *
 * `testIgnore` rather than a second `testMatch` is the mobile side, so a
 * spec added tomorrow runs at the phone width instead of in neither
 * project.
 */


export default defineConfig({
  testDir: "./e2e-components",

  globalSetup: "./e2e-components/build-bundle.ts",

  fullyParallel: true,
  forbidOnly: true,

  // No retries: nothing here waits on a server or a network round trip, so
  // a case either measures the same sequence every time or has found
  // something.
  retries: 0,

  reporter: process.env.CI ? "line" : "html",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Pixel 5"] },
      testIgnore: DESKTOP_ONLY,
    },
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { ...DESKTOP_VIEWPORT },
      },
      testMatch: DESKTOP_ONLY,
    },
  ],
});
