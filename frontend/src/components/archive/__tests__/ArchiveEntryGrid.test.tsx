import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ArchiveEntryGrid } from "../ArchiveEntryGrid";
import type { ArchiveEntry } from "@/types";

vi.mock("@/lib/api", () => ({
  getArchiveEntryUrl: (fileId: string, path: string) =>
    `/api/files/${fileId}/archive/entry?path=${encodeURIComponent(path)}`,
}));

vi.mock("../../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

class MockIntersectionObserver {
  constructor(_cb: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}

function makeEntry(
  path: string,
  overrides: Partial<ArchiveEntry> = {}
): ArchiveEntry {
  const is_dir = path.endsWith("/");
  const filename = is_dir
    ? path.slice(0, -1).split("/").pop()!
    : path.split("/").pop()!;
  return {
    path,
    filename,
    file_size: 1024,
    compressed_size: 512,
    file_type: "other",
    mime_type: "",
    is_dir,
    ...overrides,
  };
}

describe("ArchiveEntryGrid", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      MockIntersectionObserver as unknown as typeof IntersectionObserver
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty-folder message when there are no entries", () => {
    render(
      <ArchiveEntryGrid
        entries={[]}
        fileId="file-1"
        handleDirClick={vi.fn()}
        handleFileClick={vi.fn()}
        isClickable={() => true}
      />
    );

    // Global next-intl mock resolves "archive.emptyFolder" to the en.json
    // entry; if not present it falls back to the namespace.key literal.
    // Match either form.
    const empty =
      screen.queryByText(/empty folder/i) ??
      screen.queryByText("archive.emptyFolder") ??
      screen.queryByText(/This folder is empty/i);
    expect(empty).not.toBeNull();
  });

  it("renders one card per entry", () => {
    const entries = [
      makeEntry("photos/"),
      makeEntry("a.jpg", { file_type: "image" }),
      makeEntry("b.txt", { file_type: "document" }),
    ];

    render(
      <ArchiveEntryGrid
        entries={entries}
        fileId="file-1"
        handleDirClick={vi.fn()}
        handleFileClick={vi.fn()}
        isClickable={() => true}
      />
    );

    expect(screen.getByText("photos")).toBeInTheDocument();
    expect(screen.getByText("a.jpg")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
    // Each entry becomes a clickable card button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(entries.length);
  });

  it("calls handleDirClick when a directory card is clicked", () => {
    const handleDirClick = vi.fn();
    const handleFileClick = vi.fn();
    const dir = makeEntry("photos/");
    const entries = [dir];

    render(
      <ArchiveEntryGrid
        entries={entries}
        fileId="file-1"
        handleDirClick={handleDirClick}
        handleFileClick={handleFileClick}
        isClickable={() => true}
      />
    );

    fireEvent.click(screen.getByText("photos"));

    expect(handleDirClick).toHaveBeenCalledTimes(1);
    expect(handleDirClick).toHaveBeenCalledWith(dir);
    expect(handleFileClick).not.toHaveBeenCalled();
  });

  it("calls handleFileClick when a file card is clicked", () => {
    const handleDirClick = vi.fn();
    const handleFileClick = vi.fn();
    const file = makeEntry("a.jpg", { file_type: "image" });
    const entries = [file];

    render(
      <ArchiveEntryGrid
        entries={entries}
        fileId="file-1"
        handleDirClick={handleDirClick}
        handleFileClick={handleFileClick}
        isClickable={() => true}
      />
    );

    fireEvent.click(screen.getByText("a.jpg"));

    expect(handleFileClick).toHaveBeenCalledTimes(1);
    expect(handleFileClick).toHaveBeenCalledWith(file);
    expect(handleDirClick).not.toHaveBeenCalled();
  });

  describe("page names", () => {
    // A 190-page comic reads `p01_001.jpg` … `p01_190.jpg` under 190
    // identical thumbnails. The names are the same word repeated; the
    // pictures are the thing being chosen between. The grid has every
    // entry of the level in hand, so unlike the paged file listing this
    // count is the true one.
    const pages = (n: number, ext = "jpg") =>
      Array.from({ length: n }, (_, i) =>
        makeEntry(`p01_${String(i).padStart(3, "0")}.${ext}`, {
          file_type: "image",
          mime_type: "image/jpeg",
        }),
      );

    it("drops the filename when the level is all images", () => {
      render(
        <ArchiveEntryGrid
          entries={pages(6)}
          fileId="a1"
          handleDirClick={vi.fn()}
          handleFileClick={vi.fn()}
          isClickable={() => true}
        />,
      );
      expect(screen.queryByText("p01_000.jpg")).toBeNull();
      expect(screen.queryByText("p01_005.jpg")).toBeNull();
    });

    it("keeps the filename once the level is mixed", () => {
      render(
        <ArchiveEntryGrid
          entries={[
            ...pages(5),
            makeEntry("credits.txt", { file_type: "document", mime_type: "text/plain" }),
          ]}
          fileId="a1"
          handleDirClick={vi.fn()}
          handleFileClick={vi.fn()}
          isClickable={() => true}
        />,
      );
      expect(screen.getByText("p01_000.jpg")).toBeInTheDocument();
      expect(screen.getByText("credits.txt")).toBeInTheDocument();
    });

    it("keeps folder names, which are the only handle a folder has", () => {
      render(
        <ArchiveEntryGrid
          entries={[...pages(5), makeEntry("chapter-2/")]}
          fileId="a1"
          handleDirClick={vi.fn()}
          handleFileClick={vi.fn()}
          isClickable={() => true}
        />,
      );
      expect(screen.getByText("chapter-2")).toBeInTheDocument();
    });

    it("does not let a folder make the images look mixed", () => {
      // A level of pages plus a "next chapter" folder is still a level
      // of pages as far as the page names go.
      render(
        <ArchiveEntryGrid
          entries={[...pages(5), makeEntry("chapter-2/")]}
          fileId="a1"
          handleDirClick={vi.fn()}
          handleFileClick={vi.fn()}
          isClickable={() => true}
        />,
      );
      expect(screen.queryByText("p01_000.jpg")).toBeNull();
    });

    it("keeps a single image's name", () => {
      render(
        <ArchiveEntryGrid
          entries={pages(1)}
          fileId="a1"
          handleDirClick={vi.fn()}
          handleFileClick={vi.fn()}
          isClickable={() => true}
        />,
      );
      expect(screen.getByText("p01_000.jpg")).toBeInTheDocument();
    });
  });
});
