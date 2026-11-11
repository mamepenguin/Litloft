import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

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

afterEach(cleanup);

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

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

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

const excerpts = () => document.querySelectorAll('[data-testid="text-thumbnail"]').length;

type Row = [string, Partial<FileItem>, boolean];

const rows: Row[] = [
  ["other + text/plain (.c)", { file_type: "other", mime_type: "text/plain", filename: "a.c" }, true],
  ["other + text/plain (.bat)", { file_type: "other", mime_type: "text/plain", filename: "a.bat" }, true],
  ["other + text/x-python", { file_type: "other", mime_type: "text/x-python" }, true],
  ["other + text/css", { file_type: "other", mime_type: "text/css", filename: "a.css" }, true],
  ["other + text/javascript", { file_type: "other", mime_type: "text/javascript", filename: "a.js" }, true],
  ["document + text/plain", { file_type: "document", mime_type: "text/plain" }, true],
  ["document + docx", { file_type: "document", mime_type: DOCX, filename: "a.docx" }, true],
  ["document + xlsx", { file_type: "document", mime_type: XLSX, filename: "a.xlsx" }, true],
  ["document + pptx", { file_type: "document", mime_type: PPTX, filename: "a.pptx" }, true],
  ["document + legacy .xls", { file_type: "document", mime_type: "application/vnd.ms-excel", filename: "a.xls" }, false],
  ["document + pdf", { file_type: "document", mime_type: "application/pdf", filename: "a.pdf" }, false],
  ["other + application/json", { file_type: "other", mime_type: "application/json", filename: "a.json" }, false],
  ["other + octet-stream", { file_type: "other", mime_type: "application/octet-stream", filename: "a.bin" }, false],
  ["other + docx", { file_type: "other", mime_type: DOCX, filename: "a.docx" }, false],
  ["subtitle + text/vtt", { file_type: "subtitle", mime_type: "text/vtt", filename: "a.vtt" }, false],
  ["audio + text/plain", { file_type: "audio", mime_type: "text/plain", filename: "a.txt" }, false],
  ["archive + text/plain", { file_type: "archive", mime_type: "text/plain", filename: "a.txt" }, false],
  ["audio + audio/mpeg", { file_type: "audio", mime_type: "audio/mpeg", filename: "a.mp3" }, false],
  ["archive + zip", { file_type: "archive", mime_type: "application/zip", filename: "a.zip" }, false],
  ["other + missing mime", { file_type: "other", mime_type: null as unknown as string }, false],
  ["other + text/plain + has_thumbnail", { file_type: "other", mime_type: "text/plain", has_thumbnail: true }, false],
  ["document + text/plain + has_thumbnail", { file_type: "document", mime_type: "text/plain", has_thumbnail: true }, false],
  ["video + text/plain", { file_type: "video", mime_type: "text/plain", filename: "a.mp4" }, false],
  ["image + text/plain", { file_type: "image", mime_type: "text/plain", filename: "a.png" }, false],
  ["other + text/plain, filename hides extension", { file_type: "other", mime_type: "text/plain", filename: "Makefile" }, true],
  ["other + text/plain, filename looks like a pdf", { file_type: "other", mime_type: "text/plain", filename: "x.pdf" }, true],
  ["other + octet-stream, filename looks like python", { file_type: "other", mime_type: "application/octet-stream", filename: "hello.py" }, false],
];

describe("UNSPEC fix-source-card-excerpt", () => {
  for (const [surface, draw] of Object.entries(surfaces)) {
    describe(surface, () => {
      it.each(rows)("%s -> excerpt %s", (_name, overrides, expected) => {
        draw({ ...base, ...overrides });
        expect(excerpts()).toBe(expected ? 1 : 0);
      });
    });
  }
});
