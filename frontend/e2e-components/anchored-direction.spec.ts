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
 * `fits` is what the state's room does to the panel, and it is why this is
 * a table rather than a loop over the state names:
 *
 *  - **`whole`** — the picked direction puts the whole box on screen.
 *  - **`neither`** — no direction fits, the rule keeps the panel pointing
 *    the way it points everywhere else, and the overhang is recovered by
 *    the scroller the row is drawn in. Asserting `whole` there would be
 *    asserting something the design does not promise.
 *
 * The strip is the state with no scroller under it, so it is the one where
 * a menu past the fold is simply gone — the defect the user reported.
 */
const CELLS = [
  { state: "peek", openUp: true, fits: "whole" },
  { state: "half", openUp: false, fits: "neither" },
  { state: "full", openUp: false, fits: "whole" },
] as const;

test("the table covers three sheet states, both directions and both outcomes", () => {
  // Counted as well as enumerated. Without the literal the table can be
  // walked back to any length and every case it still holds keeps passing
  // — measured on the loop this replaces: `["half", "full"]` cut to
  // `["half"]` ran 37 of 38 with nothing red. Detector rule 1, and rule
  // 5's shape that keeps recurring. `popup-dismiss.spec.ts` carries the
  // same guard over the same three states, eleven lines away.
  expect(CELLS).toHaveLength(3);
  expect([...new Set(CELLS.map((c) => c.state))]).toEqual([
    "peek",
    "half",
    "full",
  ]);

  // Both answers of the vertical axis are drawn. A table whose every row
  // expected the same direction would be green for a hook that always
  // returned it.
  expect([...new Set(CELLS.map((c) => c.openUp))].sort()).toEqual([
    false,
    true,
  ]);

  // And both outcomes, named rather than counted: exactly one state is the
  // one where neither direction fits, and it is not the state whose box
  // nothing recovers.
  expect(CELLS.filter((c) => c.fits === "neither").map((c) => c.state)).toEqual(
    ["half"],
  );
  expect(CELLS.filter((c) => c.fits === "whole").map((c) => c.state)).toEqual([
    "peek",
    "full",
  ]);
});

for (const cell of CELLS) {
  test(`the sheet's ${cell.state} menu hangs ${
    cell.openUp ? "up" : "down"
  } and lands ${cell.fits}`, async ({ page }) => {
    const answer = await openAt(page, `measured-sheet-${cell.state}`);
    const menu = await box(page, "#anchored");
    const viewport = page.viewportSize()!;

    // The strip's bottom edge *is* the bottom of the screen, so a menu
    // that could only hang downward from it is drawn entirely below the
    // fold; `half` and `full` put the row inside a drawer with room under
    // it. One state or the other is always the broken one for a constant
    // direction, which is why no state is asserted alone.
    expect(answer.openUp).toBe(cell.openUp);

    // The horizontal axis in every state: the sheet spans the viewport and
    // its scroller does not scroll sideways, so nothing recovers a panel
    // that crosses either side edge.
    expect(menu.left).toBeGreaterThanOrEqual(0);
    expect(menu.right).toBeLessThanOrEqual(viewport.width);

    if (cell.fits === "whole") {
      expect(menu.top).toBeGreaterThanOrEqual(0);
      expect(menu.bottom).toBeLessThanOrEqual(viewport.height);
    } else {
      // The panel starts on screen — its first row is reachable without
      // scrolling — and runs past the fold, which is this state's own
      // shape rather than an accident of it: flipped up, the box fits the
      // viewport outright. Asserting the overhang is what stops the
      // direction above passing by luck.
      expect(menu.top).toBeLessThan(viewport.height);
      expect(menu.bottom).toBeGreaterThan(viewport.height);
    }
  });
}

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
