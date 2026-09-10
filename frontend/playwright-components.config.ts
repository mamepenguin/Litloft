import { defineConfig, devices } from "@playwright/test";

import { DESKTOP_ONLY, DESKTOP_VIEWPORT } from "./e2e-components/projects";

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
 *
 * ## Two projects, and why the split has to be written down
 *
 * There is now a second, desktop one, because one frame in the tree cannot
 * be drawn at 393px: `TwoPaneLayout`'s tree `<aside>` is `overflow-hidden`
 * and `md:w-[280px]`, so its **right edge is inside the viewport** — the one
 * arrangement in which `clippingFrame` collecting `frame.right` decides
 * anything the intersection with the visible band would not decide anyway.
 * Below `md` that aside is `w-[100vw]`, so a phone-width fixture drawing a
 * 280px column would be a fixture of an arrangement the app does not have.
 *
 * The split is by file, and **both projects name their side of it**. Adding
 * the project without doing so runs the existing three specs at desktop
 * width, and one of them is `spec-viewport.spec.ts`, whose subject is that
 * the page lays out at the width its config declared — it asserts 393x727
 * and `sm` not matching. It would have gone red, which is the good case;
 * `popup-dismiss.spec.ts` builds its viewport frame out of
 * `window.innerWidth` and would simply have measured a different
 * arrangement.
 *
 * Both constants live in `e2e-components/projects.ts` so a spec can import
 * them without importing a config, and `spec-viewport.spec.ts` asserts the
 * mapping rather than trusting it. `testIgnore` rather than a second
 * `testMatch` is the mobile side, so a spec added tomorrow runs at the phone
 * width — this target's default — instead of in neither project.
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
