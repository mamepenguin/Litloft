/**
 * The 44px touch floor a labelled button and a link both take, measured
 * in Chromium.
 *
 * Utilities are named here as compiled selectors, not as class lists spell
 * them: Tailwind scans this file, so a class written whole in a comment is
 * a source for it, after which the fixture CSS needle for that rule can
 * never go missing.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "button-touch-floor.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

interface Spec {
  shapes: Record<string, string>;
  controls: Record<string, string>;
  label: string;
  wrappingLabel: string;
  wrapColumnPx: number;
}

const SPEC: Spec = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

interface Measurement {
  height: number;
  width: number;
  clientHeight: number;
  scrollHeight: number;
  beforeContent: string;
  beforeTop: string;
  beforeBottom: string;
}

declare global {
  interface Window {
    buildButtons: () => void;
    measure: (shape: string) => Measurement;
    pointerIsCoarse: () => boolean;
  }
}

/**
 * Declared per size rather than derived from the render. 20px line box
 * (`.text-sm`) plus `.py-1\.5` / `.py-2` / `.py-2\.5`.
 */
const FINE_HEIGHT = { sm: 32, md: 36, lg: 40 } as const;

const COARSE_HEIGHT = 44;

const ICON_BOX = 32;

const ICON_OVERHANG_PX = 6;

const SIZES = ["sm", "md", "lg"] as const;

const cap = (size: string) => size[0].toUpperCase() + size.slice(1);

async function open(page: import("@playwright/test").Page) {
  await page.goto(FIXTURE);
  await page.evaluate(() => window.buildButtons());
}

const measure = (page: import("@playwright/test").Page, shape: string) =>
  page.evaluate((s) => window.measure(s), shape);

test.describe("fine pointer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the context really reports a fine pointer", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.pointerIsCoarse())).toBe(false);
  });

  for (const size of SIZES) {
    test(`a labelled button and a link are both ${FINE_HEIGHT[size]}px (${size})`, async ({
      page,
    }) => {
      await open(page);
      const button = await measure(page, `button${cap(size)}`);
      const link = await measure(page, `link${cap(size)}`);
      expect(button.height).toBe(FINE_HEIGHT[size]);
      expect(link.height).toBe(FINE_HEIGHT[size]);
    });
  }

  test("the icon-only box is 32px and its overhang is off", async ({ page }) => {
    await open(page);
    const icon = await measure(page, "iconOnly");
    expect(icon.height).toBe(ICON_BOX);
    expect(icon.width).toBe(ICON_BOX);
    // An ungated overhang would overlap neighbours in a dense desktop row
    // and the later element would win the hit test.
    expect(icon.beforeContent).toBe("none");
  });
});

/**
 * `hasTouch` alone is what makes Chromium answer `(pointer: coarse)`;
 * `isMobile` adds Chromium's mobile layout viewport, which this file does
 * not need.
 */
test.describe("coarse pointer", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test("the context really reports a coarse pointer", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.pointerIsCoarse())).toBe(true);
  });

  for (const size of SIZES) {
    test(`a labelled button and a link both reach 44px (${size})`, async ({ page }) => {
      await open(page);
      const button = await measure(page, `button${cap(size)}`);
      const link = await measure(page, `link${cap(size)}`);
      expect(button.height).toBe(COARSE_HEIGHT);
      expect(link.height).toBe(COARSE_HEIGHT);
    });
  }

  test("the icon-only box stays 32px and reaches the floor by overhang", async ({
    page,
  }) => {
    await open(page);
    const icon = await measure(page, "iconOnly");
    expect(icon.height).toBe(ICON_BOX);
    expect(icon.width).toBe(ICON_BOX);
    expect(icon.beforeContent).not.toBe("none");
    expect(icon.beforeTop).toBe(`-${ICON_OVERHANG_PX}px`);
    expect(icon.beforeBottom).toBe(`-${ICON_OVERHANG_PX}px`);
    expect(icon.height + ICON_OVERHANG_PX * 2).toBe(COARSE_HEIGHT);
  });

  test("the floor is a minimum: a wrapped label grows the box, a fixed height clips it", async ({
    page,
  }) => {
    await open(page);
    const floored = await measure(page, "wrapFloored");
    const clamped = await measure(page, "wrapClamped");

    expect(floored.height).toBeGreaterThan(COARSE_HEIGHT);
    expect(floored.scrollHeight).toBe(floored.clientHeight);

    // The same recipe with `.pointer-coarse\:h-11` in place of
    // `.pointer-coarse\:min-h-11`.
    expect(clamped.height).toBe(COARSE_HEIGHT);
    expect(clamped.scrollHeight).toBeGreaterThan(clamped.clientHeight);
  });
});

test.describe("across the two pointer types", () => {
  test("the floor raises the height and leaves the width alone", async ({ browser }) => {
    const fine = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const coarse = await browser.newContext({
      viewport: { width: 375, height: 667 },
      hasTouch: true,
    });
    try {
      const finePage = await fine.newPage();
      const coarsePage = await coarse.newPage();
      await open(finePage);
      await open(coarsePage);
      expect(await finePage.evaluate(() => window.pointerIsCoarse())).toBe(false);
      expect(await coarsePage.evaluate(() => window.pointerIsCoarse())).toBe(true);

      for (const size of SIZES) {
        for (const shape of [`button${cap(size)}`, `link${cap(size)}`]) {
          const before = await measure(finePage, shape);
          const after = await measure(coarsePage, shape);
          expect(before.height, `${shape} on fine`).toBe(FINE_HEIGHT[size]);
          expect(after.height, `${shape} on coarse`).toBe(COARSE_HEIGHT);
          expect(after.width, `${shape} width`).toBe(before.width);
        }
      }
    } finally {
      await fine.close();
      await coarse.close();
    }
  });
});

test("the fixture declares every shape the cases measure", () => {
  expect(Object.keys(SPEC.shapes).sort()).toEqual([
    "buttonLg",
    "buttonMd",
    "buttonSm",
    "iconOnly",
    "linkLg",
    "linkMd",
    "linkSm",
  ]);
  expect(Object.keys(SPEC.controls)).toEqual(["wrapClamped"]);
});
