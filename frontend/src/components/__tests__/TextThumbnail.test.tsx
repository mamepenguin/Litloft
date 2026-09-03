/**
 * The text thumbnail shows the shape of a document, not its words — it
 * is drawn at 6px and is not meant to be read. That only works if the
 * first few lines are the document's own; a web clip whose frontmatter
 * outgrew the fetch window showed `id:` / `url:` / `origin:` instead,
 * identically on every note, and a clipped article's first line is an
 * image URL that is nobody's idea of a document's shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { TextThumbnail, stripPreviewText } from "../TextThumbnail";
import type { FileItem } from "@/types";

const note = (overrides: Partial<FileItem> = {}): FileItem =>
  ({
    id: "n1",
    drive: "notes",
    filename: "clip.md",
    title: "A clipped article",
    file_type: "document",
    mime_type: "text/markdown",
    folder_path: "",
    description: "",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 4096,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  }) as FileItem;

/** A web clip's frontmatter, sized by the URL it recorded. */
function frontmatter(urlLength: number): string {
  const url = `https://example.com/${"a".repeat(Math.max(0, urlLength - 20))}`;
  return [
    "---",
    "id: aB3dEf9hJ2kL",
    `url: ${url}`,
    "origin: webclip",
    "created: 2026-09-01T00:00:00Z",
    "---",
    "",
  ].join("\n");
}

describe("stripPreviewText", () => {
  it("removes frontmatter that fits the window", () => {
    const out = stripPreviewText(`${frontmatter(33)}The body starts here.`);
    expect(out).toBe("The body starts here.");
  });

  it("shows nothing rather than metadata when the window is all frontmatter", () => {
    // The delimiter is past the end of what was fetched. Rendering the
    // fragment would put `id:` and `url:` on the card; rendering the
    // title alone is at least true.
    const window = frontmatter(2000).slice(0, 1024);
    expect(stripPreviewText(window)).toBe("");
  });

  it("keeps a note that merely opens on a horizontal rule", () => {
    // `---` at the top of a note is a rule, not frontmatter, unless a
    // `key: value` line follows it. Blanking those too would trade one
    // silent failure for another.
    const out = stripPreviewText("---\nA paragraph after a rule.");
    expect(out).toContain("A paragraph after a rule.");
  });

  it("drops a line that is only an image", () => {
    const out = stripPreviewText(
      "![](https://img.example.com/yangnyeom-chicken.jpg)\nReal first sentence.",
    );
    expect(out).toBe("Real first sentence.");
  });

  it("drops an image line that carries alt text", () => {
    const out = stripPreviewText(
      "![A chicken](https://img.example.com/a.jpg)\nReal first sentence.",
    );
    expect(out).toBe("Real first sentence.");
  });

  it("drops a line that is only a bare URL", () => {
    const out = stripPreviewText(
      "https://example.com/source-article\nReal first sentence.",
    );
    expect(out).toBe("Real first sentence.");
  });

  it("keeps the words of a link, because they are part of the prose", () => {
    const out = stripPreviewText("See [the recipe](https://example.com/r) for more.");
    expect(out).toBe("See the recipe for more.");
  });

  it("leaves a plain note untouched", () => {
    expect(stripPreviewText("# Heading\n\nA paragraph.")).toBe(
      "Heading\n\nA paragraph.",
    );
  });

  it("keeps a URL that is part of a sentence", () => {
    const out = stripPreviewText("Source: https://example.com/x is the origin.");
    expect(out).toBe("Source: https://example.com/x is the origin.");
  });
});

describe("TextThumbnail", () => {
  let observed: Element[];

  beforeEach(() => {
    observed = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
        observe(el: Element) {
          observed.push(el);
          this.cb([{ isIntersecting: true }]);
        }
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
        root = null;
        rootMargin = "";
        thresholds = [];
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks for a window wide enough to hold a web clip's frontmatter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TextThumbnail file={note()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const range = (init.headers as Record<string, string>).Range;
    const end = Number(/bytes=0-(\d+)/.exec(range)![1]);
    // 400 was the old window, and a 327-character URL overran it.
    expect(end).toBeGreaterThanOrEqual(1023);
  });

  it("draws the body, not the frontmatter, for a long-URL clip", async () => {
    const body = `${frontmatter(327)}The chicken is marinated overnight.`;
    // The backend honours Range, so the component only ever sees the
    // slice it asked for — a mock that returns the whole file cannot
    // reproduce the bug this test is about.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
        const end = Number(/bytes=0-(\d+)/.exec(init.headers.Range)![1]);
        return { ok: true, text: async () => body.slice(0, end + 1) };
      }),
    );

    render(<TextThumbnail file={note()} />);

    expect(
      await screen.findByText(/The chicken is marinated overnight/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/aB3dEf9hJ2kL/)).toBeNull();
    expect(screen.queryByText(/origin: webclip/)).toBeNull();
  });
});
