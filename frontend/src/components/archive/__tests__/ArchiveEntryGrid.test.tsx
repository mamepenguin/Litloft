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
});
