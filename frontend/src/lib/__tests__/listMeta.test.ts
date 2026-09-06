import { describe, it, expect } from "vitest";

import { deriveListMeta } from "../listMeta";
import type { FileItem } from "@/types";

function file(overrides: Partial<FileItem>): FileItem {
  return {
    id: "f1",
    drive: "media",
    filename: "clip.mp4",
    title: "clip",
    file_type: "video",
    mime_type: "video/mp4",
    folder_path: "",
    description: "",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1024,
    duration: 60,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  } as FileItem;
}

/** `n` files that differ only in id, so a column's distinct count is 1. */
function repeat(n: number, overrides: Partial<FileItem>): FileItem[] {
  return Array.from({ length: n }, (_, i) =>
    file({ id: `f${i}`, ...overrides }),
  );
}

describe("deriveListMeta", () => {
  it("drops the type label when every row says the same thing", () => {
    const meta = deriveListMeta(repeat(30, { file_type: "video" }));
    expect(meta.showTypeLabel).toBe(false);
  });

  it("keeps the type label the moment the list is mixed", () => {
    const meta = deriveListMeta([
      ...repeat(29, { file_type: "video" }),
      file({ id: "odd", file_type: "document", filename: "notes.md" }),
    ]);
    expect(meta.showTypeLabel).toBe(true);
  });

  it("drops the extension badge when one extension covers every badged row", () => {
    const meta = deriveListMeta(
      repeat(20, { file_type: "image", filename: "shot.jpg", mime_type: "image/jpeg" }),
    );
    expect(meta.showExtensionBadge).toBe(false);
  });

  it("keeps the extension badge when the badged rows differ", () => {
    const meta = deriveListMeta([
      ...repeat(10, { file_type: "image", filename: "shot.jpg" }),
      file({ id: "png", file_type: "image", filename: "shot.png" }),
    ]);
    expect(meta.showExtensionBadge).toBe(true);
  });

  it("compares extensions the way the badge renders them, in one case", () => {
    // The badge is `uppercase`, so `.JPG` and `.jpg` draw identically —
    // treating them as two values would keep a column that reads as one.
    const meta = deriveListMeta([
      ...repeat(5, { file_type: "image", filename: "a.jpg" }),
      file({ id: "shout", file_type: "image", filename: "B.JPG" }),
    ]);
    expect(meta.showExtensionBadge).toBe(false);
  });

  it("ignores rows that never draw a badge when judging the extensions", () => {
    // Video and audio rows carry a duration instead, so their container
    // format is not in the column being judged.
    const meta = deriveListMeta([
      ...repeat(10, { file_type: "video", filename: "clip.mp4" }),
      ...repeat(10, { file_type: "audio", filename: "song.m4a" }),
      ...repeat(10, { file_type: "image", filename: "shot.jpg" }),
    ]);
    expect(meta.showExtensionBadge).toBe(false);
    // The type column really is mixed, though.
    expect(meta.showTypeLabel).toBe(true);
  });

  it("keeps a lone badge, because one row cannot be repetitive", () => {
    // Only one row would carry a badge; its presence is what
    // distinguishes that row, and hiding it removes information rather
    // than noise.
    const meta = deriveListMeta([
      ...repeat(10, { file_type: "video", filename: "clip.mp4" }),
      file({ id: "doc", file_type: "document", filename: "notes.md" }),
    ]);
    expect(meta.showExtensionBadge).toBe(true);
  });

  it("leaves a one-item list exactly as it was", () => {
    const meta = deriveListMeta([file({ file_type: "image", filename: "shot.jpg" })]);
    expect(meta).toEqual({
      showTypeLabel: true,
      showExtensionBadge: true,
      justifyThumbnails: false,
    });
  });

  it("leaves an empty list exactly as it was", () => {
    expect(deriveListMeta([])).toEqual({
      showTypeLabel: true,
      showExtensionBadge: true,
      justifyThumbnails: false,
    });
  });

  it("treats an extensionless name as no badge at all", () => {
    const meta = deriveListMeta([
      ...repeat(10, { file_type: "document", filename: "README" }),
      file({ id: "md", file_type: "document", filename: "notes.md" }),
    ]);
    // One badged row among eleven: keep it.
    expect(meta.showExtensionBadge).toBe(true);
    expect(meta.showTypeLabel).toBe(false);
  });

  it("returns primitives, so a memoized row is not re-rendered by it", () => {
    const meta = deriveListMeta(repeat(3, {}));
    for (const value of Object.values(meta)) {
      expect(typeof value).toBe("boolean");
    }
  });
});

describe("deriveListMeta — justifyThumbnails", () => {
  /** `n` images that carry real dimensions. */
  function photos(n: number, w = 3000, h = 4000): FileItem[] {
    return Array.from({ length: n }, (_, i) =>
      file({
        id: `p${i}`,
        file_type: "image",
        filename: `DSC_${i}.jpg`,
        mime_type: "image/jpeg",
        image_width: w,
        image_height: h,
      }),
    );
  }

  it("packs a folder of measured photographs", () => {
    expect(deriveListMeta(photos(20)).justifyThumbnails).toBe(true);
  });

  it("does not pack a folder of videos", () => {
    const meta = deriveListMeta(repeat(20, { file_type: "video" }));
    expect(meta.justifyThumbnails).toBe(false);
  });

  it("packs at the 90% threshold and not below it", () => {
    const at = deriveListMeta([
      ...photos(18),
      ...repeat(2, { file_type: "video" }),
    ]);
    const below = deriveListMeta([
      ...photos(17),
      ...repeat(3, { file_type: "video" }),
    ]);
    expect(at.justifyThumbnails).toBe(true);
    expect(below.justifyThumbnails).toBe(false);
  });

  it("does not pack images whose dimensions were never stored", () => {
    const meta = deriveListMeta(
      repeat(20, {
        file_type: "image",
        filename: "shot.jpg",
        mime_type: "image/jpeg",
        image_width: null,
        image_height: null,
      }),
    );
    expect(meta.justifyThumbnails).toBe(false);
  });

  it("does not pack a single photograph", () => {
    expect(deriveListMeta(photos(1)).justifyThumbnails).toBe(false);
  });
});
