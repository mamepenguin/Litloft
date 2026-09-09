/**
 * What a dismissing tap does to the control underneath, measured in
 * Chromium with a real touch — at four arrangements, because the
 * arrangement is what beat this unit three times.
 *
 * ## Why this exists at all
 *
 * `DismissScrim.test.tsx` drives the component and
 * `popup-dismissal.test.ts` reads source text. Neither can see a browser's
 * two contributions: hit testing, and the `click` synthesised after
 * `touchend`. A popup that closes on the press and leaves that click alone
 * activates whatever the popup was drawn over.
 *
 * ## What it measures now
 *
 * Two axes. **Strategy** is how the popup dismisses: `shipped` is the
 * mechanism (a `document` press outside the popup, then the click that
 * press produces swallowed once in the capture phase); `scrim-click` is
 * what this unit shipped for three rounds (the scrim takes the click);
 * `scrim-press` and `document-press` are the two shapes the tree carried
 * before it.
 *
 * **Arrangement** is what is stacked over the scrim: nothing, the
 * inspector's `sticky top-0 z-10` tab strip written after it, the
 * selection bar's `fixed bottom-0 z-50`, and that same bar with the scrim
 * nested inside a `sticky top-0 z-20` box of its own.
 *
 * The pair is the finding. `shipped` reaches the same outcome at all four.
 * `scrim-click` is right at two of them — the plain page, which is the
 * only one this file used to have, and the tab strip, which is what three
 * rounds of tier rules were spent getting right — and wrong at the two
 * where the chrome is a `z-50` bar. That is the argument for changing the
 * instrument, as a measurement rather than as prose: the rule was not
 * badly written, it was answering a question with no bounded answer.
 *
 * ## What it cannot see
 *
 * **Nothing here runs `DismissScrim`.** The fixture writes its own markup
 * and its own listeners, so deleting the component would leave every case
 * green. `popupDismissFixtureParity.test.tsx` is what ties the fixture's
 * class list, its dismiss event, the event it swallows and its
 * `pointer-events` to the component's.
 *
 * **No app is running**, so vaul's transform, the sheet's `pointer-events:
 * none` body and the addon slots are all absent. The nested arrangement is
 * a stacking context of the same kind, not the drawer itself.
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

/**
 * Both sides of the scrim's one breakpoint.
 *
 * `MENU_SCRIM` is `bg-black/30 sm:bg-transparent`: above 640px the scrim
 * is invisible. Invisible is not the same as absent — it still draws a
 * box — but a case run only at 375 would be measuring the tinted form and
 * saying nothing about the one every desktop menu uses.
 */
const VIEWPORTS = [
  { name: "375x667 (tinted, below sm)", width: 375, height: 667 },
  { name: "820x1180 (transparent, above sm)", width: 820, height: 1180 },
];

/**
 * What is stacked over the scrim, and what a finger lands on there.
 *
 * `plain` is the page this file used to be: a scrim over one `z-0` button,
 * where every scrim tier from `z-1` upward is on top and passes. The other
 * three are the arrangements that beat a `z` rule, each one real and named
 * beside it.
 */
const ARRANGEMENTS = [
  {
    id: "plain",
    target: "#underneath",
    why: "a full-bleed z-0 button and nothing else",
  },
  {
    id: "sticky-bar",
    target: "#bar",
    why: "a sticky top-0 z-10 bar after the scrim — the inspector's tab strip",
  },
  {
    id: "fixed-bar",
    target: "#bar",
    why: "a fixed bottom-0 z-50 bar — the selection bar, which no scrim cleared",
  },
  {
    id: "nested",
    target: "#bar",
    why: "the same bar with the scrim inside a sticky top-0 z-20 box — the folder toolbar, where raising the scrim's number could not have answered it",
  },
] as const;

interface Reading {
  dismissed: number;
  activated: number;
}

async function open(
  page: import("@playwright/test").Page,
  strategy: string,
  arrangement = "plain",
): Promise<void> {
  // The query is a cache-buster, and it is load-bearing: the strategy is
  // read from `location.hash` when the script runs, and going from one
  // hash to another on the same document is a hash change, not a
  // navigation — the script does not re-run and the page keeps the first
  // strategy. The `data-strategy` assertion below is what caught that.
  await page.goto(`${FIXTURE}?run=${++navigation}#${strategy}:${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute("data-strategy", strategy);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  await expect(page.locator("#menu")).toBeVisible();
}

async function read(
  page: import("@playwright/test").Page,
  target: string,
): Promise<Reading> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    return {
      dismissed: Number(document.getElementById("state")!.dataset.dismissed),
      // A missing element would read as zero clicks, which is what a pass
      // looks like, so its absence is reported as -1 instead.
      activated: el ? Number(el.dataset.clicks) : -1,
    };
  }, target);
}

/** Tap the centre of whatever the arrangement puts under the finger. */
async function tap(
  page: import("@playwright/test").Page,
  target: string,
): Promise<void> {
  const box = (await page.locator(target).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * The expectation for each strategy at each arrangement, declared before
 * any of them was run.
 *
 * `shipped` is one row because it is one answer: the popup closes and the
 * page is spared, at every arrangement. `scrim-click` is four, because
 * that is the claim being broken — it holds exactly where the scrim is
 * what the tap reaches.
 */
const SHIPPED: Reading = { dismissed: 1, activated: 0 };

const SCRIM_CLICK: Record<string, Reading & { why: string }> = {
  plain: {
    dismissed: 1,
    activated: 0,
    why: "the scrim is the topmost box, so it takes the click — the page that made this look right",
  },
  "sticky-bar": {
    dismissed: 1,
    activated: 0,
    why: "z-30 over a z-10 strip: the one arrangement three rounds of tier rules did get right",
  },
  "fixed-bar": {
    dismissed: 0,
    activated: 1,
    why: "the bar is z-50, and the rule's own ceiling forbade any scrim from clearing it",
  },
  nested: {
    dismissed: 0,
    activated: 1,
    why: "same bar, and inside its own stacking context the scrim's number could not be raised to answer it either",
  },
};

test.describe("the populations these cases are generated from", () => {
  test("are the ones the file names", () => {
    // Three tables, and every case below is generated from them, so a
    // deletion is a silently shorter run: dropping `fixed-bar` and
    // `nested` takes the two arrangements this round's whole argument
    // rests on and leaves the rest green. Declared here rather than
    // derived, because a length read off the table it is checking cannot
    // disagree with it (detector rule 5).
    expect(ARRANGEMENTS.map((a) => a.id)).toEqual([
      "plain",
      "sticky-bar",
      "fixed-bar",
      "nested",
    ]);
    expect(Object.keys(SCRIM_CLICK).sort()).toEqual([
      "fixed-bar",
      "nested",
      "plain",
      "sticky-bar",
    ]);
    expect(VIEWPORTS).toHaveLength(2);
  });
});

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

    test.describe("a tap that dismisses, wherever the chrome is", () => {
      for (const arrangement of ARRANGEMENTS) {
        test(`shipped, ${arrangement.id}: ${arrangement.why}`, async ({
          page,
        }) => {
          await open(page, "shipped", arrangement.id);
          await tap(page, arrangement.target);
          expect(await read(page, arrangement.target)).toEqual(SHIPPED);
        });
      }
    });

    test.describe("the scrim taking the click instead", () => {
      // The instrument this replaces, measured rather than argued with.
      // Three of these four are defects that shipped or were one review
      // away from shipping.
      for (const arrangement of ARRANGEMENTS) {
        const want = SCRIM_CLICK[arrangement.id];
        test(`scrim-click, ${arrangement.id}: ${want.why}`, async ({ page }) => {
          await open(page, "scrim-click", arrangement.id);
          await tap(page, arrangement.target);
          expect(await read(page, arrangement.target)).toEqual({
            dismissed: want.dismissed,
            activated: want.activated,
          });
        });
      }
    });

    test.describe("the two shapes the tree carried before any scrim", () => {
      // Kept in the same run as the right one: a case that only asserts
      // "the button was not pressed" passes on a page where nothing can
      // press it.
      for (const [strategy, why] of Object.entries({
        "scrim-press":
          "pointerdown unmounts the scrim, and the touch's click still lands",
        "document-press": "no scrim at all; the press closes and the click lands",
      })) {
        test(`${strategy}: ${why}`, async ({ page }) => {
          await open(page, strategy);
          await tap(page, "#underneath");
          expect(await read(page, "#underneath")).toEqual({
            dismissed: 1,
            activated: 1,
          });
        });
      }
    });

    test.describe("the same gesture with a mouse", () => {
      // A mouse hides one of the two old defects completely: cancelling
      // `pointerdown` suppresses the compatibility mouse events, so
      // `scrim-press` looks correct here. That asymmetry is why the tree
      // could hold several behaviours with nobody noticing.
      for (const [strategy, want] of Object.entries({
        shipped: { dismissed: 1, activated: 0 },
        "scrim-press": { dismissed: 1, activated: 0 },
        "document-press": { dismissed: 1, activated: 1 },
      })) {
        test(`${strategy} with a mouse`, async ({ page }) => {
          await open(page, strategy);
          await page.mouse.click(200, 500);
          expect(await read(page, "#underneath")).toEqual(want);
        });
      }
    });

    test.describe("a right-press", () => {
      test("dismisses, and its own menu event reaches the row", async ({
        page,
      }) => {
        // Retargeting, which `ContextMenu` needs: right-clicking a second
        // row moves the menu there. It used to be a `preventDefault` and
        // an `elementFromPoint` re-dispatch a frame later; with the scrim
        // out of the way the `contextmenu` arrives on its own.
        await open(page, "shipped");
        await page.mouse.click(200, 500, { button: "right" });
        expect(
          await page.evaluate(() => ({
            dismissed: Number(
              document.getElementById("state")!.dataset.dismissed,
            ),
            retargeted: Number(
              document.getElementById("underneath")!.dataset.contextmenus,
            ),
          })),
        ).toEqual({ dismissed: 1, retargeted: 1 });
      });

      test("leaves the click after it to the page", async ({ page }) => {
        // The boundary of the swallow. A right-press produces no `click`,
        // so a swallow that stayed armed would eat the next ordinary one.
        // Measured rather than reasoned about: "armed forever" and "armed
        // for one interaction" look identical until something asks.
        await open(page, "shipped");
        await page.mouse.click(200, 500, { button: "right" });
        await page.mouse.click(200, 500);
        expect((await read(page, "#underneath")).activated).toBe(1);
      });
    });

    test.describe("the scrim itself", () => {
      test("is not what a pointer reaches", async ({ page }) => {
        // The statement the whole change rests on: the scrim is
        // appearance. Over the middle of it, the element at the point is
        // the page — and the tap outcome above is the same either way,
        // which is what makes the tier a matter of taste now.
        await open(page, "shipped");
        expect(
          await page.evaluate(() => {
            const box = document
              .getElementById("scrim")!
              .getBoundingClientRect();
            return document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            )?.id;
          }),
        ).toBe("underneath");
      });

      test("covers the viewport", async ({ page }) => {
        // What makes the dim a dim. Read back from the page rather than
        // restated: a copy of the number in `test.use` could not disagree
        // with it.
        await open(page, "shipped");
        expect(await page.locator("#scrim").boundingBox()).toEqual({
          x: 0,
          y: 0,
          ...(await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
          }))),
        });
      });

      test("is what the fixture says it is", async ({ page }) => {
        await open(page, "shipped");
        await expect(page.locator("#scrim")).toHaveClass(SPEC.scrimClass);
      });
    });
  });
}
