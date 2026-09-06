/**
 * The distinct rule as the listings actually render it.
 *
 * `deriveListMeta` is unit-tested next to itself; what this file checks
 * is that `FileGrid` and `FileList` ask it and obey the answer, in both
 * directions — the failure that matters is a rule that is correct and
 * unwired, which looks identical to no rule at all.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

// A text-previewable row mounts `TextThumbnail`, which observes itself
// into view. jsdom has no such observer; the preview fetch is not what
// is under test here.
beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

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
  deleteFile: vi.fn(),
  moveFile: vi.fn(),
  renameFile: vi.fn(),
}));

import { FileGrid } from "../FileGrid";
import { FileList } from "../FileList";
import type { FileItem } from "@/types";

const makeFile = (overrides: Partial<FileItem> = {}): FileItem => ({
  image_width: null,
  image_height: null,
  id: "file1",
  filename: "test.mp4",
  title: "Test Video",
  description: "",
  drive: "media",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1024000,
  duration: 120,
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

const photos = (n: number, ext = "jpg") =>
  Array.from({ length: n }, (_, i) =>
    makeFile({
      id: `p${i}`,
      title: `Photo ${i}`,
      filename: `shot-${i}.${ext}`,
      file_type: "image",
      mime_type: "image/jpeg",
      duration: null,
    }),
  );

const badges = () => screen.queryAllByText(/^(jpg|png|md)$/i);

describe("FileGrid — repeated columns", () => {
  it("stops badging the extension when the whole grid shares one", () => {
    render(<FileGrid files={photos(6)} />);
    expect(badges()).toHaveLength(0);
  });

  it("badges every eligible card once the extensions differ", () => {
    render(<FileGrid files={[...photos(5), ...photos(1, "png")]} />);
    // Both values are drawn — the column is doing work again.
    expect(badges().length).toBeGreaterThan(1);
    expect(screen.getAllByText(/^png$/i)).toHaveLength(1);
  });

  it("leaves a single card alone", () => {
    render(<FileGrid files={photos(1)} />);
    expect(badges()).toHaveLength(1);
  });
});

describe("FileList — repeated columns", () => {
  const typeLabels = () => screen.queryAllByText(/^(Video|Image|Document)$/);

  it("stops labelling the type when every row is the same kind", () => {
    render(<FileList files={photos(6)} />);
    expect(typeLabels()).toHaveLength(0);
    expect(badges()).toHaveLength(0);
  });

  it("labels the type once the listing is mixed", () => {
    render(
      <FileList
        files={[
          ...photos(5),
          makeFile({ id: "v", filename: "clip.mp4", file_type: "video" }),
        ]}
      />,
    );
    expect(typeLabels()).toHaveLength(6);
  });

  it("leaves a single row alone", () => {
    render(<FileList files={photos(1)} />);
    expect(typeLabels()).toHaveLength(1);
    expect(badges()).toHaveLength(1);
  });

  it("keeps the badge on the one row that carries it", () => {
    // Videos never take a badge, so the lone document's badge is the
    // only value in that column and is what marks the row out.
    render(
      <FileList
        files={[
          ...Array.from({ length: 5 }, (_, i) =>
            makeFile({ id: `v${i}`, filename: `clip-${i}.mp4` }),
          ),
          makeFile({
            id: "d",
            filename: "notes.md",
            file_type: "document",
            mime_type: "text/markdown",
            duration: null,
          }),
        ]}
      />,
    );
    expect(screen.getAllByText(/^md$/i)).toHaveLength(1);
  });
});
