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
 *
 * **Chrome above the scrim is one bar, not a page.** The `chrome`
 * strategies add a `sticky top-0 z-10` bar after the scrim — the shape
 * `InspectorShell`'s tab strip has — because without it this page is a
 * scrim over a single `z-0` button, where every scrim tier from `z-1`
 * upward is on top and passes. What they hold is the tier of the scrim
 * *this page draws*, which the parity test ties to `MENU_SCRIM`: measured,
 * `scrimClass` at `z-10` fails the `chrome` case at both viewports and
 * left every other case here green. A scrim a caller passes by hand is not
 * on this page at all — `popup-dismissal.test.ts` reads those against the
 * sticky bars' own files.
 *
 * What is still absent is a transformed ancestor, so the sheet's
 * containing block is not reproduced here either.
 *
 * **The retarget cases are mouse-only.** They run `page.mouse.click(…,
 * { button: "right" })`; Playwright has no long-press gesture that
 * synthesises `contextmenu`, so the touch path to the same event is not
 * exercised anywhere. The left-tap strategies above *are* real touch. What
 * is measured is that `DismissScrim` re-aims a `contextmenu` — whatever
 * raised it — and the user-facing docs were narrowed to claim only the
 * right-click, rather than promise a long-press nothing here measures.
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

let navigation = 0;

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

interface ContextReading {
  dismissed: number;
  retargetedUnderneath: number;
}

async function open(
  page: import("@playwright/test").Page,
  strategy: string,
): Promise<void> {
  // The query is a cache-buster, and it is load-bearing: the strategy is
  // read from `location.hash` when the script runs, and going from one
  // hash to another on the same document is a hash change, not a
  // navigation — the script does not re-run and the page keeps the first
  // strategy. The `data-strategy` assertion below is what caught that.
  await page.goto(`${FIXTURE}?run=${++navigation}#${strategy}`);
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
 * Let the re-dispatch happen, or fail to.
 *
 * Two frames: the handler schedules its dispatch in one
 * `requestAnimationFrame`, and the second is what guarantees the first has
 * run before anything is read.
 */
async function settleFrames(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function readContext(
  page: import("@playwright/test").Page,
): Promise<ContextReading> {
  return page.evaluate(() => ({
    dismissed: Number(document.getElementById("state")!.dataset.dismissed),
    retargetedUnderneath: Number(
      document.getElementById("underneath")!.dataset.contextmenus,
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

    test.describe("a right-click that dismisses a popup", () => {
      // The left click is swallowed; the right one is re-aimed. A context
      // menu is raised *by* this gesture, so right-clicking a second row
      // has always moved the menu there — swallowing it costs a second
      // right-click, which is not what the swallowing is for.
      //
      // Both wirings run, so the difference is a measurement rather than
      // an argument: `swallow-contextmenu` is the shape this change first
      // shipped, and is otherwise the same scrim.
      for (const [strategy, want] of Object.entries({
        shipped: {
          dismissed: 1,
          retargetedUnderneath: 1,
          why: "dismisses, then re-dispatches the gesture at the same point",
        },
        "swallow-contextmenu": {
          dismissed: 1,
          retargetedUnderneath: 0,
          why: "dismisses and absorbs — the regression, kept as the contrast",
        },
      })) {
        test(`${strategy}: ${want.why}`, async ({ page }) => {
          await open(page, strategy);
          await page.mouse.click(TAP.x, TAP.y, { button: "right" });

          // Wait for the frame, *then* read — do not poll. `expect.poll`
          // returns on its first successful evaluation, so polling a
          // counter to `0` succeeds immediately, before the re-dispatch
          // could have raised it. Measured: with that shape, making the
          // swallow branch retarget left all 24 cases green, and so did
          // flipping its expectation to 1. A contrast case that passes
          // either way is not a contrast.
          await settleFrames(page);
          expect(await readContext(page)).toEqual({
            dismissed: want.dismissed,
            retargetedUnderneath: want.retargetedUnderneath,
          });
        });
      }

      test("refuses the browser's own menu either way", async ({ page }) => {
        // Retargeting is about which element gets the gesture, not about
        // letting the native menu through: the popup underneath was
        // raised by this gesture and draws its own.
        for (const strategy of ["shipped", "swallow-contextmenu"]) {
          await open(page, strategy);
          const defaultPrevented = await page.evaluate(([x, y]) => {
            const scrim = document.getElementById("scrim")!;
            const e = new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
            });
            scrim.dispatchEvent(e);
            return e.defaultPrevented;
          }, [TAP.x, TAP.y]);
          expect(defaultPrevented, strategy).toBe(true);
        }
      });
    });

    test.describe("chrome written after the scrim", () => {
      // The gap the two shipped defects lived in. Both rounds put the
      // scrim at or below the inspector's `sticky top-0 z-10` tab strip,
      // which is later in the document, so the tap reached the strip and
      // switched the tab under the finger. Neither was visible to any
      // case above: a scrim over a single `z-0` button is on top whatever
      // its tier.
      //
      // The pair is the measurement. `chrome` is the shipped `z-30`
      // scrim; `chrome-low-scrim` is `z-10`, the value a "must be in the
      // popover band" check admitted at its floor. A case that only
      // asserted the first would pass on a page where nothing can reach
      // the bar.
      for (const [strategy, want] of Object.entries({
        chrome: {
          dismissed: 1,
          pressedChrome: 0,
          why: "z-30 clears the bar, so the tap is absorbed",
        },
        "chrome-low-scrim": {
          dismissed: 0,
          pressedChrome: 1,
          why:
            "z-10 ties the bar and loses the paint order to it — the tap " +
            "presses the bar and the popup is not even dismissed",
        },
      })) {
        test(`${strategy}: ${want.why}`, async ({ page }) => {
          await open(page, strategy);
          const bar = (await page.locator("#chrome").boundingBox())!;
          const point = { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 };

          // The element under that point, before anything is tapped: the
          // reading the tap's outcome follows from, and the one a reader
          // of a failure needs.
          const at = await page.evaluate(
            ([x, y]) => document.elementFromPoint(x, y)?.id ?? null,
            [point.x, point.y],
          );
          expect(at).toBe(strategy === "chrome" ? "scrim" : "chrome");

          await page.touchscreen.tap(point.x, point.y);
          expect(
            await page.evaluate(() => ({
              dismissed: Number(
                document.getElementById("state")!.dataset.dismissed,
              ),
              pressedChrome: Number(
                document.getElementById("chrome")!.dataset.clicks,
              ),
            })),
          ).toEqual({
            dismissed: want.dismissed,
            pressedChrome: want.pressedChrome,
          });
        });
      }

      test("puts the bar over the page it is chrome for", async ({ page }) => {
        // The premise of the pair: the bar has to be reachable at all. A
        // bar with no box, or one the full-bleed button covers, would make
        // `chrome-low-scrim` read like the shipped case for a reason that
        // has nothing to do with tiers.
        await open(page, "chrome-low-scrim");
        const bar = (await page.locator("#chrome").boundingBox())!;
        expect(bar.width).toBeCloseTo(
          await page.evaluate(() => window.innerWidth),
          0,
        );
        expect(bar.height).toBeGreaterThan(0);
        expect(bar.y).toBeCloseTo(0, 0);
      });
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
