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

import { test, expect, type Page } from "@playwright/test";
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
 * Every strip case this file registers, recorded as it registers it.
 *
 * The guard below reads *this*, not `PHONES` and `ITEM_COUNTS`. Asserting
 * on the arrays pins what the file declares, and the cases live one
 * indirection further out: `for (const phone of PHONES.slice(0, 1))` takes
 * the suite from 67 to 64 with an array assertion still green, which is
 * three of the six measurements of this menu's geometry deleted in silence.
 * Recording at registration puts the loop inside the thing being checked.
 *
 * Recorded **after** the `test()` it claims, not before. Recorded first, a
 * `continue` between the two lines drops the registration and leaves the
 * record — measured at 198 browser cases falling to 196 passed, 0 failed,
 * with the guard below still green. Recorded last, a skipped push leaves
 * this array short of the declarations and the guard red, and anything
 * that skips the `test()` takes its push with it: two directions caught
 * by two different halves, not by one impossibility — a `continue`
 * between the `test()` and the push really does skip only the push, and
 * is caught by the disagreement rather than being unreachable. Same order
 * as `mobile-inspector-sheet.spec.ts`'s `eachCase`.
 *
 * Its honest limit is unchanged and is the sibling fixture's too
 * (`justified-grid.spec.ts`, "is exactly the set this file tests"): the
 * expected set is written in this file, so what the guard buys is that
 * removing a case has to disagree with something, not proof from outside.
 */
const registeredStripCases: string[] = [];

const stripCaseId = (phone: (typeof PHONES)[number], items: number) =>
  `${phone.width}x${phone.height} @ ${items}`;

/**
 * Register a strip case **and** record it, in one call.
 *
 * The record used to be a second statement beside the `test()`, which
 * leaves the two separable: a `continue` between them skips one and keeps
 * the other, and the guard below then compares a list that agrees with
 * itself. Three narrower repairs were made to this shape before this one —
 * closing the array, closing the loop, closing the names of the spelling
 * functions — and each time the next round found the seam that was left.
 *
 * There is no seam here. A case that is not registered is not recorded,
 * because registering it is what records it.
 */
function stripCase(
  phone: (typeof PHONES)[number],
  items: number,
  title: string,
  body: (args: { page: Page }) => Promise<void>,
) {
  test(title, body);
  registeredStripCases.push(stripCaseId(phone, items));
}

test("registers exactly the screens and menus this file measures", () => {
  // Both sides enumerated rather than counted, and the expected side
  // recomputed from the two axes rather than read off the loop — so a
  // `.slice()` on either axis is red, and so is swapping one height for
  // another. Skipping a `test()` while keeping its record is not a
  // mutation this has to catch any more: `stripCase` is the only way to
  // write either, and it writes both.
  expect(registeredStripCases).toEqual(
    PHONES.flatMap((phone) => ITEM_COUNTS.map((n) => stripCaseId(phone, n))),
  );
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
      stripCase(
        phone,
        items,
        `hangs off the bottom of a ${phone.label} at ${items} items, and comes back when flipped`,
        async ({ page }) => {
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
        },
      );
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
   * constant beside one.
   *
   * What makes the toast wider than its trigger is its own `px-3`, not
   * this text: a one-character message still measures 30.3px against a
   * 28px trigger. What the text buys is the *amount* of the overhang.
   *
   * `whitespace-nowrap` is **not** what the two cases below turn on —
   * measured by taking it off the fixture, the toast wraps, its width
   * falls, and both cases still pass every bound they assert. What catches
   * that edit is the parity test, which compares the fixture's class list
   * against the component's. Non-emptiness is held by the fixture rather
   * than by an assertion: an empty message renders no toast at all and
   * `m.toast` is null, so both cases go red.
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
    // The box is wider than the trigger it hangs from — its padding does
    // that on its own — so "inside both edges" is a claim about a box with
    // width, not about a point.
    expect(m.toast!.width).toBeGreaterThan(m.trigger.width);
  });
});
