/**
 * Whether the canvas holds the player and the panels as two columns, from the
 * scroll container's width less the host's padding and the root font size.
 */
import { describe, expect, it } from "vitest";

import { splitFits } from "@/lib/workbenchSplit";

describe("SPEC-CORE-126 I9 the width part of split eligibility", () => {
  it.each([16, 20])(
    "SPEC-CORE-126 I9 fits at exactly 61rem and not at 61rem minus 1px (root font size %ipx)",
    (rem) => {
      expect(splitFits(61 * rem, rem)).toBe(true);
      expect(splitFits(61 * rem - 1, rem)).toBe(false);
    },
  );

  it("SPEC-CORE-126 I9 scales the threshold with the root font size", () => {
    // 61rem at 16px is 976px, under 61rem at 20px (1220px).
    expect(splitFits(976, 16)).toBe(true);
    expect(splitFits(976, 20)).toBe(false);
    expect(splitFits(1220, 20)).toBe(true);
  });

  it("SPEC-CORE-126 I9 fits well over the threshold and not at zero", () => {
    expect(splitFits(1440, 16)).toBe(true);
    expect(splitFits(0, 16)).toBe(false);
  });

});
