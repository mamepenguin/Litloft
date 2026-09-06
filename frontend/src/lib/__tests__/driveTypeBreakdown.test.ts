import { describe, expect, it } from "vitest";

import { TYPE_OPTION_KEYS } from "@/components/folder/filterOptions";
import {
  DRIVE_TYPE_ORDER,
  driveTypeCounts,
} from "@/lib/driveTypeBreakdown";

/**
 * The breakdown exists so two drive cards can be compared down the
 * column. That is a claim about the *set* and its *order*, and the
 * response can supply neither: `file_types` comes from a `group_by` with
 * no guaranteed order and no zero-count rows.
 */
describe("drive type breakdown", () => {
  it("always names all six types, in the declared order", () => {
    const counts = driveTypeCounts({ image: 2, video: 5 });
    expect(counts.map((c) => c.type)).toEqual([
      "video",
      "image",
      "audio",
      "document",
      "archive",
      "other",
    ]);
    expect(counts).toHaveLength(6);
  });

  it("keeps the six even when the drive reports nothing", () => {
    const counts = driveTypeCounts({});
    expect(counts).toHaveLength(6);
    expect(counts.every((c) => c.count === 0)).toBe(true);
  });

  /**
   * `FileType` has seven members and the order has six; `subtitle` is the
   * one left out. Dropping it would leave the breakdown adding up to less
   * than the file count printed directly above it, with nothing on screen
   * saying why.
   */
  it("folds a type it does not name into `other` rather than dropping it", () => {
    const counts = driveTypeCounts({ subtitle: 3, other: 4 });
    const byType = Object.fromEntries(counts.map((c) => [c.type, c.count]));
    expect(byType.other).toBe(7);
    expect(counts.reduce((a, c) => a + c.count, 0)).toBe(7);
  });


  /**
   * The order is the filter menu's, minus the two kinds that are
   * narrowings of `document` and never appear in `file_type`. Derived, so
   * a card and the filter chip beside it cannot come to disagree.
   */
  it("reads the same vocabulary, in the same sequence, as the filter menu", () => {
    const menu = TYPE_OPTION_KEYS.map((o) => o.value).filter(
      (v) => v !== null && v !== "markdown" && v !== "pdf",
    );
    expect([...DRIVE_TYPE_ORDER]).toEqual(menu);
  });
});
