/**
 * The component fixture lays out at the width its config asked for.
 *
 * Chromium's `isMobile` emulation gives a page the mobile *layout*
 * viewport unless the page asks for the device width itself, and this
 * config runs on `Pixel 5`, which is `isMobile`. The fixture's dismiss
 * scrim carries `sm:hidden`, so a page that fell back would have no scrim.
 *
 * What a case here opens is `.build/index.html`, which vite emits and the
 * build rewrites; reading `fixtures/index.html` off disk measures a page
 * nothing opens.
 */

import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { OUT_DIR, PAGE } from "./build-bundle";
import { DESKTOP_ONLY } from "./projects";

/**
 * Declared rather than read off the directory, so a page added on disk and
 * not here goes red.
 */
const PAGES = ["index.html"] as const;

const PAGE_COUNT = 1;

/**
 * Literals rather than a read of `devices["Pixel 5"]`, which would agree
 * with the config by construction.
 */
const DEVICE_WIDTH_PX = 393;
const DEVICE_HEIGHT_PX = 727;

/**
 * A `testMatch` naming a file that no longer exists silently runs nothing,
 * and a spec matched by neither project runs at the default width.
 */
const AT_THE_PHONE_WIDTH = [
  "add-menu.spec.ts",
  "anchored-direction.spec.ts",
  "chrome-buttons.spec.ts",
  "page-frame.spec.ts",
  "player-seek-indicator.spec.ts",
  "open-ghost.spec.ts",
  "popup-dismiss.spec.ts",
  "quick-note-footer.spec.ts",
  "scoped-search.spec.ts",
  "view-transition-push.spec.ts",
  "sheet-gesture.spec.ts",
  "spec-viewport.spec.ts",
] as const;

const AT_THE_DESKTOP_WIDTH = [
  "add-menu-desktop.spec.ts",
  "anchored-direction-desktop.spec.ts",
  "view-transition-desktop.spec.ts",
] as const;

test.describe("the component fixture lays out at the width it was given", () => {
  test("every spec in this directory is assigned to exactly one project", () => {
    // Not `import.meta.url`: `build-bundle.ts` is CJS (it uses
    // `__dirname`), and one `import.meta` here flips this file to ESM and
    // breaks that import at load.
    const onDisk = readdirSync(resolve(OUT_DIR, ".."))
      .filter((name) => name.endsWith(".spec.ts"))
      .sort();

    expect([...AT_THE_PHONE_WIDTH, ...AT_THE_DESKTOP_WIDTH].sort()).toEqual(
      onDisk,
    );
    expect(
      AT_THE_PHONE_WIDTH.filter((name) =>
        (AT_THE_DESKTOP_WIDTH as readonly string[]).includes(name),
      ),
    ).toEqual([]);

    // The globs are suffix matches on the path, as Playwright applies them.
    const suffixes = DESKTOP_ONLY.map((glob) => glob.replace(/^\*\*\//, ""));
    expect([...AT_THE_DESKTOP_WIDTH]).toEqual(suffixes);

    for (const name of AT_THE_PHONE_WIDTH) expect(suffixes).not.toContain(name);
  });

  test("the context is one the trap can occur in", async ({ page }) => {
    // Every case below is equally true of a context where the trap cannot
    // happen, so a page without the meta has to be shown to be caught.
    await page.setContent(
      "<!doctype html><html><head><title>no viewport meta</title></head>" +
        "<body>measured, not asked</body></html>",
    );

    const measured = await page.evaluate(
      (width) => ({
        laidOutAtTheContextWidth: window.innerWidth === width,
        aboveSm: window.matchMedia("(min-width: 640px)").matches,
        coarse: window.matchMedia("(pointer: coarse)").matches,
      }),
      DEVICE_WIDTH_PX,
    );

    // Booleans: the fallback width itself is Chromium's number and
    // changes with its version.
    expect(measured).toEqual({
      laidOutAtTheContextWidth: false,
      aboveSm: true,
      coarse: true,
    });
  });

  test("the run's context is the one the literals above describe", ({
    page,
  }) => {
    expect(page.viewportSize()).toEqual({
      width: DEVICE_WIDTH_PX,
      height: DEVICE_HEIGHT_PX,
    });
  });

  test("the pages checked are the pages the build emitted", () => {
    const onDisk = readdirSync(OUT_DIR)
      .filter((name) => name.endsWith(".html"))
      .sort();
    expect(onDisk).toHaveLength(PAGE_COUNT);
    expect(onDisk).toEqual([...PAGES].sort());

    expect([...PAGES]).toContain(basename(PAGE));
  });

  for (const emitted of PAGES) {
    test(emitted, async ({ page }) => {
      await page.goto(pathToFileURL(resolve(OUT_DIR, emitted)).href);

      const measured = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        aboveSm: window.matchMedia("(min-width: 640px)").matches,
        coarse: window.matchMedia("(pointer: coarse)").matches,
      }));

      expect(measured.innerWidth).toBe(DEVICE_WIDTH_PX);
      expect(measured.clientWidth).toBe(DEVICE_WIDTH_PX);

      expect(measured.aboveSm).toBe(false);

      expect(measured.coarse).toBe(true);
    });
  }
});
