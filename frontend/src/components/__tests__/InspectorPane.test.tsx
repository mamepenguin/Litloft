/**
 * The inspector's width is a written rule now, so something has to hold
 * it to the number.
 *
 * `DESIGN.md` had no entry for this column at all — the 384px in §8.5
 * belongs to the media companion rail, a different part — so 300px was
 * not drift from a rule, it was the absence of one. The rule exists
 * now; this is what makes it more than prose.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { InspectorPane } from "../InspectorPane";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("the inspector column", () => {
  it("is 384px, the width DESIGN.md §8.5 gives it", () => {
    render(<InspectorPane>{null}</InspectorPane>);
    // `w-96` is 24rem is 384px. Asserting the class rather than a
    // computed width because jsdom applies no stylesheet.
    expect(screen.getByTestId("inspector-pane").className).toContain("w-96");
  });

  it("agrees with the rule that names it", () => {
    // The number lives in two places by necessity — a Tailwind class
    // and a table in DESIGN.md — so the pair is what needs pinning. A
    // change to either alone fails here.
    const design = readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");
    const section = design.slice(design.indexOf("### Inspector column"));
    expect(section.slice(0, section.indexOf("### Companion rail"))).toMatch(
      /inspector width \| `24rem` \(384px\)/,
    );
  });
});
