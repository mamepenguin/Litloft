/**
 * The 44px touch floor a labelled button and a link both take, measured
 * in Chromium.
 *
 * ## Why this exists at all
 *
 * `Button.test.tsx` pins the *classes* the two emitters produce and says
 * in its own docstring that it can say nothing about a height: jsdom lays
 * nothing out, so every `getBoundingClientRect()` there is zeros. The
 * property `DESIGN.md` §6 and §Row Actions actually state is a geometry —
 * "44px on `pointer: coarse`, 32px on `fine`", "a link and a button
 * standing next to each other are the same height" — and before this file
 * it was held by one hand measurement recorded in a PR body, which nothing
 * re-runs. A detector CI does not run is not a detector
 * (`.claude/rules/review-workflow.md`).
 *
 * ## What it can see
 *
 * That a labelled shape is 32 / 36 / 40px under a fine pointer and 44px
 * under a coarse one; that the `<button>` and the `<a>` measure the same
 * at every size and every pointer type; that neither grows *wider* when
 * the floor engages; that the icon-only box stays 32px at both pointer
 * types and reaches 44 through its overhang instead; and that the floor is
 * a minimum rather than a fixed height — a wrapped Japanese label grows
 * the box, where the same button given `.pointer-coarse\:h-11` clips it.
 *
 * ## What it cannot see
 *
 * Named so a green tick is not read as covering them.
 *
 * **Nothing here runs the component.** This file measures the class lists
 * the fixture writes out, so deleting `TOUCH_FLOOR_CLASS` from `Button.tsx`
 * leaves every case below green. What connects the two is
 * `buttonTouchFloorFixtureParity.test.tsx`, which renders the real
 * component and calls the real `buttonClass()` and compares the class
 * lists with this fixture's table.
 *
 * **No app is running**, so nothing here is evidence about a button inside
 * a row, a toolbar or a sheet — only about the recipe's own box at the
 * widths named below.
 *
 * ## Why utilities are named as selectors here
 *
 * `.pointer-coarse\:min-h-11`, not the class as a class list spells it.
 * Tailwind scans this file, so a class written whole in a docstring is a
 * source for it, after which `build-fixture-css.ts`'s needle for that rule
 * can never go missing — and the needle exists precisely to catch the sheet
 * losing it. `src/__tests__/coarseNeedleSources.test.ts` holds the same
 * property mechanically for the classes it is meant to hold.
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

/**
 * The fixture's own declarations, read rather than restated — a second
 * copy of a class list here could not disagree with the one being
 * measured. `buttonTouchFloorFixtureParity.test.tsx` ties these to the
 * components.
 */
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
 * The three sizes, and the height each one's padding gives it under a
 * fine pointer. Declared per size rather than derived from the render:
 * an expectation built out of the observation cannot catch a size that
 * silently lost its padding (detector rule 5).
 *
 * 20px line box (`.text-sm`) plus `.py-1\.5` / `.py-2` / `.py-2\.5`.
 */
const FINE_HEIGHT = { sm: 32, md: 36, lg: 40 } as const;

/** `.pointer-coarse\:min-h-11`. Every labelled shape, whatever its padding. */
const COARSE_HEIGHT = 44;

/** `ICON_BOX_CLASS` is `.h-8` / `.w-8` at every pointer type. */
const ICON_BOX = 32;

/** `.pointer-coarse\:before\:-inset-1\.5` on each edge: 32 + 6 + 6 = 44. */
const ICON_OVERHANG_PX = 6;

const SIZES = ["sm", "md", "lg"] as const;

const cap = (size: string) => size[0].toUpperCase() + size.slice(1);

async function open(page: import("@playwright/test").Page) {
  await page.goto(FIXTURE);
  await page.evaluate(() => window.buildButtons());
}

const measure = (page: import("@playwright/test").Page, shape: string) =>
  page.evaluate((s) => window.measure(s), shape);

/**
 * The fine-pointer half. `devices["Desktop Chrome"]` is the config's own
 * project, so this is the default context — asserted rather than assumed,
 * because a case claiming "the floor does not apply" is worthless in a
 * context where it never could.
 */
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
    // `content: none` is a ::before that was never generated. An ungated
    // overhang would overlap neighbours in a dense desktop row and the
    // later element would win the hit test.
    expect(icon.beforeContent).toBe("none");
  });
});

/**
 * The coarse-pointer half — the one the change exists for.
 *
 * `isMobile` plus `hasTouch` is what makes Chromium answer
 * `(pointer: coarse)`; the first case asserts that rather than trusting
 * it, because every case under here reads the same as a fine-pointer run
 * if the media query never matched.
 */
test.describe("coarse pointer", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

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
    // The box, not the hit area: growing it would falsify the 32 + 12 = 44
    // arithmetic `ICON_BOX_CLASS` is fixed for.
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

    // The premise: at this column width the label really does wrap past
    // the floor. Without it both halves below would be true of a box
    // that never overflowed anything.
    expect(floored.height).toBeGreaterThan(COARSE_HEIGHT);
    expect(floored.scrollHeight).toBe(floored.clientHeight);

    // The same recipe with `.pointer-coarse\:h-11` in place of
    // `.pointer-coarse\:min-h-11` — the control, and the reason the case
    // above is not vacuous.
    expect(clamped.height).toBe(COARSE_HEIGHT);
    expect(clamped.scrollHeight).toBeGreaterThan(clamped.clientHeight);
  });
});

/**
 * The pair of runs, compared. Each half above measures one pointer type;
 * the claim "no desktop button grew" and "widths are unchanged" is about
 * both at once, so it needs two contexts in one case.
 */
test.describe("across the two pointer types", () => {
  test("the floor raises the height and leaves the width alone", async ({ browser }) => {
    const fine = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const coarse = await browser.newContext({
      viewport: { width: 375, height: 667 },
      hasTouch: true,
      isMobile: true,
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

/**
 * The population, declared. Nine class lists reach the browser above —
 * seven shapes and one control, plus the `wrapFloored` reuse of
 * `buttonMd` — and a table walked back to any length would otherwise
 * still measure whatever was left (detector rule 5, and rule 1 on the
 * measured scope).
 */
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
