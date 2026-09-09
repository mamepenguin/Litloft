import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF,
  SHEET_SNAP_POINTS,
  SHEET_VISIBLE_HEIGHT,
} from "@/components/MobileInspectorSheet";
import { declareEach, expectDistinct } from "@/test/declareEach";
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

/**
 * vitest's `it`, narrowed to the two arguments the helper uses.
 *
 * `it` is overloaded (options objects, `.each`, modifiers), so handing it
 * over unnarrowed makes the helper infer the options overload rather than
 * a test body.
 */
const registerCase: (title: string, body: () => void | Promise<void>) => void =
  it;

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

  /** The `90vh` the drawer is actually rendered at, read off the component. */
  const drawerVh = (): number => {
    const source = readFileSync(
      resolve(REPO_ROOT, "frontend/src/components/MobileInspectorSheet.tsx"),
      "utf-8",
    );
    const match = source.match(/className="fixed bottom-0[^"]*\sh-\[(\d+)vh\]/);
    expect(match).not.toBeNull();
    return Number(match![1]);
  };

  // Both snaps, and the population is the sheet's own snap points rather
  // than a length written here: a third snap added to `SHEET_SNAP_POINTS`
  // — which unit D is expected to do — makes this red until the table
  // grows a row for it. `toHaveLength(2)` could not say that, and it read
  // the literal three lines above it rather than the loop below.
  const ROWS = [
    { state: "half", snap: SHEET_SNAP_HALF },
    { state: "full", snap: SHEET_SNAP_FULL },
  ];
  expect(ROWS.map((row) => row.snap)).toEqual(SHEET_SNAP_POINTS);
  expect(expectDistinct(ROWS.map((row) => row.state))).toEqual({
    unique: 2,
    total: 2,
  });

  // What the loop below actually declared. `expect(ROWS).toHaveLength(2)`
  // did not observe it: `if (state === "full") continue;` as the loop's
  // first statement left 12 of 13 cases green with the `full` row's
  // arithmetic unread. See `declareEach`.
  const declaredRows = declareEach(ROWS, registerCase, ({ state, snap }) => ({
    title: `states ${state}'s height as the subtraction the code performs`,
    id: state,
    body: () => {
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
    },
  }));

  it("evaluates a row for every snap the sheet has", () => {
    // The register against the declaration, not against itself.
    expect(declaredRows).toEqual(ROWS.map((row) => row.state));
  });

  it("says out loud that the snap is not the height", () => {
    // The sentence under the table is what stops the next reader
    // re-deriving `half = 50vh` from the snap name. It is prose, so this
    // pins its claim rather than its wording: the drawer's height, and
    // the fact that it is the same at both snaps.
    const design_ = design();
    expect(design_).toContain(`The drawer is \`h-[${drawerVh()}vh]\` at both states`);
  });
});
