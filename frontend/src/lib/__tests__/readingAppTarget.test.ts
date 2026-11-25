import { describe, expect, it } from "vitest";

import { READING_BASE_KINDS, resolveReadingMemberTarget, resolveReadingTarget } from "../readingAppTarget";
import type { SmartFolder } from "@/types/smartFolder";

function folder(query: string, fileType: SmartFolder["file_type"] = null): SmartFolder {
  return {
    id: "sf-1",
    drive: "main",
    name: "Smart",
    query,
    file_type: fileType,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

describe("the Reading target's kinds", () => {
  it("uses the three base kinds for the default target", () => {
    const target = resolveReadingTarget(null);

    expect(target).toEqual({ usable: true, params: { type: [...READING_BASE_KINDS] } });
  });

  it("keeps pdf and epub for a document target", () => {
    const target = resolveReadingTarget(folder("type:document"));

    expect(target).toMatchObject({ usable: true, params: { type: ["pdf", "epub"] } });
  });

  it("keeps only the base kinds an OR of target kinds holds", () => {
    const target = resolveReadingTarget(folder("type:archive type:pdf type:video"));

    expect(target).toMatchObject({ usable: true, params: { type: ["pdf", "archive"] } });
  });

  it("keeps the base kinds when the target names none", () => {
    const target = resolveReadingTarget(folder("tag:books", "document"));

    expect(target).toMatchObject({ usable: true, params: { type: ["pdf", "epub"] } });
  });

  it("carries the supported conditions and never a duration", () => {
    const target = resolveReadingTarget(
      folder("shelf tag:read path:Books size:>10MB is:favorite"),
    );

    expect(target).toMatchObject({
      usable: true,
      params: {
        search: "shelf",
        tag: ["read"],
        folder: ["Books"],
        size: ["gt:10485760"],
        favorite: true,
        type: [...READING_BASE_KINDS],
      },
    });
    const params = target.usable && "params" in target ? target.params : null;
    expect(params).not.toBeNull();
    expect(params).not.toHaveProperty("duration");
  });

  it.each(["video", "text", "image", "audio", "other"])(
    "has no books for the %s kind",
    (kind) => {
      expect(resolveReadingTarget(folder(`type:${kind}`))).toEqual({
        usable: true,
        empty: true,
        params: null,
      });
    },
  );

  it("has no books when the folder's own kind contradicts its query", () => {
    expect(resolveReadingTarget(folder("type:pdf", "video"))).toEqual({
      usable: true,
      empty: true,
      params: null,
    });
  });
});

describe("a smart folder the app cannot use", () => {
  it("refuses a duration comparison", () => {
    expect(resolveReadingTarget(folder("duration:>10m"))).toEqual({
      usable: false,
      reason: "unsupported_part",
    });
  });

  it("SPEC-CORE-177 carries a parsed negation as the listing key", () => {
    expect(resolveReadingTarget(folder("-tag:read"))).toMatchObject({
      usable: true,
      params: { exclude_tag: ["read"], type: [...READING_BASE_KINDS] },
    });
  });

  it("SPEC-CORE-177 reads a spelling the parser does not negate as search text, so it is a member target", () => {
    expect(resolveReadingTarget(folder("!type:pdf"))).toMatchObject({
      usable: true,
      params: { search: "!type:pdf" },
    });
    expect(resolveReadingMemberTarget(folder("!type:pdf"))).not.toBeNull();
  });

  it("keeps a free-text word that only looks like a negation", () => {
    expect(resolveReadingTarget(folder("not-a-tag:here"))).toMatchObject({ usable: true });
  });
});
