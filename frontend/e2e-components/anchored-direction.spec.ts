/**
 * Whether the corner `useAnchoredDirection` picks is actually on screen.
 *
 * Read `build-bundle.ts` first: it says why this target exists and what it
 * holds that `e2e-layout` cannot.
 *
 * ## Why this is not `e2e-layout`'s
 *
 * `e2e-layout/file-actions-menu.spec.ts` measures boxes on a static page
 * whose class lists it writes itself, and says so: "deleting the whole
 * measurement from `FileActions` and hard-coding `top-full` leaves every
 * case below green". `e2e-components/popup-dismiss.spec.ts` measures the
 * sheet's three states, but hands `up` and `alignLeft` in as props — so it
 * too is evidence about where a *stated* class list lands.
 *
 * The arrangements here run the real hook against boxes the browser
 * produced, so what is asserted is the thing neither of those can reach:
 * the panel the decision produced is inside the frame that clips it.
 *
 * ## What it still cannot hold
 *
 * The *pages* are hand-written — `FileDetailContainer`'s strip and
 * `InspectorPane` need Next.js, `next-intl` and a backend — so a
 * regression in one of those components' own markup is not this file's
 * subject. `componentFixtureParity.test.tsx` is what pins the fixture
 * against them.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function open(page: Page, arrangement: string): Promise<void> {
  // The query is a cache-buster, for the reason `popup-dismiss.spec.ts`
  // records: the arrangement is read from `location.hash` as the bundle
  // evaluates, and moving between hashes is not a navigation.
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  // The trigger is what opens the menu, and it is pressed only once the
  // sheet has stopped travelling: vaul animates the drawer into place, and
  // a decision taken while the frame is still moving is a decision about a
  // frame that is no longer there. This is also the order the app has —
  // the sheet is up long before anyone reaches the trigger in it.
  await expect(page.locator("#trigger")).toBeVisible();
  await page.waitForTimeout(500);
  await page.locator("#trigger").click();
  await expect(page.locator("#anchored")).toBeVisible();
  // `animate-fade-in-scale` starts at `scale(.95)`, and a box read during
  // it reports 95% of every number.
  await page.waitForTimeout(300);
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

async function box(page: Page, selector: string): Promise<Box> {
  const rect = await page.locator(selector).boundingBox();
  if (!rect) throw new Error(`${selector} has no box`);
  return {
    top: rect.y,
    bottom: rect.y + rect.height,
    left: rect.x,
    right: rect.x + rect.width,
  };
}

/**
 * Open an arrangement and read back what the hook decided.
 *
 * The answer comes off the panel's own dataset rather than from its class
 * list: the class list is what the *fixture* chose to spell for a given
 * answer, and reading it back would make this a test of the fixture.
 */
async function openAt(
  page: Page,
  arrangement: string,
): Promise<{ openUp: boolean; side: string }> {
  await open(page, arrangement);
  return page.evaluate(() => {
    const el = document.getElementById("anchored")!;
    return {
      openUp: el.dataset.openUp === "true",
      side: el.dataset.side ?? "",
    };
  });
}

/**
 * The three sheet states, and what each of them can actually claim.
 *
 * `peek`, `half` and `full` are three different frames — the strip is
 * `fixed bottom-0` with no drawer mounted, and the other two are inside
 * `Drawer.Content` at two different translations — so each is asked
 * separately rather than inferred from its neighbour.
 *
 * **Only `peek` can claim the whole box is on screen.** The strip has no
 * scroller under it, so a menu past the fold there is gone; that is the
 * defect the user reported. The expanded states draw the row inside
 * `mobile-inspector-content`, which scrolls — a menu taller than the room
 * on either side of its trigger overhangs whichever direction it takes,
 * and scrolling recovers it. Asserting "fully on screen" there would be
 * asserting something the design does not promise, and it fails on the
 * real component: `half` leaves 148px under the trigger and 8px over it
 * for a 188px menu. What those two states can hold is the *direction*, and
 * the horizontal axis, which nothing recovers — the sheet spans the
 * viewport and its scroller does not scroll sideways.
 */
test("the strip's menu is drawn entirely on screen", async ({ page }) => {
  await openAt(page, "measured-sheet-peek");
  const menu = await box(page, "#anchored");
  const viewport = page.viewportSize()!;

  expect(menu.top).toBeGreaterThanOrEqual(0);
  expect(menu.bottom).toBeLessThanOrEqual(viewport.height);
  expect(menu.left).toBeGreaterThanOrEqual(0);
  expect(menu.right).toBeLessThanOrEqual(viewport.width);
});

for (const state of ["half", "full"] as const) {
  test(`the expanded sheet's ${state} menu stays inside the viewport's width`, async ({
    page,
  }) => {
    await openAt(page, `measured-sheet-${state}`);
    const menu = await box(page, "#anchored");
    const viewport = page.viewportSize()!;

    expect(menu.left).toBeGreaterThanOrEqual(0);
    expect(menu.right).toBeLessThanOrEqual(viewport.width);
  });
}

test("the strip's menu is the one that has to open upward", async ({ page }) => {
  // The state the file detail opens in, and the defect the user reported:
  // the strip's bottom edge *is* the bottom of the screen, so a menu that
  // could only hang downward is drawn entirely below the fold. Asserted as
  // well as the box above, because "inside the viewport" is also true of a
  // menu that never opened.
  expect((await openAt(page, "measured-sheet-peek")).openUp).toBe(true);
});

test("the expanded sheet's menu has room below and takes it", async ({
  page,
}) => {
  // The other side of the same claim. Neither direction fits in `half` —
  // the row sits a few pixels under the scroller's top edge — so the rule
  // that keeps a trigger with room for neither pointing the way it points
  // everywhere else is what decides it, and the larger side is below. One
  // state or the other is always the broken one for a constant direction,
  // which is why neither is asserted alone.
  expect((await openAt(page, "measured-sheet-half")).openUp).toBe(false);
});

/**
 * The column's two side edges.
 *
 * Each arrangement puts the trigger against one edge and asks for the side
 * that runs off it, so the answer the hook has to produce is the one the
 * preference did *not* name. A case that only asserted the box would pass
 * on a panel narrower than its room, with the question never put.
 */
test("a menu at the column's left edge hangs the other way", async ({
  page,
}) => {
  const answer = await openAt(page, "measured-inspector-left-edge");
  const pane = await box(page, "#pane");
  const menu = await box(page, "#anchored");

  expect(answer.side).toBe("left");
  expect(menu.left).toBeGreaterThanOrEqual(pane.left);
  expect(menu.right).toBeLessThanOrEqual(pane.right);
});

test("a menu at the column's right edge hangs the other way", async ({
  page,
}) => {
  // The edge nothing collected. A 240px panel hung leftward from a trigger
  // against the right border of a 384px column ends outside it, and the
  // column is `overflow-auto`, so the part outside is not reachable by
  // scrolling either.
  const answer = await openAt(page, "measured-inspector-right-edge");
  const pane = await box(page, "#pane");
  const menu = await box(page, "#anchored");

  expect(answer.side).toBe("right");
  expect(menu.right).toBeLessThanOrEqual(pane.right);
  expect(menu.left).toBeGreaterThanOrEqual(pane.left);
});
