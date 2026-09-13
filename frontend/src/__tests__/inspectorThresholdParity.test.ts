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
    // The two measure different things: 960 is "can a rail fit beside the
    // player", against a measured container; this is "should the inspector
    // start open", against the viewport.
    expect(sourceThreshold()).toBe(1120);
  });
});

/** Written as rows rather than as one loop over the table, because a loop that finds no rows passes. */
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
    const row = design().match(/\|\s*peek\s*\|\s*`(\d+)px`\s*\|/);
    expect(row).not.toBeNull();
    expect(Number(row![1])).toBe(SHEET_PEEK_PX);
  });

  it("documents the expression that puts the sheet's end on the screen", () => {
    expect(design()).toContain(`\`${SHEET_VISIBLE_HEIGHT}\``);
  });

  const heightCell = (state: string): string => {
    const row = design().match(
      new RegExp(`\\|\\s*${state}\\s*\\|([^|]*)\\|`),
    );
    expect({ state, found: row !== null }).toEqual({ state, found: true });
    return row![1];
  };

  const drawerVh = (): number => SHEET_DRAWER_VH * 100;

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

      expect(documentedDrawer).toBe(drawerVh());
      expect(documentedSnap).toBe(snap);
      expect(documentedVisible).toBe(
        documentedDrawer - Math.round((1 - snap) * 100),
      );
    });
  }

  it("does not state half as a fixed fraction any more", () => {
    const cell = heightCell("half");
    expect(cell).toMatch(/where nothing is measured/);
    expect(cell).toMatch(/player/);
    expect(heightCell("full")).not.toMatch(/player/);
  });

  /**
   * Only inputs inside the clamp: the bounds are deliberately *not* the
   * equation, since a player taller than the screen has no snap that satisfies it.
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

      const drawerHeight = (drawerVh() / 100) * viewportHeight;
      const onScreen = drawerHeight - viewportHeight * (1 - snap);

      expect(onScreen).toBeCloseTo(viewportHeight - playerBottom, 6);
    });
  }

  it("says out loud that the snap is not the height", () => {
    expect(design()).toContain(
      "The drawer is nine tenths of the window at\nboth states",
    );
  });

  it("says which viewport the drawer's height is in", () => {
    const design_ = design();
    expect(design_).toContain("`vh` above means `window.innerHeight`");
    expect(design_).toContain("sheetDrawerHeightPx(window.innerHeight)");
    expect(sheetDrawerHeightPx(667)).toBeCloseTo((drawerVh() / 100) * 667, 6);
  });

  it("states the bound that keeps the derivation from taking room away", () => {
    const bullet = design();
    expect(bullet).toContain(
      "the derivation applies only while it gives more room than the fixed",
    );
    expect(
      halfSnapUnderPlayer({ viewportHeight: 375, playerBottom: 375 }),
    ).toBeNull();
  });
});
