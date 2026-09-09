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
 * **The row count is the fixture's**, and the cases below therefore use
 * the app's own — twelve `tbody` rows at four drives (four drive rows and
 * eight feature sub-rows), 548px. They used `rows: 4` and `height: 812`,
 * which is a third of the app's table at a height no phone's viewport
 * has, and that pair is the only reason the "no inner scrollbar on a
 * phone" claim was green. It was false at every real phone height.
 */

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { declareEach } from "../src/test/declareEach";

const FIXTURE = pathToFileURL(
  resolve(__dirname, "fixtures", "addon-policy.html"),
).href;

/** The four addons this library installs; the app's table has four columns. */
const COLUMNS = 4;

/**
 * The app's own table at four drives: four drive rows and eight feature
 * sub-rows, counted in the running app, 548px tall.
 *
 * Every case that makes a claim about what an operator sees uses this.
 * The fixture can draw any number of rows, and a number that is not the
 * app's turns a claim about the app into a claim about the fixture.
 */
const APP_DRIVES = 4;
const APP_FEATURES_PER_DRIVE = 2;
const APP_TABLE_HEIGHT = 548;

/**
 * Viewport heights, and the arithmetic that decides the answer at each.
 *
 * `70vh` against a 548px table means the wrapper scrolls below a 783px
 * viewport and does not above it — so a phone is always below, and a
 * desktop window is usually above. Declared per height rather than
 * asserted as one blanket answer, because the blanket answer is what was
 * wrong: `height: 812` was picked, and 812 is one of the few values where
 * the convenient answer is the true one.
 */
/**
 * `test` under the name `declareEach`'s `register` parameter has.
 *
 * Passed to the helper by reference rather than wrapped, so there is no
 * per-case callback with a registration inside it for a condition to sit
 * in front of.
 */
const registerCase: (
  title: string,
  body: (args: { page: Page }) => Promise<void>,
) => void = test;

const HEIGHTS: { height: number; label: string; innerScroll: boolean }[] = [
  { height: 667, label: "iPhone SE viewport", innerScroll: true },
  { height: 715, label: "a phone with browser chrome", innerScroll: true },
  { height: 745, label: "iPhone 15 viewport", innerScroll: true },
  { height: 807, label: "a 1512x807 desktop window", innerScroll: false },
  { height: 863, label: "a taller desktop window", innerScroll: false },
];

interface Measurement {
  capPx: number;
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
      drives: number;
      featuresPerDrive: number;
      columns: number;
    }) => void;
    measurePolicyTable: (scrollTop?: number) => Measurement;
  }
}

async function layout(
  page: import("@playwright/test").Page,
  {
    width,
    height,
    drives = APP_DRIVES,
  }: { width: number; height: number; drives?: number },
  scrollTop = 0,
): Promise<Measurement> {
  await page.setViewportSize({ width: width + 40, height });
  await page.evaluate(
    (spec) => window.buildPolicyTable(spec),
    {
      width,
      drives,
      featuresPerDrive: APP_FEATURES_PER_DRIVE,
      columns: COLUMNS,
    },
  );
  return page.evaluate((top) => window.measurePolicyTable(top), scrollTop);
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

test.describe("the column headings survive the scroll", () => {
  test("the app's own table, on a phone's height, scrolls to its end with the head still at the top", async ({ page }) => {
    // Scrolled to the end rather than by a chosen number of pixels: at
    // 667px the cap is 467px and the table 548px, so the whole scroll is
    // 81px and a request for 300 clamps — an assertion on 300 would have
    // been about the clamp, not about the heading.
    const m = await layout(page, { width: 700, height: 667 }, 10_000);

    expect(m.scrollsVertically).toBe(true);
    expect(Math.round(m.scrolledTo)).toBe(
      Math.round(m.tableHeight - m.wrapperHeight),
    );
    expect(m.scrolledTo).toBeGreaterThan(0);
    // The property, stated as a position rather than as a class: the head
    // is at the top edge of the box that scrolled, and the first row has
    // gone up past it.
    expect(m.headTop).toBe(0);
    expect(m.firstRowTop).toBeLessThan(0);
  });

  test("and over a long scroll, with more drives than this library has", async ({ page }) => {
    // Twelve drives rather than four: the app's own table only ever
    // scrolls 81px on a phone, which is a weak exercise of a sticky
    // heading. This is the shape a bigger install produces.
    const m = await layout(page, { width: 700, height: 800, drives: 12 }, 600);

    expect(m.scrollsVertically).toBe(true);
    expect(m.scrolledTo).toBe(600);
    expect(m.headTop).toBe(0);
    expect(m.firstRowTop).toBeLessThan(-500);
  });

  test("the head is opaque, so the rows do not show through it", async ({ page }) => {
    const m = await layout(
      page,
      { width: 700, height: 667 },
      300,
    );
    expect(m.headPosition).toBe("sticky");
    expect(m.headBackground).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("the app's own table is the height the claims are made about", async ({ page }) => {
    // The number every case here and every sentence in `DESIGN.md` and
    // `docs/` is arithmetic on. If the section's rows change shape this
    // is where it is noticed, rather than in a paragraph nobody reruns.
    const m = await layout(page, { width: 700, height: 900 });
    expect(Math.round(m.tableHeight)).toBe(APP_TABLE_HEIGHT);
  });

  test("the cap is 70% of the window, measured in both directions", async ({ page }) => {
    // Declared as an equation rather than as a number, because the number
    // is a function of the viewport and a literal would only be true of
    // one window.
    //
    // On the cap and not on the realised box: `max-height` is a ceiling,
    // so where the table is shorter the box is the table's own height.
    // Asserting `clientHeight === 0.7 * viewport` conflated the two and
    // was false at every height where the cap does not bite — which is
    // most desktop windows.
    const tall = await layout(page, { width: 700, height: 1000 });
    expect(tall.capPx).toBeCloseTo(700, 0);
    expect(tall.wrapperHeight).toBeCloseTo(APP_TABLE_HEIGHT, 0);

    const short = await layout(page, { width: 700, height: 500 });
    expect(short.capPx).toBeCloseTo(350, 0);
    expect(short.wrapperHeight).toBeCloseTo(350, 0);
  });
});

test.describe("what the cap does at each real viewport height", () => {
  // The claim that was wrong, replaced by the mechanism and its
  // arithmetic, declared per height. `innerScroll` is written out per row
  // and not computed from the measurement — an expectation derived from
  // the observation would agree with whatever the app did.
  const declared = declareEach(
    HEIGHTS,
    registerCase,
    ({ height, label, innerScroll }) => ({
      title: `${height}px (${label})`,
      id: `${height}:${innerScroll ? "inner" : "page"}`,
      body: async ({ page }: { page: Page }) => {
        const m = await layout(page, { width: 700, height });

        // The mechanism, at every height: the ceiling is 70% of the
        // window.
        expect(m.capPx).toBeCloseTo(height * 0.7, 0);
        // And the consequence, declared per height rather than derived:
        // the box scrolls exactly where the table is taller than the
        // ceiling, and the app's table is 548px.
        expect(m.scrollsVertically).toBe(innerScroll);
        expect(height * 0.7 < APP_TABLE_HEIGHT).toBe(innerScroll);
        // Either way the head is where it should be: at the top of the
        // box when that box scrolls, and at the top of the table when it
        // does not.
        expect(m.headTop).toBe(0);
      },
    }),
  );

  test("declared a case at every height, with what it expects there", () => {
    // The register the loop actually produced, against a set written out
    // here. `expect(HEIGHTS).toHaveLength(5)` catches the table being
    // halved; it stays green when the *loop* is, which is the failure one
    // line below it. `declareEach` records an id only after the
    // registration, so a skipped case is missing from this list.
    expect(declared).toEqual([
      "667:inner",
      "715:inner",
      "745:inner",
      "807:page",
      "863:page",
    ]);
  });
});

test.describe("the columns still reach a narrow screen", () => {
  /**
   * Both phone widths, enumerated in the guard below rather than counted
   * here: "shrinking the measured scope without moving the expected
   * count" is what detector rule 1 names, and a length pin on this array
   * only sees it happen to the array.
   */
  const WIDTHS = [375, 430];

  const declared = declareEach(WIDTHS, registerCase, (width) => ({
    title: `${width}px scrolls sideways, and vertically too on a phone's height`,
    id: String(width),
    body: async ({ page }: { page: Page }) => {
      const m = await layout(page, { width, height: 667 });

      expect(m.scrollsHorizontally).toBe(true);
      // Both axes, and that is the trade rather than an accident: at a
      // phone's height 70vh is under the app's table, so the wrapper is a
      // nested scroller — and it is what keeps the four checkbox columns
      // labelled, which is the whole reason the cap is there.
      expect(m.scrollsVertically).toBe(true);
      expect(m.headTop).toBe(0);
    },
  }));

  test("declared a case at both phone widths", () => {
    // Written out here, so halving the list and halving the loop both
    // have to disagree with it. The `toHaveLength(2)` that stood here
    // only caught the first of those.
    expect(declared).toEqual(["375", "430"]);
  });
});
