/**
 * Where the shared toolbar surface lands, measured in Chromium.
 *
 * ## The cell this exists to fill
 *
 * `useMenuSurface` is one recipe behind five panels and ten call sites, and
 * it is the only surface in the tree whose *form* changes with the
 * viewport: a sheet spanning the screen below 640, a panel anchored to its
 * trigger above it. Neither of the other browser targets can see the
 * anchored half. `file-actions-menu.spec.ts` measures `FileActions`, whose
 * class list carries no `sm:`; `e2e-components` runs at Pixel 5's 393px,
 * where `sm:` cannot apply at all. What was left holding the `sm:` half was
 * `ToolbarMenu.test.tsx` matching class tokens in jsdom, and
 * `review-workflow.md` is explicit that matching the text of a stylesheet
 * cannot verify a layout property.
 *
 * ## What it can see
 *
 * That below 640 the surface computes to `position: fixed` — which is the
 * fact the hook's unanchored gate reads, and the reason a menu on a bar
 * decides nothing there; that above it the panel is `absolute` and
 * `sm:bottom-full` beats the base `bottom-4` rather than losing to it in
 * the cascade; and that the gap either direction leaves is the number the
 * arithmetic reserves.
 *
 * ## What it cannot see
 *
 * **Nothing here runs the decision.** This page writes its own class lists,
 * so replacing `useAnchoredDirection` with `openUp = false` leaves every
 * case green. `toolbarMenuFixtureParity.test.tsx` is what ties these
 * strings to the component, and `useAnchoredDirection.test.tsx` is what
 * drives the decision. Three claims, none of which is either of the others.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "toolbar-menu.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

/**
 * The same declarations the page builds its boxes from, read rather than
 * restated — a second copy of a number here could not disagree with the one
 * being measured.
 */
const SPEC: Record<string, string | number> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const GAP_PX = SPEC.gapPx as number;

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface Measurement {
  viewport: { width: number; height: number };
  trigger: Box;
  menu: Box;
  menuPosition: string;
  menuTransformOrigin: string;
}

declare global {
  interface Window {
    buildBar: (spec: {
      direction: "up" | "down";
      align: "left" | "right";
      rows: number;
    }) => void;
    measureMenu: () => Measurement;
  }
}

/**
 * The widths this file measures, and why each of them is here.
 *
 * `sm` is 640. One width below it, where the surface is the sheet and the
 * hook's gate is the thing being measured; and two above it, because a rule
 * that holds at one width above a breakpoint and not at another is the
 * failure a single width cannot see. 768 is where the folder toolbar's
 * `md` group appears, so it is the width at which this menu holds its
 * fewest rows and its most.
 */
const WIDTHS = [
  { width: 500, form: "sheet" },
  { width: 700, form: "anchored" },
  { width: 768, form: "anchored" },
] as const;

test("measures one width in the sheet form and two in the anchored one", () => {
  // Counted as well as enumerated: without the literal this table can be
  // walked back to any length and the cases it still holds keep passing.
  // Detector rule 1. Both forms have to be present, or the file measures a
  // breakpoint from one side of it.
  expect(WIDTHS).toHaveLength(3);
  expect(WIDTHS.filter((w) => w.form === "sheet").map((w) => w.width)).toEqual([
    500,
  ]);
  expect(
    WIDTHS.filter((w) => w.form === "anchored").map((w) => w.width),
  ).toEqual([700, 768]);
  // Every width the table calls anchored is above the breakpoint the class
  // list spells, and the one it calls a sheet is below it.
  for (const { width, form } of WIDTHS) {
    expect(width >= 640, `${width} vs sm`).toBe(form === "anchored");
  }
});

async function open(
  page: import("@playwright/test").Page,
  width: number,
  spec: { direction: "up" | "down"; align: "left" | "right"; rows: number },
): Promise<Measurement> {
  await page.setViewportSize({ width, height: 500 });
  await page.goto(FIXTURE);
  await page.evaluate((s) => window.buildBar(s), spec);
  // `animate-fade-in-scale` starts at `scale(.95)`, and a box read during
  // it reports 95% of every number.
  await page.waitForTimeout(300);
  return page.evaluate(() => window.measureMenu());
}

for (const { width, form } of WIDTHS) {
  test(`takes the ${form} form at ${width}px`, async ({ page }) => {
    const m = await open(page, width, {
      direction: "down",
      align: "right",
      rows: 6,
    });

    // The property the hook reads to decide whether it decides anything.
    // Asserted from the *class list* here, which is the half jsdom cannot
    // hold: its gated case sets `position` through an inline style, so it
    // pins "bail when the computed position is fixed" and not "this string
    // computes to fixed below 640".
    expect(m.menuPosition).toBe(form === "sheet" ? "fixed" : "absolute");

    if (form === "sheet") {
      // Spanning the viewport, which is why it has no side and no
      // direction to pick: `inset-x-2` on both edges.
      expect(m.menu.left).toBeCloseTo(8, 0);
      expect(m.viewport.width - m.menu.right).toBeCloseTo(8, 0);
    } else {
      // Hung off the trigger, right edges aligned.
      expect(m.menu.right).toBeCloseTo(m.trigger.right, 0);
      expect(m.menu.width).toBeLessThan(m.viewport.width);
    }
  });
}

test.describe("the anchored form's two directions", () => {
  // The bar is `sticky bottom-0` under 2000px of filler, so it sits on the
  // foot of the viewport — the arrangement in which the downward form has
  // nowhere to go, which is the whole reason the direction is measured.
  for (const { width } of WIDTHS.filter((w) => w.form === "anchored")) {
    test(`hangs off the bottom at ${width}px and comes back when flipped`, async ({
      page,
    }) => {
      const down = await open(page, width, {
        direction: "down",
        align: "right",
        rows: 6,
      });
      const up = await open(page, width, {
        direction: "up",
        align: "right",
        rows: 6,
      });

      // Downward from a bar on the floor of the screen: past it.
      expect(down.menu.bottom).toBeGreaterThan(down.viewport.height);

      // Upward: the whole box on screen. `sm:bottom-full` has to beat the
      // base `bottom-4` for this, and which of two same-property utilities
      // wins is decided by the order Tailwind emits them in rather than by
      // anything readable in the class list — so it is measured rather
      // than argued.
      expect(up.menu.top).toBeGreaterThanOrEqual(0);
      expect(up.menu.bottom).toBeLessThanOrEqual(up.viewport.height);

      // Same box, moved. This is what makes a `ResizeObserver` on the panel
      // a safe instrument for driving the flip: an oscillation needs the
      // height to differ between the two directions.
      expect(up.menu.height).toBeCloseTo(down.menu.height, 0);
      expect(up.menu.width).toBeCloseTo(down.menu.width, 0);

      // And the gap either direction leaves is the number the arithmetic
      // reserves for it before asking whether the panel fits.
      expect(down.menu.top - down.trigger.bottom).toBeCloseTo(GAP_PX, 1);
      expect(up.trigger.top - up.menu.bottom).toBeCloseTo(GAP_PX, 1);
    });
  }
});

test("grows out of the corner it is pinned to, on both axes", async ({
  page,
}) => {
  // `animate-fade-in-scale` starts at `scale(0.95)`, so the origin is what
  // makes the panel look attached to its trigger rather than sliding
  // towards it. The corner takes both axes: an origin naming the top while
  // the panel hangs from the bottom is the combination the downward-only
  // form could not reach, and the one this measures.
  //
  // Read as computed pixels rather than as a class, because "the class is
  // in the list" is what jsdom already says and what the sheet has to
  // actually carry is a rule for it.
  const down = await open(page, 700, {
    direction: "down",
    align: "right",
    rows: 6,
  });
  const up = await open(page, 700, {
    direction: "up",
    align: "right",
    rows: 6,
  });

  const [downX, downY] = down.menuTransformOrigin.split(" ").map(parseFloat);
  const [upX, upY] = up.menuTransformOrigin.split(" ").map(parseFloat);

  // Right on both, since both hang from the trigger's right edge.
  expect(downX).toBeCloseTo(down.menu.width, 0);
  expect(upX).toBeCloseTo(up.menu.width, 0);

  // And the vertical half follows the direction: the top edge downward,
  // the bottom edge upward.
  expect(downY).toBeCloseTo(0, 0);
  expect(upY).toBeCloseTo(up.menu.height, 0);
});

test("hangs from the edge the caller asks for", async ({ page }) => {
  // Only the anchored form has a side; the sheet spans the viewport. The
  // archive toolbar is why `left` exists — its menus sit at the left of its
  // bar, where the default runs off the frame in the other direction.
  const right = await open(page, 700, {
    direction: "down",
    align: "right",
    rows: 6,
  });
  const left = await open(page, 700, {
    direction: "down",
    align: "left",
    rows: 6,
  });

  expect(right.menu.right).toBeCloseTo(right.trigger.right, 0);
  expect(left.menu.left).toBeCloseTo(left.trigger.left, 0);
  // And they are not the same box, which a pair of `toBeCloseTo`s against
  // a trigger narrower than the menu would otherwise let them be.
  expect(left.menu.left).not.toBeCloseTo(right.menu.left, 0);
});
