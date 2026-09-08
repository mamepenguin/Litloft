/**
 * Where the `⋮` menu and its error toast actually land, measured in
 * Chromium.
 *
 * ## Why this exists at all
 *
 * `FileActions.test.tsx` decides which corner the component picks for a
 * given pair of boxes, and says in its own docstring that it can say
 * nothing about where that corner is: jsdom lays nothing out, so
 * `top-full` and `bottom-full` are two strings there and every
 * `getBoundingClientRect()` is zeros. The defect being fixed is not a
 * wrong string — it is a menu drawn below the viewport, which no jsdom
 * case can see.
 *
 * ## What it can see
 *
 * That `top-full mt-1` on a trigger inside the Bottom Sheet's 56px
 * resting strip puts the menu past the bottom of the screen and
 * `bottom-full mb-1` puts it back inside; that the two directions give
 * the menu the *same height*, which is the premise that lets a
 * `ResizeObserver` keyed on size drive the flip without oscillating; and
 * that a `whitespace-nowrap` toast hung `right-0` from a trigger at its
 * column's left edge crosses that edge while `left-0` keeps it inside.
 *
 * ## What it cannot see
 *
 * Named so a green tick is not read as covering them.
 *
 * **Nothing here runs the decision.** This file writes the class lists
 * itself, so deleting the whole measurement from `FileActions` and
 * hard-coding `top-full` leaves every case below green. What connects the
 * two is `fileActionsMenuFixtureParity.test.tsx`, which renders the real
 * component in each state and compares its class lists with this
 * fixture's; and `FileActions.test.tsx`, which drives the decision. Three
 * separate claims, none of which is either of the others.
 *
 * **No app is running**, so the addon slot, the sheet's snap points and
 * vaul's transform are all absent — the strip here is the strip's own
 * class list at its own height, not the sheet.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "file-actions-menu.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

/**
 * The same declarations the page builds its boxes from, read rather than
 * restated — a second copy of a number here could not disagree with the
 * one being measured. `fileActionsMenuFixtureParity.test.tsx` is what ties
 * these to the components.
 */
const SPEC: Record<string, string | number> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
}

interface Measurement {
  viewport: { width: number; height: number };
  trigger: Box;
  column: Box | null;
  menu: Box | null;
  toast: Box | null;
}

declare global {
  interface Window {
    buildStrip: (spec: { direction: "up" | "down"; items: number }) => void;
    buildColumn: (spec: {
      direction: "up" | "down";
      align: "left" | "right";
      toastAlign?: "left" | "right";
      items?: number;
      error?: string;
      left: number;
      width: number;
    }) => void;
    measureAnchor: () => Measurement;
  }
}

/**
 * The resting strip is `fixed bottom-0`, so its distance from the bottom
 * of the screen is zero at every viewport height — that is the property,
 * and it is why the answer below does not vary with the height. The two
 * heights are here to show that rather than to pick the one that agrees:
 * a case that only ran at one could not tell "always" from "here".
 *
 * The item counts are the interesting axis instead. Seven is the menu the
 * component builds on a stock install; one is the shortest menu anything
 * could render, and it is the case where "there is no room below" is a
 * claim about the strip rather than about the menu being large.
 */
const PHONES = [
  { width: 375, height: 667, label: "iPhone SE viewport" },
  { width: 393, height: 852, label: "iPhone 15 Pro viewport" },
];
const ITEM_COUNTS = [1, 7, 14];

/**
 * The populations, stated apart from the arrays.
 *
 * Both can otherwise be walked back to one entry with everything green —
 * five of the six strip cases, the only measurements of this menu's
 * geometry anywhere, deleted with nothing to say so. Same guard the
 * sibling fixture in this directory uses (`justified-grid.spec.ts`,
 * "is exactly the set this file tests"), enumerated rather than counted so
 * that swapping a height for another one is red as well.
 *
 * Its honest limit: the arrays and this expectation live in the same file,
 * so what it buys is that shrinking either takes two edits, not proof from
 * outside.
 */
test("is exactly the set of screens and menus this file measures", () => {
  expect(PHONES.map((p) => `${p.width}x${p.height}`)).toEqual([
    "375x667",
    "393x852",
  ]);
  expect(ITEM_COUNTS).toEqual([1, 7, 14]);
});

/**
 * `mt-1` / `mb-1`, taken from the fixture rather than written again here.
 * The parity test pins the same number against `MENU_GAP_PX`, which the
 * component adds to the menu's height before asking whether the menu
 * fits — so measuring the gap Chromium leaves against this value is a
 * measurement of the component's constant and not of a local literal.
 */
const GAP_PX = SPEC.gapPx as number;

test.describe("the file menu on the Bottom Sheet's resting strip", () => {
  // The strip is a phone surface, and the trigger carries
  // `pointer-coarse:h-11 pointer-coarse:w-11` — with a fine pointer it is
  // a 28px box sitting higher in the strip than a phone's. The height is
  // asserted below, so emulation quietly not applying is a failure rather
  // than a quieter measurement.
  test.use({ hasTouch: true });

  for (const phone of PHONES) {
    for (const items of ITEM_COUNTS) {
      test(`hangs off the bottom of a ${phone.label} at ${items} items, and comes back when flipped`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: phone.width, height: phone.height });
        await page.goto(FIXTURE);

        await page.evaluate(
          (n) => window.buildStrip({ direction: "down", items: n }),
          items,
        );
        const down = await page.evaluate(() => window.measureAnchor());

        await page.evaluate(
          (n) => window.buildStrip({ direction: "up", items: n }),
          items,
        );
        const up = await page.evaluate(() => window.measureAnchor());

        // The touch floor applies, so this is the 44px box a phone gets
        // rather than the 28px a mouse does. What is left below it is a
        // few pixels of the strip's own centring — stated as "less than
        // any menu is tall", which is the mechanism, rather than as the
        // figure, which moves with the strip's border.
        expect(down.trigger.height).toBe(44);
        expect(phone.height - down.trigger.bottom).toBeLessThan(
          down.menu!.height,
        );

        // Downward: the box starts at the very bottom edge of the screen
        // and everything after that is past it, which is the reported
        // defect. What overlaps the screen is a sliver of the strip's own
        // centring — bounded by the `mt-1` the menu is offset by, rather
        // than by a figure, because the figure moves with the strip's
        // border.
        expect(phone.height - down.menu!.top).toBeLessThan(GAP_PX);
        expect(down.menu!.bottom).toBeGreaterThan(phone.height);

        // Upward: the whole box on screen.
        expect(up.menu!.top).toBeGreaterThanOrEqual(0);
        expect(up.menu!.bottom).toBeLessThanOrEqual(phone.height);

        // Same box, moved. This is what makes a `ResizeObserver` on the
        // menu a safe instrument for driving the flip: the flip changes
        // the position it observes nothing about, and not the size it
        // observes everything about. An oscillation needs the height to
        // differ between the two directions.
        expect(up.menu!.height).toBe(down.menu!.height);
        expect(up.menu!.width).toBe(down.menu!.width);

        // And the flip is worth taking: the gap it clears is the whole
        // menu plus the 4px `mt-1` / `mb-1`.
        expect(down.menu!.top - down.trigger.bottom).toBeCloseTo(GAP_PX, 1);
        expect(up.trigger.top - up.menu!.bottom).toBeCloseTo(GAP_PX, 1);
      });
    }
  }
});

test.describe("the error toast against its column's left edge", () => {
  // 40px in from the page's left edge, 240px wide, with the trigger at
  // its left edge — the shape `alignLeft` exists for. A `w-40` menu hung
  // rightward from that trigger would start 92px outside the column, so
  // the component flips it; the question here is only whether the toast
  // beside it does the same.
  const COLUMN = { left: 40, width: 240 };
  /**
   * Handed to the page, so it is the string being measured rather than a
   * constant beside one. Its length is what makes the toast wider than its
   * trigger, and that is asserted on the rendered box below.
   */
  const MESSAGE = "Failed to delete";

  test("crosses the edge when it keeps right-0 and the menu flips without it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(FIXTURE);
    await page.evaluate(
      (c) =>
        window.buildColumn({
          direction: "down",
          align: "left",
          toastAlign: "right",
          items: 7,
          error: c.message,
          left: c.left,
          width: c.width,
        }),
      { ...COLUMN, message: MESSAGE },
    );

    const m = await page.evaluate(() => window.measureAnchor());
    expect(m.column!.left).toBeCloseTo(COLUMN.left, 0);

    // The menu obeys `alignLeft` and stays inside.
    expect(m.menu!.left).toBeGreaterThanOrEqual(m.column!.left);

    // The toast does not. This is the state before the fix, reproduced:
    // one direction per trigger on one axis only.
    expect(m.toast!.left).toBeLessThan(m.column!.left);
  });

  test("stays inside it when it follows the menu", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(FIXTURE);
    await page.evaluate(
      (c) =>
        window.buildColumn({
          direction: "down",
          align: "left",
          items: 7,
          error: c.message,
          left: c.left,
          width: c.width,
        }),
      { ...COLUMN, message: MESSAGE },
    );

    const m = await page.evaluate(() => window.measureAnchor());

    // Both edges, not just the flipped one: a toast wider than the column
    // would satisfy the left-hand bound and still be unreadable, and the
    // point of the message is that it can be read.
    expect(m.toast!.left).toBeGreaterThanOrEqual(m.column!.left);
    expect(m.toast!.right).toBeLessThanOrEqual(m.column!.right);
    // The message is what makes the box wide enough for any of this to
    // matter: `whitespace-nowrap` means it cannot wrap out of trouble.
    expect(m.toast!.width).toBeGreaterThan(m.trigger.width);
  });
});
