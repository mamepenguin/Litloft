/**
 * A fixture lays out at the width the spec asked for.
 *
 * Chromium's `isMobile` emulation gives a page the mobile *layout*
 * viewport unless the page asks for the device width itself, so a fixture
 * with no `<meta name="viewport">` lays out around 980px however narrow the
 * context is. Each fixture is opened under that context and asked what
 * width it got, rather than grepped for the meta.
 */

import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_DIR = resolve(__dirname, "fixtures");

/**
 * Declared rather than read off the directory, so a fixture added on disk
 * and not here goes red.
 */
const FIXTURES = [
  "addon-policy.html",
  "button-touch-floor.html",
  "file-actions-menu.html",
  "justified-grid.html",
  "list-row-furniture.html",
  "mobile-inspector-sheet.html",
  "popup-dismiss.html",
  "pseudo-fullscreen.html",
  "related-files.html",
  "sidebar-shell.html",
  "toolbar-menu.html",
] as const;

const FIXTURE_COUNT = 11;

/**
 * On the far side of `sm` from Chromium's mobile default, so a page that
 * fell back reads `true` for `(min-width: 640px)`.
 */
const WIDTH_PX = 375;
const HEIGHT_PX = 667;

test.describe("a fixture lays out at the width it was given", () => {
  test.use({
    viewport: { width: WIDTH_PX, height: HEIGHT_PX },
    hasTouch: true,
    isMobile: true,
  });

  test("the context is one the trap can occur in", async ({ page }) => {
    // Every case below is equally true of a context where the trap cannot
    // happen, so a page without the meta has to be shown to be caught.
    await page.setContent(
      "<!doctype html><html><head><title>no viewport meta</title></head>" +
        "<body>measured, not asked</body></html>",
    );

    const measured = await page.evaluate((width) => ({
      laidOutAtTheContextWidth: window.innerWidth === width,
      aboveSm: window.matchMedia("(min-width: 640px)").matches,
      coarse: window.matchMedia("(pointer: coarse)").matches,
    }), WIDTH_PX);

    // Booleans: the fallback width itself is Chromium's number and
    // changes with its version.
    expect(measured).toEqual({
      laidOutAtTheContextWidth: false,
      aboveSm: true,
      coarse: true,
    });
  });

  test("the fixtures checked are the fixtures on disk", () => {
    const onDisk = readdirSync(FIXTURE_DIR)
      .filter((name) => name.endsWith(".html"))
      .sort();
    expect(onDisk).toHaveLength(FIXTURE_COUNT);
    expect(onDisk).toEqual([...FIXTURES].sort());
  });

  for (const fixture of FIXTURES) {
    test(fixture, async ({ page }) => {
      await page.goto(pathToFileURL(resolve(FIXTURE_DIR, fixture)).href);

      const measured = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        aboveSm: window.matchMedia("(min-width: 640px)").matches,
        coarse: window.matchMedia("(pointer: coarse)").matches,
      }));

      expect(measured.innerWidth).toBe(WIDTH_PX);
      expect(measured.clientWidth).toBe(WIDTH_PX);

      expect(measured.aboveSm).toBe(false);

      expect(measured.coarse).toBe(true);
    });
  }
});
