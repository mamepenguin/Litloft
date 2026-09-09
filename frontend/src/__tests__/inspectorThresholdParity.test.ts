import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SHEET_DRAWER_VH,
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  halfSnapUnderPlayer,
  sheetDrawerHeightPx,
} from "@/lib/sheetSnap";
import { SHEET_VISIBLE_HEIGHT } from "@/components/MobileInspectorSheet";
import {
  CANVAS_PADDING_REM,
  COLUMN_REM,
  INSPECTOR_BESIDE_MIN_REM,
  PLAYER_MIN_REM,
  RAIL_MIN_REM,
} from "@/lib/layoutSizes";

/**
 * `DESIGN.md` names the inspector's default-open threshold; the store
 * decides it.
 *
 * The doc used to name the constant instead of its value, precisely so
 * the two could not disagree — and then the value went in, because a
 * design table that will not say a number is not much of a design
 * table. This is the other way of keeping them honest: both sides are
 * read as files, through no code either of them runs, so a change to
 * one without the other is a failure rather than a drift.
 *
 * Same shape as `file-kind-parity.test.ts`, which compares core's mime
 * tables against the intelligence addon's copy.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function sourceThreshold(): number {
  const source = readFileSync(
    resolve(REPO_ROOT, "frontend/src/lib/inspectorOpenStore.ts"),
    "utf-8",
  );
  const match = source.match(/const VIEWPORT_OPEN_THRESHOLD = (\d+);/);
  expect(match).not.toBeNull();
  return Number(match![1]);
}

function documentedThreshold(): number {
  const design = readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");
  const row = design.match(
    /\|\s*`(\d+)px`\s*\(`VIEWPORT_OPEN_THRESHOLD`\)\s*\|/,
  );
  expect(row).not.toBeNull();
  return Number(row![1]);
}

describe("inspector default-open threshold", () => {
  it("is the same number in the store and in DESIGN.md", () => {
    expect({ design: documentedThreshold() }).toEqual({
      design: sourceThreshold(),
    });
  });

  it("is the confirmed 1120, not the 960 next to it in that table", () => {
    // The two measure different things — 960 is "can a rail fit beside
    // the player", against a measured container; this is "should the
    // inspector start open", against the viewport — and the band
    // between them, where they fit but stay closed until asked for, is
    // a state one number cannot express.
    expect(sourceThreshold()).toBe(1120);
  });
});

/**
 * The §8.5 width table against the module the layout computes from.
 *
 * Written as rows here rather than as one loop over the table, because
 * a loop that finds no rows passes. Each of these is a number a reader
 * of `DESIGN.md` will act on.
 */
describe("§8.5 widths", () => {
  const design = () =>
    readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");

  const remRow = (label: string): number => {
    const row = design().match(
      new RegExp(`\\|\\s*${label}\\s*\\|\\s*\`([\\d.]+)rem\``),
    );
    expect({ label, found: row !== null }).toEqual({ label, found: true });
    return Number(row![1]);
  };

  it("documents the player minimum the shell measures against", () => {
    expect(remRow("player minimum")).toBe(PLAYER_MIN_REM);
  });

  it("documents the inspector's width", () => {
    expect(remRow("inspector width")).toBe(COLUMN_REM);
  });

  it("documents the rail width as the same number, separately", () => {
    // Two rows on purpose: they arrive at 24rem for the same reason
    // rather than by sharing a value, and merging them would make a
    // later change to one read as a change to both.
    expect(remRow("rail width")).toBe(COLUMN_REM);
  });

  it("documents the canvas padding the player sits inside", () => {
    expect(remRow("canvas padding")).toBe(CANVAS_PADDING_REM);
  });

  it("documents the beside threshold, and it is still a sum", () => {
    expect(remRow("beside threshold")).toBe(INSPECTOR_BESIDE_MIN_REM);
    // The sum, not a feel: `DESIGN.md` says to recompute it when a term
    // moves, and this is what recomputing means. Written from the
    // constants, never from literals — a `2` here would be a second
    // copy of the padding term inside the test that checks the first.
    expect(INSPECTOR_BESIDE_MIN_REM).toBe(
      PLAYER_MIN_REM + CANVAS_PADDING_REM + COLUMN_REM,
    );
  });

  it("documents the rail switch threshold as its own sum", () => {
    expect(remRow("switch threshold")).toBe(RAIL_MIN_REM);
  });
});

describe("§Layering sheet states", () => {
  const design = () => readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");

  it("documents the resting height the sheet actually uses", () => {
    // Same rule as the §8.5 widths: a number in the design table and a
    // constant in the code, with nothing between them, is the drift the
    // parity suite exists to make unrepresentable.
    const row = design().match(/\|\s*peek\s*\|\s*`(\d+)px`\s*\|/);
    expect(row).not.toBeNull();
    expect(Number(row![1])).toBe(SHEET_PEEK_PX);
  });

  it("documents the expression that puts the sheet's end on the screen", () => {
    // The one that is not a number. §Layering states the box between the
    // drawer and the scroller as an expression, precisely so nobody
    // writes the snap into the CSS a second time — and a document quoting
    // an expression the code no longer uses is worse than one quoting
    // none, because a reader would act on it.
    expect(design()).toContain(`\`${SHEET_VISIBLE_HEIGHT}\``);
  });

  /**
   * The Height column, evaluated rather than spot-checked.
   *
   * The cell this replaces asserted the *old* wording, negated, plus one
   * keyword — so any replacement containing the word "scrolling" passed,
   * including "the whole window … all at once, with no scrolling
   * needed", which is the claim this unit exists to retract. Detector
   * rule 4: a sentence saying "the table is true of the code" is
   * unverified until the table being false breaks something.
   *
   * So each row states its own arithmetic — `90vh` less `vh × (1 − s)`
   * = the remainder — and this reads all three numbers back out and
   * checks them against the snap constants and the drawer's own class
   * list. A cell that is not that subtraction does not parse; a cell
   * with the wrong snap, the wrong drawer height or a remainder that
   * does not follow from them is red.
   *
   * **The third column is prose and nothing here enforces it.** There is
   * no code-derived fact that says whether the tab strip is on screen at
   * a given snap — it depends on the header's height, which is a
   * property of the file being looked at. `DESIGN.md` says so too.
   */
  const heightCell = (state: string): string => {
    const row = design().match(
      new RegExp(`\\|\\s*${state}\\s*\\|([^|]*)\\|`),
    );
    expect({ state, found: row !== null }).toEqual({ state, found: true });
    return row![1];
  };

  /**
   * The fraction of the window the drawer is actually rendered at.
   *
   * Read from the constant the component writes on the element rather
   * than out of a class list: the drawer's height stopped being a `vh`
   * class this round, because a CSS viewport unit is not the viewport
   * vaul solves its snaps in. `MobileInspectorSheet.test.tsx` is what
   * holds the rendered element to this number and to carrying no
   * viewport unit of its own; this is the document's side of it.
   */
  const drawerVh = (): number => SHEET_DRAWER_VH * 100;

  // Both snaps, declared. One row would leave the other's arithmetic
  // unread, and the two differ only in the number that is easiest to
  // copy from the wrong place.
  const ROWS = [
    { state: "half", snap: SHEET_SNAP_HALF_FALLBACK },
    { state: "full", snap: SHEET_SNAP_FULL },
  ];
  expect(ROWS).toHaveLength(2);

  for (const { state, snap } of ROWS) {
    it(`states ${state}'s height as the subtraction the code performs`, () => {
      const cell = heightCell(state);
      const parsed = cell.match(
        /`(\d+)vh`\s*less\s*`vh × \(1 − ([\d.]+)\)`\s*=\s*\*\*(\d+)vh\*\*/,
      );
      expect({ state, cell, parsed: parsed !== null }).toEqual({
        state,
        cell,
        parsed: true,
      });

      const [documentedDrawer, documentedSnap, documentedVisible] = [
        Number(parsed![1]),
        Number(parsed![2]),
        Number(parsed![3]),
      ];

      // The drawer's height is the component's, not a figure typed here.
      expect(documentedDrawer).toBe(drawerVh());
      // The snap is the constant vaul is handed.
      expect(documentedSnap).toBe(snap);
      // And the remainder follows from the two, rather than being a
      // third independent number. `90 − 50 = 40` is the whole of the
      // correction this row needed: the old cell said 50.
      expect(documentedVisible).toBe(
        documentedDrawer - Math.round((1 - snap) * 100),
      );
    });
  }

  it("does not state half as a fixed fraction any more", () => {
    // The row used to read as one unconditional subtraction, and it is
    // now that subtraction *plus* a condition. Both halves are asserted:
    // the arithmetic above, and here the fact that it is conditional and
    // that the other case names what it is derived from. A cell that
    // dropped the condition would still parse above and would be telling
    // a reader that a video page's sheet takes 40vh, which it does not.
    const cell = heightCell("half");
    expect(cell).toMatch(/where nothing is measured/);
    expect(cell).toMatch(/player/);
    // And full's is not conditional, which is the difference between the
    // two rows.
    expect(heightCell("full")).not.toMatch(/player/);
  });

  /**
   * §Layering's equation, evaluated against the function that solves it.
   *
   * Two implementations of one relationship, which is what makes this a
   * parity test rather than one table read twice: the document states the
   * geometry — the drawer's height less vaul's translate is the room under
   * the player — and `halfSnapUnderPlayer` solves it for the snap. The
   * drawer's height comes from the component's own class list, so all
   * three have to agree.
   *
   * Only inputs inside the clamp. The bounds are deliberately *not* the
   * equation — a player taller than the screen has no snap that satisfies
   * it — and asserting them here would be asserting the opposite of what
   * this case is about. `lib/__tests__/sheetSnap.test.ts` carries them.
   */
  const UNCLAMPED = [
    { viewportHeight: 667, playerBottom: 315 },
    { viewportHeight: 812, playerBottom: 329.25 },
    { viewportHeight: 915, playerBottom: 400 },
  ];
  expect(UNCLAMPED).toHaveLength(3);

  it("states the equation the derived snap solves", () => {
    expect(design()).toContain(
      "`halfSnapUnderPlayer` solves `drawerHeight −\n  vh × (1 − snap) = vh − playerBottom`",
    );
  });

  for (const { viewportHeight, playerBottom } of UNCLAMPED) {
    it(`solves it at ${viewportHeight}px with the player ending at ${playerBottom}`, () => {
      const snap = halfSnapUnderPlayer({ viewportHeight, playerBottom })!;
      expect(snap).not.toBeNull();

      // The left-hand side, written out from the document rather than
      // from the function: the drawer's height less what vaul slides
      // past the bottom edge.
      const drawerHeight = (drawerVh() / 100) * viewportHeight;
      const onScreen = drawerHeight - viewportHeight * (1 - snap);

      // The right-hand side: the room under the player.
      expect(onScreen).toBeCloseTo(viewportHeight - playerBottom, 6);
    });
  }

  it("says out loud that the snap is not the height", () => {
    // The sentence under the table is what stops the next reader
    // re-deriving `half = 50vh` from the snap name. It is prose, so this
    // pins its claim rather than its wording: the drawer is the same
    // height at both snaps, and the snap is the translate.
    expect(design()).toContain(
      "The drawer is nine tenths of the window at\nboth states",
    );
  });

  it("says which viewport the drawer's height is in", () => {
    // The first finding of round two, in the document that has to carry
    // it: the `vh` this section writes is `window.innerHeight`, not the
    // CSS unit, and the two differ on a phone by the height of the URL
    // bar. A paragraph that dropped the distinction would leave the next
    // reader free to spell the height as a class again.
    const design_ = design();
    expect(design_).toContain("`vh` above means `window.innerHeight`");
    expect(design_).toContain("sheetDrawerHeightPx(window.innerHeight)");
    // And the derivation's own term, evaluated: the document's fraction
    // against the function the component calls.
    expect(sheetDrawerHeightPx(667)).toBeCloseTo((drawerVh() / 100) * 667, 6);
  });

  it("states the bound that keeps the derivation from taking room away", () => {
    // The landscape regression, as the rule rather than as the viewport
    // it was found at. The lower end is no longer a clamp to a peek row;
    // it is a refusal, and the sheet keeps the fraction it replaced.
    const bullet = design();
    expect(bullet).toContain(
      "the derivation applies only while it gives more room than the fixed",
    );
    // Read back through the function: at a landscape phone with a player
    // filling the scrollport there is no snap at all.
    expect(
      halfSnapUnderPlayer({ viewportHeight: 375, playerBottom: 375 }),
    ).toBeNull();
  });
});
