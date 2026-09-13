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
    expect(out).toHaveLength(MAX_BREAKDOWN_KINDS);
    expect(out.map((s) => s.kind)).toEqual(["video", "document"]);
  });

  it("breaks a tie on the kind's name, not on the API's order", () => {
    expect(folderKindBreakdown({ video: 5, audio: 5 }).map((s) => s.kind))
      .toEqual(["audio", "video"]);
    expect(folderKindBreakdown({ audio: 5, video: 5 }).map((s) => s.kind))
      .toEqual(["audio", "video"]);
  });

  it("returns nothing for a folder with no files", () => {
    expect(folderKindBreakdown({})).toEqual([]);
  });

  it("drops a kind the folder holds none of", () => {
    expect(folderKindBreakdown({ video: 3, audio: 0 })).toEqual([
      { kind: "video", count: 3 },
    ]);
  });

  it("passes a single kind through, count and all", () => {
    expect(folderKindBreakdown({ document: 12 })).toEqual([
      { kind: "document", count: 12 },
    ]);
  });
});
