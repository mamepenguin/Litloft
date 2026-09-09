/**
 * The real `DismissScrim`, `ContextMenu` and `useContextMenu`, driven by
 * real gestures in Chromium.
 *
 * Read `build-bundle.ts` first: it says why this target exists, what it
 * holds that `e2e-layout` cannot, and what it still cannot hold.
 *
 * Two claims, and they are the unit's whole requirement:
 *
 *  - **a tap that dismisses a popup must not activate what is under the
 *    finger**, whatever the popup is stacked inside; and
 *  - **a press that *raises* a popup must not either** — the long press,
 *    which is the case that got past four rounds of guards.
 *
 * Every gesture is sent as a CDP `Input.dispatchTouchEvent`, so the
 * `mousedown` / `mouseup` / `click` that follow `touchend` are Chromium's
 * own compatibility events. `page.touchscreen.tap` cannot hold a press
 * open for 500 ms, which is what `useContextMenu` needs before it opens
 * anything.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function open(page: Page, arrangement: string): Promise<void> {
  // The query is a cache-buster: the arrangement is read from
  // `location.hash` as the bundle evaluates, and moving from one hash to
  // another on the same document is not a navigation, so the script would
  // not re-run. `data-arrangement` is what would report that.
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
}

/** Activations of a control, or `-1` if it is not on the page any more. */
async function activations(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    return el ? Number(el.dataset.clicks) : -1;
  }, selector);
}

/**
 * Whether a popup is open, asked of the primitive rather than of the
 * markup: a scrim is mounted for exactly as long as its popup is, and it
 * carries `DISMISS_SCRIM_ATTR`. `ContextMenu` publishes `role="menuitem"`
 * rows but no `role="menu"` container, so a query for the role would read
 * "never opened" here and every case below would pass for the wrong
 * reason. (Measured: it did, before this was written this way.)
 */
async function popupIsOpen(page: Page): Promise<boolean> {
  return (await page.locator("[data-dismiss-scrim]").count()) > 0;
}

/**
 * A touch, held for `holdMs`, at the centre of `selector`.
 *
 * Sent through CDP rather than `page.touchscreen` because that API has
 * only `tap`, and a 500 ms hold is the input `useContextMenu` answers.
 * Chromium synthesises the compatibility mouse events from `touchEnd`
 * itself — which is the sequence under test, and the one a test that
 * dispatched `click` by hand would be faking.
 */
async function touchHold(
  page: Page,
  selector: string,
  holdMs: number,
): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y }],
  });
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
  // The compatibility click is dispatched after `touchEnd` returns; one
  // frame is enough for it, and for React to commit whatever it caused.
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
}

/** A tap: the same path, held only as long as a finger is. */
async function tap(page: Page, selector: string): Promise<void> {
  await touchHold(page, selector, 30);
}

/**
 * What a dismissing tap must do, and where the tap lands.
 *
 * One expectation for all three arrangements, declared before they were
 * run: the popup closes and the control under the finger is not
 * activated. That the answer does not vary with the arrangement is the
 * property five rounds of positional rules failed to hold — `bottom-bar`
 * and `transformed` are the two the last rule could not express at all.
 */
const DISMISSING = [
  {
    arrangement: "plain",
    target: "#underneath",
    why: "a scrim over a z-0 button",
  },
  {
    arrangement: "bottom-bar",
    target: "#bulk",
    why: "scrim and menu inside a fixed bottom-0 z-50 bar, tapping a bulk action",
  },
  {
    arrangement: "transformed",
    target: "#tabstrip",
    why: "scrim inside a transformed box, tapping a sticky strip written after it",
  },
] as const;

test.describe("a tap that dismisses a popup", () => {
  test("the arrangements are the ones this unit was bitten by", () => {
    // A population, pinned like one. Cutting an entry from the table
    // removes a case and leaves the run green, which is how a suite stops
    // measuring the thing it was written for (detector rule 5, and
    // review-workflow's note that a shrinking population is not a
    // shrinking claim).
    expect(DISMISSING).toHaveLength(3);
    expect(DISMISSING.map((d) => d.arrangement)).toEqual([
      "plain",
      "bottom-bar",
      "transformed",
    ]);
  });

  for (const { arrangement, target, why } of DISMISSING) {
    test(`${arrangement}: ${why}`, async ({ page }) => {
      await open(page, arrangement);
      expect(await popupIsOpen(page)).toBe(true);

      await tap(page, target);

      expect(await popupIsOpen(page)).toBe(false);
      expect(await activations(page, target)).toBe(0);
    });
  }

  test("the popup's own rows still work", async ({ page }) => {
    // The other side of "outside": a press inside the popup is the user
    // working it. If the primitive were given the wrong subtree, this row
    // would both fail to run and take the popup down with it.
    await open(page, "plain");

    await tap(page, "#row-Move");

    expect(await activations(page, "#underneath")).toBe(0);
    expect(await popupIsOpen(page)).toBe(false);
  });
});

test.describe("a press that raises a popup", () => {
  test("long-press opens the menu and does not activate the card", async ({
    page,
  }) => {
    // The regression the mechanism created, and the reason this whole
    // target exists. `useContextMenu` opens `ContextMenu` from a 500 ms
    // timer on `touchstart` — a press the primitive never answered — so
    // nothing armed for the click the lift produces, and a scrim that is
    // only appearance cannot stand in for one. On a phone that is
    // "long-press a file card, and land on the file".
    await open(page, "long-press");
    expect(await popupIsOpen(page)).toBe(false);

    await touchHold(page, "#card", 700);

    expect(await popupIsOpen(page)).toBe(true);
    expect(await activations(page, "#card")).toBe(0);
  });

  test("a short tap on the same card is an ordinary tap", async ({ page }) => {
    // The boundary. If the swallow were armed by any press rather than by
    // one that raised a popup, this card could never be opened at all —
    // which is the failure mode a fix for the case above walks into.
    await open(page, "long-press");

    await tap(page, "#card");

    expect(await popupIsOpen(page)).toBe(false);
    expect(await activations(page, "#card")).toBe(1);
  });

  test("the tap that dismisses that menu is spared too", async ({ page }) => {
    // Both halves in one gesture sequence: raise the menu by a press
    // nothing answered, then dismiss it by one that is answered. Neither
    // may reach the card.
    await open(page, "long-press");
    await touchHold(page, "#card", 700);
    expect(await popupIsOpen(page)).toBe(true);

    await tap(page, "#card");

    expect(await popupIsOpen(page)).toBe(false);
    expect(await activations(page, "#card")).toBe(0);
  });
});
