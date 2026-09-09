/**
 * What a dismissing tap does to the control underneath, measured in
 * Chromium with a real touch.
 *
 * ## Why this exists at all
 *
 * `DismissScrim.test.tsx` fires events *at* the scrim and
 * `popup-dismissal.test.ts` reads class lists. Neither can see the defect,
 * which is made of two things jsdom does not have: a hit test, and the
 * `click` a browser synthesises after `touchend`. A popup that closes on
 * the press has unmounted its scrim by the time that click is dispatched,
 * so the click hit-tests to whatever the popup was drawn over and runs it.
 *
 * ## What it can see
 *
 * That a tap on the shipped scrim dismisses the popup and leaves the
 * full-bleed button under it unpressed; that the two shapes this tree
 * carried before — a scrim closing on `pointerdown`, and a `document`
 * press listener with no scrim at all — both press it; and that a *mouse*
 * hides one of those completely, which is why the tree could drift into
 * three behaviours with nobody noticing.
 *
 * The wrong strategies are in the same run as the right one on purpose. A
 * case that only asserts "the button was not pressed" passes on a page
 * where nothing can press it.
 *
 * ## What it cannot see
 *
 * **Nothing here runs `DismissScrim`.** The fixture writes its own markup
 * and its own listeners, so deleting the component would leave every case
 * green. `popupDismissFixtureParity.test.tsx` is what ties the fixture's
 * class list and its dismiss event to the component's.
 *
 * **No app is running**, so vaul's transform, the sheet's `pointer-events:
 * none` body and the addon slots are all absent. This is the mechanism at
 * viewport scale, not any particular screen.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "popup-dismiss.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

/** The declarations the page builds itself from, read rather than restated. */
const SPEC: Record<string, string> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

/** Somewhere over the scrim and clear of the menu in the top-left corner. */
const TAP = { x: 200, y: 500 };

/**
 * Both sides of the scrim's one breakpoint.
 *
 * `MENU_SCRIM` is `bg-black/30 sm:bg-transparent`: above 640px the scrim
 * is invisible. Invisible is not the same as absent — it still takes the
 * click — but a case run only at 375 would be measuring the tinted form
 * and saying nothing about the one every desktop menu uses.
 */
const VIEWPORTS = [
  { name: "375x667 (tinted, below sm)", width: 375, height: 667 },
  { name: "820x1180 (transparent, above sm)", width: 820, height: 1180 },
];

interface Reading {
  dismissed: number;
  pressedUnderneath: number;
}

async function open(
  page: import("@playwright/test").Page,
  strategy: string,
): Promise<void> {
  await page.goto(`${FIXTURE}#${strategy}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute("data-strategy", strategy);
  await expect(page.locator("#menu")).toBeVisible();
}

async function read(page: import("@playwright/test").Page): Promise<Reading> {
  return page.evaluate(() => ({
    dismissed: Number(
      document.getElementById("state")!.dataset.dismissed,
    ),
    pressedUnderneath: Number(
      document.getElementById("underneath")!.dataset.clicks,
    ),
  }));
}

/**
 * The expectation for each strategy, declared before it is run.
 *
 * Every one of these dismisses; the column that separates them is what
 * the same gesture did to the page underneath.
 */
const TOUCH: Record<string, Reading & { why: string }> = {
  shipped: {
    dismissed: 1,
    pressedUnderneath: 0,
    why: "the scrim is still mounted when the click arrives and absorbs it",
  },
  "scrim-press": {
    dismissed: 1,
    pressedUnderneath: 1,
    why:
      "`pointerdown` unmounts the scrim, and cancelling it does not stop " +
      "the click a touch produces from `touchend`",
  },
  "document-press": {
    dismissed: 1,
    pressedUnderneath: 1,
    why: "there is no scrim; the press closes the popup and the click lands",
  },
};

const MOUSE: Record<string, Reading & { why: string }> = {
  shipped: {
    dismissed: 1,
    pressedUnderneath: 0,
    why: "same scrim, same click",
  },
  "scrim-press": {
    dismissed: 1,
    pressedUnderneath: 0,
    why:
      "cancelling `pointerdown` suppresses the compatibility mouse events, " +
      "so no click is dispatched at all — this is the defect a mouse hides",
  },
  "document-press": {
    dismissed: 1,
    pressedUnderneath: 1,
    why: "`mousedown` closes it, and `mouseup` / `click` land on the page",
  },
};

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    // `hasTouch` is what makes `page.touchscreen.tap` dispatch touch
    // events and let Chromium synthesise the `click` from `touchend` —
    // the whole mechanism under test. Without it the tap is a no-op and
    // every case below reads zeros.
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: true,
    });

    test.describe("a tap that dismisses a popup", () => {
      for (const [strategy, want] of Object.entries(TOUCH)) {
        test(`${strategy}: ${want.why}`, async ({ page }) => {
          await open(page, strategy);
          await page.touchscreen.tap(TAP.x, TAP.y);
          expect(await read(page)).toEqual({
            dismissed: want.dismissed,
            pressedUnderneath: want.pressedUnderneath,
          });
        });
      }
    });

    test.describe("the same gesture with a mouse", () => {
      for (const [strategy, want] of Object.entries(MOUSE)) {
        test(`${strategy}: ${want.why}`, async ({ page }) => {
          await open(page, strategy);
          await page.mouse.click(TAP.x, TAP.y);
          expect(await read(page)).toEqual({
            dismissed: want.dismissed,
            pressedUnderneath: want.pressedUnderneath,
          });
        });
      }
    });

    test.describe("the scrim itself", () => {
      test("covers the viewport and sits over the page", async ({ page }) => {
        // The premise every case above rests on. Without it the taps
        // would reach the button in all three strategies and `shipped`
        // would go red for a reason that has nothing to do with which
        // event it answers.
        //
        // Read back from the page rather than restated: a copy of the
        // number in `test.use` could not disagree with it.
        await open(page, "shipped");
        expect(await page.locator("#scrim").boundingBox()).toEqual({
          x: 0,
          y: 0,
          ...(await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
          }))),
        });

        const at = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.id ?? null,
          [TAP.x, TAP.y],
        );
        expect(at).toBe("scrim");
      });

      test("does not cover the popup it guards", async ({ page }) => {
        // The other half. A scrim over its own menu would take every
        // press aimed at a row, and the popup would be unusable for the
        // thing it was opened to do — a failure the case above cannot
        // see, because both look like "the scrim is on top".
        await open(page, "shipped");
        const menu = (await page.locator("#menu").boundingBox())!;
        const at = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.id ?? null,
          [menu.x + menu.width / 2, menu.y + menu.height / 2],
        );
        expect(at).toBe("menu");
      });

      test("is what the fixture says it is", async ({ page }) => {
        await open(page, "shipped");
        await expect(page.locator("#scrim")).toHaveClass(SPEC.scrimClass);
      });
    });
  });
}
