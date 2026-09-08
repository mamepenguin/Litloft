import { describe, it, expect } from "vitest";

import {
  primaryMeta,
  primaryMetaText,
  primaryMetaParts,
  hasKnownLength,
  formatDimensions,
} from "@/lib/primaryMeta";
import type { FileItem, FileType } from "@/types";

const file = (overrides: Partial<FileItem> = {}): FileItem => ({
  id: "f",
  filename: "f",
  title: "f",
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "document",
  mime_type: "text/plain",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 83,
  duration: null,
  image_width: null,
  image_height: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  ...overrides,
});

/**
 * Every `FileType`, so a new one cannot be added without deciding what
 * its cards lead with. Typed as a mapped type rather than an array with
 * a length assertion: a hand-written list is a claim about a constant
 * this file owns, true of any future version of the union.
 */
const EXPECTED: { [K in FileType]: "none" | "size" | "dimensions" } = {
  video: "none",
  audio: "none",
  image: "dimensions",
  document: "size",
  archive: "size",
  subtitle: "size",
  other: "size",
};

describe("primaryMeta", () => {
  it.each(Object.entries(EXPECTED) as [FileType, string][])(
    "leads a %s card with its %s",
    (file_type, expected) => {
      const probed =
        file_type === "image" ? { image_width: 1920, image_height: 1080 } : {};
      expect(primaryMeta(file({ file_type, ...probed })).kind).toBe(expected);
    },
  );

  it("covers every file type there is", () => {
    expect(Object.keys(EXPECTED)).toHaveLength(7);
  });

  it("gives an unprobed image the date alone, not its size", () => {
    // A fallback would make "kind → first metadatum" stop being a
    // function: two image cards side by side would describe themselves
    // differently for a reason invisible to the reader. Measured on
    // 2026-09: 3 of 1063 active images have no dimensions, all of them
    // broken JPEGs — the branch is walked, not theoretical.
    expect(primaryMeta(file({ file_type: "image" })).kind).toBe("none");
    expect(
      primaryMeta(file({ file_type: "image", image_width: 1920 })).kind,
    ).toBe("none");
    expect(
      primaryMeta(file({ file_type: "image", image_height: 1080 })).kind,
    ).toBe("none");
  });

  it("carries the dimensions through when they are known", () => {
    expect(
      primaryMeta(
        file({ file_type: "image", image_width: 1920, image_height: 1080 }),
      ),
    ).toEqual({ kind: "dimensions", width: 1920, height: 1080 });
  });

  it("says nothing for a video whose length was never probed either", () => {
    // Neither the badge nor this: the card is left with its date. The
    // size is the number that would be wrong — a `.loft` reference file
    // reports the pointer's size, which is how D-3 got "19 minutes,
    // 83 B".
    expect(primaryMeta(file({ file_type: "video", duration: null })).kind).toBe(
      "none",
    );
  });
});

describe("formatDimensions", () => {
  it("uses the multiplication sign, not a letter", () => {
    expect(formatDimensions(1920, 1080)).toBe("1920 × 1080");
    expect(formatDimensions(1920, 1080)).not.toContain("x");
  });
});

describe("primaryMetaText", () => {
  it("renders each branch of the table, and null for the silent one", () => {
    expect(primaryMetaText(file({ file_type: "document", file_size: 25437 }))).toBe(
      "24.8 KB",
    );
    expect(
      primaryMetaText(
        file({ file_type: "image", image_width: 1920, image_height: 1080 }),
      ),
    ).toBe("1920 × 1080");
    expect(primaryMetaText(file({ file_type: "video" }))).toBeNull();
  });

  it("never substitutes the size for dimensions it does not have", () => {
    // The whole point of the null: a caller that treated it as "fall
    // back to something" would put two different first facts on two
    // image rows for a reason the reader cannot see.
    expect(primaryMetaText(file({ file_type: "image", file_size: 2295580 }))).toBeNull();
  });

  it("agrees with the rule it renders, for every file type", () => {
    // The adapter is the only thing three surfaces call, so a branch
    // that drifted from `primaryMeta` would be invisible in the table
    // test above.
    for (const file_type of Object.keys(EXPECTED) as FileType[]) {
      const probed =
        file_type === "image" ? { image_width: 1920, image_height: 1080 } : {};
      const f = file({ file_type, ...probed });
      expect(primaryMetaText(f) === null).toBe(primaryMeta(f).kind === "none");
    }
  });
});

describe("hasKnownLength", () => {
  it("is true for exactly the two kinds that have one, and only once probed", () => {
    // Every badge in the app used to spell this out for itself. One
    // definition is the point: a surface that badged under one
    // condition and suppressed its size under another would drop a
    // fact off the card with neither half looking wrong.
    const EXPECTED_TRUE: FileType[] = ["video", "audio"];
    for (const file_type of Object.keys(EXPECTED) as FileType[]) {
      expect(hasKnownLength(file({ file_type, duration: 1438 }))).toBe(
        EXPECTED_TRUE.includes(file_type),
      );
      expect(hasKnownLength(file({ file_type, duration: null }))).toBe(false);
    }
  });
});

describe("primaryMetaParts", () => {
  it("leads with the length on a surface that has no badge for it", () => {
    expect(primaryMetaParts(file({ file_type: "video", duration: 1438 }))).toEqual([
      "23:58",
    ]);
    expect(primaryMetaParts(file({ file_type: "audio", duration: 1438 }))).toEqual([
      "23:58",
    ]);
  });

  it("is empty — not a size — for a video whose length was never probed", () => {
    // The caller draws no line at all on this. Falling back to the size
    // here is the "83 B" the whole rule exists to stop.
    expect(primaryMetaParts(file({ file_type: "video" }))).toEqual([]);
  });

  it("carries the rule's own answer for the kinds that have one", () => {
    expect(primaryMetaParts(file({ file_type: "document", file_size: 25437 }))).toEqual([
      "24.8 KB",
    ]);
    expect(
      primaryMetaParts(file({ file_type: "image", image_width: 1920, image_height: 1080 })),
    ).toEqual(["1920 × 1080"]);
    expect(primaryMetaParts(file({ file_type: "image" }))).toEqual([]);
  });

  it("never puts a length and a size on the same line", () => {
    // The two are mutually exclusive by construction — a kind with a
    // length has no first metadatum — and a line reading
    // "23:58 · 83 B" is precisely the defect that was reported.
    for (const file_type of Object.keys(EXPECTED) as FileType[]) {
      const probed =
        file_type === "image" ? { image_width: 1920, image_height: 1080 } : {};
      expect(
        primaryMetaParts(file({ file_type, duration: 1438, ...probed })).length,
      ).toBeLessThanOrEqual(1);
    }
  });
});
