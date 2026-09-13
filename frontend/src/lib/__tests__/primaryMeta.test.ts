import { describe, it, expect } from "vitest";

import {
  primaryMeta,
  primaryMetaText,
  primaryMetaLine,
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
    // A fallback would have two image cards side by side describe
    // themselves differently for a reason invisible to the reader.
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
    // Not the size: a `.loft` reference file reports the pointer's size.
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
    expect(primaryMetaText(file({ file_type: "image", file_size: 2295580 }))).toBeNull();
  });

  it("agrees with the rule it renders, for every file type", () => {
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
    const EXPECTED_TRUE: FileType[] = ["video", "audio"];
    for (const file_type of Object.keys(EXPECTED) as FileType[]) {
      expect(hasKnownLength(file({ file_type, duration: 1438 }))).toBe(
        EXPECTED_TRUE.includes(file_type),
      );
      expect(hasKnownLength(file({ file_type, duration: null }))).toBe(false);
    }
  });
});

const EXPECTED_LINE: {
  [K in FileType]: { probed: string | null; unprobed: string | null };
} = {
  video: { probed: "23:58", unprobed: null },
  audio: { probed: "23:58", unprobed: null },
  image: { probed: "1920 × 1080", unprobed: null },
  document: { probed: "83 B", unprobed: "83 B" },
  archive: { probed: "83 B", unprobed: "83 B" },
  subtitle: { probed: "83 B", unprobed: "83 B" },
  other: { probed: "83 B", unprobed: "83 B" },
};

describe("primaryMetaLine", () => {
  it.each(Object.entries(EXPECTED_LINE) as [FileType, { probed: string | null; unprobed: string | null }][])(
    "gives a %s exactly one answer, or none",
    (file_type, expected) => {
      expect(
        primaryMetaLine(
          file({
            file_type,
            duration: 1438,
            image_width: 1920,
            image_height: 1080,
          }),
        ),
      ).toBe(expected.probed);
      expect(primaryMetaLine(file({ file_type }))).toBe(expected.unprobed);
    },
  );

  it("covers every file type there is", () => {
    expect(Object.keys(EXPECTED_LINE)).toHaveLength(7);
  });

  it("returns a value, so no caller can carry a separator it never reaches", () => {
    // `hasKnownLength` is true only for the kinds `primaryMeta` answers
    // `none` for, so the two are mutually exclusive.
    for (const file_type of Object.keys(EXPECTED) as FileType[]) {
      const line = primaryMetaLine(
        file({ file_type, duration: 1438, image_width: 1920, image_height: 1080 }),
      );
      expect(line === null || !line.includes(" · ")).toBe(true);
    }
  });
});
