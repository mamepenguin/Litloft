import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { describe, expect, it } from "vitest";

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
