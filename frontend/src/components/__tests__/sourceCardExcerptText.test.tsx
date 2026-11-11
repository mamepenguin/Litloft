import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  getPreviewTextUrl: (id: string) => `/api/files/${id}/preview-text`,
  deleteFile: vi.fn(),
  moveFile: vi.fn(),
  renameFile: vi.fn(),
}));

import { FileCard } from "../FileCard";
import { FileListRow } from "../FileListRow";
import { FileGrid } from "../FileGrid";
import type { FileItem } from "@/types";

const base: FileItem = {
  image_width: null,
  image_height: null,
  id: "target",
  filename: "hello.py",
  title: "hello",
  description: "",
  drive: "d",
  folder_path: "",
  file_type: "other",
  mime_type: "text/plain",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 100,
  duration: null,
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
};

const photo = (i: number): FileItem => ({
  ...base,
  id: `p${i}`,
  title: `Photo ${i}`,
  filename: `shot-${i}.jpg`,
  file_type: "image",
  mime_type: "image/jpeg",
  image_width: 3000,
  image_height: 4000,
});

const surfaces: Record<string, (f: FileItem) => void> = {
  FileCard: (f) => {
    render(<FileCard file={f} />);
  },
  FileListRow: (f) => {
    render(<FileListRow file={f} onContextMenu={vi.fn()} />);
  },
  JustifiedFileCell: (f) => {
    // Mostly photographs, so FileGrid lays the folder out justified.
    render(<FileGrid files={[...Array.from({ length: 19 }, (_, i) => photo(i)), f]} />);
  },
};

/** The paragraph under the file's name, which is where the fetched text lands. */
const drawnText = (): string | null => {
  const thumbnail = document.querySelector('[data-testid="text-thumbnail"]');
  return thumbnail?.querySelectorAll("p")[1]?.textContent ?? null;
};

const stubFileBody = (body: string) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => body })),
  );
};

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
      observe() {
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
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * `expected` is the body itself for a source file and the cleaned-up body for
 * a document, so the two kinds of row cannot share a derivation.
 */
type Row = [string, Partial<FileItem>, string, string];

const rows: Row[] = [
  [
    'other + text/plain: "#include <stdio.h>"',
    { file_type: "other", mime_type: "text/plain", filename: "hello.c" },
    "#include <stdio.h>\n\nint value = 0;",
    "#include <stdio.h>\n\nint value = 0;",
  ],
  [
    'other + text/plain: "i < n; i++"',
    { file_type: "other", mime_type: "text/plain", filename: "hello.cpp" },
    "int sum(const std::vector<int> &v, int n) {\n  int total = 0;\n  for (int i = 0; i < n; i++)\n    total += v[i];\n  return total;\n}",
    "int sum(const std::vector<int> &v, int n) {\n  int total = 0;\n  for (int i = 0; i < n; i++)\n    total += v[i];\n  return total;\n}",
  ],
  [
    'other + text/plain: "p->x"',
    { file_type: "other", mime_type: "text/plain", filename: "hello.c" },
    "void reset(struct point *p) {\n  /* Zero the position */\n  p->x = 0;\n  p->y = 0;\n}",
    "void reset(struct point *p) {\n  /* Zero the position */\n  p->x = 0;\n  p->y = 0;\n}",
  ],
  [
    'other + text/plain: "/* Reset */"',
    { file_type: "other", mime_type: "text/plain", filename: "hello.c" },
    "/* Reset */\nint counter = 0;",
    "/* Reset */\nint counter = 0;",
  ],
  [
    'other + text/x-python: "*args, **kw"',
    { file_type: "other", mime_type: "text/x-python", filename: "hello.py" },
    "def collect(*args, **kw):\n    return (args, kw)",
    "def collect(*args, **kw):\n    return (args, kw)",
  ],
  [
    'other + text/javascript: "fns[i](x)"',
    { file_type: "other", mime_type: "text/javascript", filename: "app.js" },
    "const y = fns[i](x);",
    "const y = fns[i](x);",
  ],
  [
    'other + text/html: "<a>b</a>"',
    { file_type: "other", mime_type: "text/html", filename: "index.html" },
    '<p><a href="/">Home</a></p>',
    '<p><a href="/">Home</a></p>',
  ],
  [
    'other + text/plain: "---" first line',
    { file_type: "other", mime_type: "text/plain", filename: "notes.txt" },
    "---\ntitle: build notes\nrun make",
    "---\ntitle: build notes\nrun make",
  ],
  [
    "document + text/markdown: markup cleanup stays",
    { file_type: "document", mime_type: "text/markdown", filename: "note.md" },
    "# Title\n\nSome **bold** text and a [link](https://example.com).",
    "Title\n\nSome bold text and a link.",
  ],
];

describe("UNSPEC fix-source-card-excerpt: what the excerpt says", () => {
  for (const [surface, draw] of Object.entries(surfaces)) {
    describe(surface, () => {
      it.each(rows)("%s", async (_name, overrides, body, expected) => {
        stubFileBody(body);
        draw({ ...base, ...overrides });

        await waitFor(() => expect(drawnText()).not.toBeNull());
        expect(drawnText()).toBe(expected);
      });
    });
  }
});
