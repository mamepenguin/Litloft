/**
 * What a dismissing tap does to the control underneath, measured in
 * Chromium with a real touch.
 *
 * **Strategy** is how the popup dismisses: `shipped` is a `document` press
 * outside the popup, then the click that press produces swallowed once in
 * the capture phase; `scrim-click`, `scrim-press` and `document-press` are
 * the alternatives. **Arrangement** is what is stacked over the scrim.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "popup-dismiss.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

const SPEC: Record<string, string> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

let navigation = 0;

/**
 * Above `sm` the scrim is transparent but still draws a box, so both sides
 * of the breakpoint are run.
 */
const VIEWPORTS = [
  { name: "375x667 (tinted, below sm)", width: 375, height: 667 },
  { name: "820x1180 (transparent, above sm)", width: 820, height: 1180 },
];

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
  // The query is a cache-buster: the strategy is read from
  // `location.hash` when the script runs, and a hash change on the same
  // document is not a navigation.
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

async function tap(
  page: import("@playwright/test").Page,
  target: string,
): Promise<void> {
  const box = (await page.locator(target).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

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
    // Without `hasTouch` the tap is a no-op and Chromium synthesises no
    // `click` from `touchend`.
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
      // Cancelling `pointerdown` suppresses the compatibility mouse
      // events, so `scrim-press` looks correct with a mouse.
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
        // `ContextMenu` needs retargeting: right-clicking a second row
        // moves the menu there.
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
        // A right-press produces no `click`, so a swallow that stayed
        // armed would eat the next ordinary one.
        await open(page, "shipped");
        await page.mouse.click(200, 500, { button: "right" });
        await page.mouse.click(200, 500);
        expect((await read(page, "#underneath")).activated).toBe(1);
      });
    });

    test.describe("the scrim itself", () => {
      test("is not what a pointer reaches", async ({ page }) => {
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
