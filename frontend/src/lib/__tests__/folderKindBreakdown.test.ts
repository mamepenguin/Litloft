import { describe, it, expect } from "vitest";

import {
  MAX_BREAKDOWN_KINDS,
  folderKindBreakdown,
} from "@/lib/folderKindBreakdown";

describe("folderKindBreakdown", () => {
  it("orders by count, largest first", () => {
    expect(
      folderKindBreakdown({ document: 3, video: 135, image: 20 }),
    ).toEqual([
      { kind: "video", count: 135 },
      { kind: "image", count: 20 },
    ]);
  });

  it("names at most two kinds", () => {
    const out = folderKindBreakdown({
      video: 10,
      document: 6,
      image: 3,
      audio: 1,
    });
    // The counts partition the total, so a reader subtracts to get the
    // rest. A third entry spends width saying what the first two implied.
    expect(out).toHaveLength(MAX_BREAKDOWN_KINDS);
    expect(out.map((s) => s.kind)).toEqual(["video", "document"]);
  });

  it("breaks a tie on the kind's name, not on the API's order", () => {
    // Two folders holding the same mix have to be described the same
    // way; object key order is whatever the JSON parser produced.
    expect(folderKindBreakdown({ video: 5, audio: 5 }).map((s) => s.kind))
      .toEqual(["audio", "video"]);
    expect(folderKindBreakdown({ audio: 5, video: 5 }).map((s) => s.kind))
      .toEqual(["audio", "video"]);
  });

  it("returns nothing for a folder with no files", () => {
    expect(folderKindBreakdown({})).toEqual([]);
  });

  it("drops a kind the folder holds none of", () => {
    // The API omits empty kinds, but a caller that filled a full record
    // would otherwise get "Video 3 · Audio 0" — a column stating an
    // absence, which is the shape 原則 1 removes.
    expect(folderKindBreakdown({ video: 3, audio: 0 })).toEqual([
      { kind: "video", count: 3 },
    ]);
  });

  it("passes a single kind through, count and all", () => {
    // The caller decides whether to print the count; this reports it, so
    // the two callers cannot disagree about what the one kind is.
    expect(folderKindBreakdown({ document: 12 })).toEqual([
      { kind: "document", count: 12 },
    ]);
  });
});
