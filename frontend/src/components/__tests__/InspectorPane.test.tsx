/**
 * The inspector's width is a written rule now, so something has to hold
 * it to the number.
 *
 * `DESIGN.md` had no entry for this column at all — the 384px in
 * §"Companion region (media file detail)" belongs to the media
 * companion rail, a different part — so 300px was not drift from a
 * rule, it was the absence of one. The rule exists now; this is what
 * makes it more than prose.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { InspectorPane } from "../InspectorPane";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("the inspector column", () => {
  it('is 384px, the width DESIGN.md §"Inspector column" gives it', () => {
    render(<InspectorPane>{null}</InspectorPane>);
    // `w-96` is 24rem is 384px. Asserting the class rather than a
    // computed width because jsdom applies no stylesheet.
    expect(screen.getByTestId("inspector-pane").classList.contains("w-96")).toBe(true);
  });

  it("agrees with the rule that names it", () => {
    // The number lives in two places by necessity — a Tailwind class
    // and a table in DESIGN.md — so the pair is what needs pinning. A
    // change to either alone fails here.
    const design = readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");
    const start = design.indexOf("### Inspector column");
    expect(start, "DESIGN.md has no `### Inspector column` heading").toBeGreaterThan(-1);
    // The section ends at the next heading of the same level or
    // shallower, found by searching rather than by naming the heading
    // that follows: `indexOf` of a heading that is not there returns
    // -1, and `slice(0, -1)` then widens the scan to the rest of the
    // file rather than failing, which is a passing test that checks
    // nothing about where the row sits.
    const rest = design.slice(start);
    const nextHeading = rest.search(/\n#{1,3} /);
    expect(
      nextHeading,
      "`### Inspector column` runs to the end of DESIGN.md — no section boundary to cut at",
    ).toBeGreaterThan(-1);
    expect(rest.slice(0, nextHeading)).toMatch(/inspector width \| `24rem` \(384px\)/);
  });
});
