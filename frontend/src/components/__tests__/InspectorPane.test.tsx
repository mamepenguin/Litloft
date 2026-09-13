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
    expect(screen.getByTestId("inspector-pane").classList.contains("w-96")).toBe(true);
  });

  it("agrees with the rule that names it", () => {
    const design = readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf-8");
    const start = design.indexOf("### Inspector column");
    expect(start, "DESIGN.md has no `### Inspector column` heading").toBeGreaterThan(-1);
    // Searched rather than naming the following heading: a missing heading
    // gives -1, and `slice(0, -1)` would silently scan the rest of the file.
    const rest = design.slice(start);
    const nextHeading = rest.search(/\n#{1,3} /);
    expect(
      nextHeading,
      "`### Inspector column` runs to the end of DESIGN.md — no section boundary to cut at",
    ).toBeGreaterThan(-1);
    expect(rest.slice(0, nextHeading)).toMatch(/inspector width \| `24rem` \(384px\)/);
  });
});
