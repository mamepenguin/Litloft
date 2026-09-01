import { describe, expect, it } from "vitest";

import { deriveDominantKind } from "../dominantKind";
import type { FileItem } from "@/types";

function file(overrides: Partial<FileItem>): FileItem {
  return {
    id: overrides.id ?? "id",
    filename: "f",
    title: "t",
    description: "",
    drive: "work",
    folder_path: "",
    file_type: overrides.file_type ?? "other",
    mime_type: overrides.mime_type ?? "application/octet-stream",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-05-01",
    updated_at: "2026-05-01",
    ...overrides,
  };
}

describe("deriveDominantKind", () => {
  it("returns null for empty input", () => {
    expect(deriveDominantKind([])).toBeNull();
  });

  it("classifies markdown via mime_type even when file_type=document", () => {
    expect(
      deriveDominantKind([
        file({ id: "a", file_type: "document", mime_type: "text/markdown" }),
        file({ id: "b", file_type: "document", mime_type: "text/markdown" }),
      ]),
    ).toBe("markdown");
  });

  it("classifies pdf via mime_type", () => {
    expect(
      deriveDominantKind([file({ mime_type: "application/pdf" })]),
    ).toBe("pdf");
  });

  it("returns video when video files dominate", () => {
    expect(
      deriveDominantKind([
        file({ id: "a", file_type: "video", mime_type: "video/mp4" }),
        file({ id: "b", file_type: "video", mime_type: "video/mp4" }),
        file({ id: "c", file_type: "image", mime_type: "image/jpeg" }),
      ]),
    ).toBe("video");
  });

  it("returns image when images dominate", () => {
    expect(
      deriveDominantKind([
        file({ id: "a", file_type: "image", mime_type: "image/jpeg" }),
        file({ id: "b", file_type: "image", mime_type: "image/jpeg" }),
      ]),
    ).toBe("image");
  });

  it("returns 'other' when nothing matches a known kind", () => {
    expect(
      deriveDominantKind([
        file({ file_type: "subtitle", mime_type: "text/vtt" }),
      ]),
    ).toBe("other");
  });
});
