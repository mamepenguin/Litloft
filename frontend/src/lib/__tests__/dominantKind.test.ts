import { describe, expect, it } from "vitest";

import { deriveDominantKind } from "../dominantKind";
import type { FileItem } from "@/types";

function file(overrides: Partial<FileItem>): FileItem {
  return {
    image_width: null,
    image_height: null,
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

  it("wants a majority, not a plurality", () => {
    // "What the folder mostly holds" is what the view-mode rule and the
    // user guide both say this answers, and the difference is whether a
    // viewer's global preference is ever consulted: `viewModeForKind`
    // has an answer for every kind, so a plurality here would make the
    // global default unreachable in every non-empty folder.
    const mix = [
      file({ id: "a", file_type: "other" }),
      file({ id: "b", file_type: "other" }),
      file({ id: "c", file_type: "video", mime_type: "video/mp4" }),
      file({ id: "d", file_type: "image", mime_type: "image/png" }),
      file({ id: "e", file_type: "audio", mime_type: "audio/mpeg" }),
    ];
    // `other` is the largest at 2 of 5, and 2 is not more than half.
    expect(deriveDominantKind(mix)).toBeNull();
  });

  it("takes the kind that is more than half, and only that", () => {
    const threeOfFive = [
      file({ id: "a", file_type: "audio", mime_type: "audio/mpeg" }),
      file({ id: "b", file_type: "audio", mime_type: "audio/mpeg" }),
      file({ id: "c", file_type: "audio", mime_type: "audio/mpeg" }),
      file({ id: "d", file_type: "video", mime_type: "video/mp4" }),
      file({ id: "e", file_type: "image", mime_type: "image/png" }),
    ];
    expect(deriveDominantKind(threeOfFive)).toBe("audio");

    // Exactly half is not more than half — a folder split evenly between
    // two kinds has no answer, which is the same rule
    // `dominantCollectionKind` applies on the other surface.
    const half = [
      file({ id: "a", file_type: "audio", mime_type: "audio/mpeg" }),
      file({ id: "b", file_type: "audio", mime_type: "audio/mpeg" }),
      file({ id: "c", file_type: "video", mime_type: "video/mp4" }),
      file({ id: "d", file_type: "video", mime_type: "video/mp4" }),
    ];
    expect(deriveDominantKind(half)).toBeNull();
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
