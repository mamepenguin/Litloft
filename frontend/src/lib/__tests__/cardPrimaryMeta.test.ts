import { describe, it, expect } from "vitest";

import { cardPrimaryMeta, formatDimensions } from "@/lib/cardPrimaryMeta";
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

describe("cardPrimaryMeta", () => {
  it.each(Object.entries(EXPECTED) as [FileType, string][])(
    "leads a %s card with its %s",
    (file_type, expected) => {
      const probed =
        file_type === "image" ? { image_width: 1920, image_height: 1080 } : {};
      expect(cardPrimaryMeta(file({ file_type, ...probed })).kind).toBe(expected);
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
    expect(cardPrimaryMeta(file({ file_type: "image" })).kind).toBe("none");
    expect(
      cardPrimaryMeta(file({ file_type: "image", image_width: 1920 })).kind,
    ).toBe("none");
    expect(
      cardPrimaryMeta(file({ file_type: "image", image_height: 1080 })).kind,
    ).toBe("none");
  });

  it("carries the dimensions through when they are known", () => {
    expect(
      cardPrimaryMeta(
        file({ file_type: "image", image_width: 1920, image_height: 1080 }),
      ),
    ).toEqual({ kind: "dimensions", width: 1920, height: 1080 });
  });

  it("says nothing for a video whose length was never probed either", () => {
    // Neither the badge nor this: the card is left with its date. The
    // size is the number that would be wrong — a `.loft` reference file
    // reports the pointer's size, which is how D-3 got "19 minutes,
    // 83 B".
    expect(cardPrimaryMeta(file({ file_type: "video", duration: null })).kind).toBe(
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
