import { describe, expect, it } from "vitest";

import type { FileItemWithMatch } from "@/types";
import { buildSearchSnippet } from "../searchCapture";

function file(overrides: Partial<FileItemWithMatch> = {}): FileItemWithMatch {
  return {
    id: "file123",
    filename: "lecture.mp4",
    title: "Lecture",
    description: "",
    drive: "family",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 10,
    duration: 100,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildSearchSnippet", () => {
  it("quotes the highest-scoring transcript excerpt with its time range", () => {
    const snippet = buildSearchSnippet(file({
      match_meta: {
        transcript: [
          { time_range: [40, 45], score: 0.4, text: "weaker" },
          { time_range: [12.5, 18], score: 0.9, text: "spoken source" },
        ],
      },
    }));

    expect(snippet).toEqual({
      excerpt: "spoken source",
      capture: expect.objectContaining({
        drive: "family",
        sourceFileId: "file123",
        kind: "transcript",
        quote: "spoken source",
        locator: { seconds: 12.5, endSeconds: 18 },
      }),
    });
  });

  it("keeps PDF text paired with its page", () => {
    const snippet = buildSearchSnippet(file({
      filename: "paper.pdf",
      file_type: "document",
      mime_type: "application/pdf",
      match_meta: {
        content: { score: 0.9 },
        content_matches: [{ score: 0.9, page: 6, text: "original paragraph" }],
      },
    }));

    expect(snippet?.capture).toEqual(expect.objectContaining({
      kind: "document_selection",
      quote: "original paragraph",
      locator: { page: 6 },
    }));
  });

  it("drops a PDF hit whose page is unknown", () => {
    const snippet = buildSearchSnippet(file({
      filename: "paper.pdf",
      file_type: "document",
      mime_type: "application/pdf",
      match_meta: {
        content_matches: [{ score: 0.9, text: "unlocatable paragraph" }],
      },
    }));

    expect(snippet).toBeNull();
  });

  it("quotes Markdown and plain text body hits without a synthetic locator", () => {
    for (const [filename, mimeType] of [
      ["notes.md", "text/markdown"],
      ["notes.txt", "text/plain"],
    ] as const) {
      const snippet = buildSearchSnippet(file({
        filename,
        file_type: "document",
        mime_type: mimeType,
        match_meta: {
          content_matches: [{ score: 0.7, text: "verbatim body" }],
        },
      }));

      expect(snippet?.capture).toEqual(expect.objectContaining({
        kind: "document_selection",
        quote: "verbatim body",
      }));
      expect(snippet?.capture.locator).toBeUndefined();
    }
  });

  it("ignores evidence that carries no text of its own", () => {
    // A CLIP scene hit has no words to quote, and the timestamp pills
    // already offer a way into that moment.
    expect(buildSearchSnippet(file({
      match_meta: {
        metadata: { score: 1 },
        clip_thumbnail: { score: 1 },
        clip: [{ time_range: [42, 47], score: 0.8 }],
        transcript: [{ time_range: [10, 15], score: 0.9, text: "   " }],
      },
    }))).toBeNull();
  });

  it("returns null when the hit has no match metadata", () => {
    expect(buildSearchSnippet(file())).toBeNull();
  });

  it("collapses whitespace and truncates the display excerpt only", () => {
    const body = `paragraph one\n\n${"long ".repeat(60)}tail`;
    const snippet = buildSearchSnippet(file({
      filename: "notes.md",
      file_type: "document",
      mime_type: "text/markdown",
      match_meta: { content_matches: [{ score: 0.7, text: body }] },
    }));

    expect(snippet!.excerpt).not.toContain("\n");
    expect(snippet!.excerpt.length).toBeLessThanOrEqual(161);
    expect(snippet!.excerpt.endsWith("…")).toBe(true);
    // The basket still receives the untruncated source text.
    expect(snippet!.capture.quote).toBe(body);
  });
});
