/**
 * The addon-policy table's column headings, measured in Chromium.
 *
 * ## Why this exists at all
 *
 * "The headings are still on screen when you reach the fourth drive" is a
 * layout property, and jsdom lays nothing out — `AddonPolicySection.test.tsx`
 * says so itself. Reading `globals.css` as a string does not answer it
 * either: #200 measured that and found the defect came back by appending
 * one line to the end of the sheet with every suite green.
 *
 * And the failure mode here is specifically invisible to a class check.
 * `position: sticky` resolves against the **nearest scrollport**, and the
 * wrapper carries `overflow-x: auto`, which makes it one in *both* axes.
 * A sticky head inside an unbounded wrapper therefore sticks to a box
 * that never scrolls and does nothing at all — measured on the running
 * app before the cap was added: the heading sat 290px above the viewport,
 * with the class present and correct the whole time. Only a browser can
 * tell those two apart.
 *
 * ## What it can see
 *
 * Where the heading is relative to its scrollport after that scrollport
 * has been scrolled; whether the cap turns the wrapper into a vertical
 * scroller at a given size; and that the head has a background of its own,
 * without which the rows show through it.
 *
 * ## What it cannot see
 *
 * Named so a green tick is not read as covering them.
 *
 * **No app is running**, so nothing here observes the section fetching a
 * policy, deriving which features get a legend entry, or how many copies
 * of a paragraph it draws — that is `AddonPolicySection.test.tsx`'s.
 *
 * **And nothing here notices the component losing the mechanism.** This
 * file builds its own table from the JSON above, so taking `max-h-[70vh]`
 * or `sticky` off `AddonPolicySection` leaves every case green —
 * measured. What connects the two is `addonPolicyFixtureParity.test.tsx`,
 * which compares the class lists in both directions; this file proves the
 * mechanism works, that one proves the section is using it. Neither
 * claim is the other's.
 *
 * **The row count is the fixture's, not the app's.** The app's table is
 * 548px at four drives, which is why the cases below drive the cap from
 * both directions rather than trusting one shape.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "addon-policy.html"),
).href;

/** The four addons this library installs; the app's table has four columns. */
const COLUMNS = 4;

interface Measurement {
  wrapperHeight: number;
  tableHeight: number;
  scrollsVertically: boolean;
  scrollsHorizontally: boolean;
  scrolledTo: number;
  headTop: number;
  firstRowTop: number;
  headPosition: string;
  headBackground: string;
}

declare global {
  interface Window {
    buildPolicyTable: (spec: {
      width: number;
      rows: number;
      columns: number;
    }) => void;
    measurePolicyTable: (scrollTop?: number) => Measurement;
  }
}

async function layout(
  page: import("@playwright/test").Page,
  { width, height, rows }: { width: number; height: number; rows: number },
  scrollTop = 0,
): Promise<Measurement> {
  await page.setViewportSize({ width: width + 40, height });
  await page.evaluate(
    (spec) => window.buildPolicyTable(spec),
    { width, rows, columns: COLUMNS },
  );
  return page.evaluate((top) => window.measurePolicyTable(top), scrollTop);
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

test.describe("the column headings survive the scroll", () => {
  test("a long table scrolls inside the cap and the heading stays at its top", async ({ page }) => {
    const m = await layout(page, { width: 700, height: 800, rows: 40 }, 300);

    expect(m.scrollsVertically).toBe(true);
    expect(m.scrolledTo).toBe(300);
    // The property, stated as a position rather than as a class: the head
    // is at the top edge of the box that scrolled, and the first row has
    // gone up past it.
    expect(m.headTop).toBe(0);
    expect(m.firstRowTop).toBeLessThan(0);
  });

  test("the head is opaque, so the rows do not show through it", async ({ page }) => {
    const m = await layout(page, { width: 700, height: 800, rows: 40 }, 300);
    expect(m.headPosition).toBe("sticky");
    expect(m.headBackground).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("a table that fits gets no inner scrollbar at all", async ({ page }) => {
    // The reason the cap is acceptable on a phone. It bites only when the
    // table is longer than it, and the app's own table at four drives is
    // not — so there is no nested scroller to catch a swipe.
    const m = await layout(page, { width: 700, height: 900, rows: 4 });

    expect(m.scrollsVertically).toBe(false);
    expect(m.tableHeight).toBeLessThanOrEqual(m.wrapperHeight);
  });

  test("the cap is 70% of the window, measured in both directions", async ({ page }) => {
    // Declared as an equation rather than as a number, because the number
    // is a function of the viewport and a literal would only be true of
    // one window.
    const tall = await layout(page, { width: 700, height: 1000, rows: 40 });
    expect(tall.wrapperHeight).toBe(700);

    const short = await layout(page, { width: 700, height: 500, rows: 40 });
    expect(short.wrapperHeight).toBe(350);
  });
});

test.describe("the columns still reach a narrow screen", () => {
  for (const width of [375, 430]) {
    test(`${width}px scrolls sideways without a nested vertical scroller`, async ({ page }) => {
      const m = await layout(page, { width, height: 812, rows: 4 });

      expect(m.scrollsHorizontally).toBe(true);
      expect(m.scrollsVertically).toBe(false);
    });
  }
});
