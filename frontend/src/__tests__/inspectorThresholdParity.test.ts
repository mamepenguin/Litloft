import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SHEET_PEEK_PX,
  SHEET_VISIBLE_HEIGHT,
} from "@/components/MobileInspectorSheet";
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

  it("no longer claims half shows the tab strip and the tab", () => {
    // Measured 2026-09-09 at 375x667: the header ran 277px against a
    // 267px visible sheet, so the strip was 28px below the fold and the
    // tab below that. The row said all three were on screen for as long
    // as none of them was checked.
    const row = design().match(/\|\s*half\s*\|[^|]*\|([^|]*)\|/);
    expect(row).not.toBeNull();
    expect(row![1]).toContain("scrolling");
    expect(row![1]).not.toMatch(/fixed part, the tab strip, and the tab/);
  });
});
