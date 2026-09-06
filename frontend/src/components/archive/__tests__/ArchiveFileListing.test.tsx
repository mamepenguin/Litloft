import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArchiveFileListing } from "../ArchiveFileListing";
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

const entries: ArchiveEntry[] = [
  makeEntry("photos/"),
  makeEntry("readme.txt", { file_type: "document" }),
  makeEntry("image.jpg", { file_type: "image" }),
];

const defaultProps = {
  fileId: "file-1",
  entries,
  handleDirClick: vi.fn(),
  handleFileClick: vi.fn(),
  isClickable: () => true,
};

describe("ArchiveFileListing", () => {
  it("renders all entries", () => {
    render(<ArchiveFileListing {...defaultProps} />);
    expect(screen.getByText("photos")).toBeInTheDocument();
    expect(screen.getByText("readme.txt")).toBeInTheDocument();
    expect(screen.getByText("image.jpg")).toBeInTheDocument();
  });

  it("calls handleDirClick for directory entries", () => {
    const handleDirClick = vi.fn();
    render(<ArchiveFileListing {...defaultProps} handleDirClick={handleDirClick} />);
    fireEvent.click(screen.getByText("photos"));
    expect(handleDirClick).toHaveBeenCalledWith(entries[0]);
  });

  it("calls handleFileClick for file entries", () => {
    const handleFileClick = vi.fn();
    render(<ArchiveFileListing {...defaultProps} handleFileClick={handleFileClick} />);
    fireEvent.click(screen.getByText("readme.txt"));
    expect(handleFileClick).toHaveBeenCalledWith(entries[1]);
  });

  it("shows file sizes for non-directory entries", () => {
    render(<ArchiveFileListing {...defaultProps} />);
    const sizes = screen.getAllByText("1.0 KB");
    expect(sizes).toHaveLength(2); // readme.txt and image.jpg
  });

  // ARC-1. A row that opens says so by being pressable; writing a reason and
  // a way out on a row that already has one is the inverse of the rule that
  // keeps a column out of the listing when every cell would say the same.
  it("offers a reason and a download only where the row is a dead end", () => {
    render(<ArchiveFileListing {...defaultProps} />);
    expect(screen.queryByText("No preview")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("gives every dead-end row a reason and a download", () => {
    // `ArchivePreview`'s own predicate always admits a directory, so the fake
    // does too — a listing where even folders are dead ends is not a state
    // this component is ever handed.
    render(
      <ArchiveFileListing {...defaultProps} isClickable={(e) => e.is_dir} />
    );

    // Two, not three: a directory is always openable, so the count says the
    // treatment is per-row rather than per-listing.
    expect(screen.getAllByText("No preview").length).toBe(2);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("download"))).toEqual([
      "readme.txt",
      "image.jpg",
    ]);
    expect(links[0].textContent).toBe("Download");
    // A name per row, not per control: a 2 439-file ZIP otherwise hands a
    // screen reader that many links all called "Download". The visible word
    // stays inside the name, so WCAG 2.5.3's containment holds.
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Download readme.txt",
      "Download image.jpg",
    ]);
  });

  it("shows empty message when no entries", () => {
    render(<ArchiveFileListing {...defaultProps} entries={[]} />);
    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
  });

  it("makes a dead-end row not a control, rather than a control that is off", () => {
    render(
      <ArchiveFileListing {...defaultProps} isClickable={(e) => e.is_dir} />
    );

    // The one button left is the directory's. A `disabled` row put an
    // unreachable control in the tab order and dimmed the name that would
    // have explained it, which DESIGN.md §6 forbids for exactly that reason.
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain("photos");
    expect(document.querySelectorAll("[disabled]").length).toBe(0);
    expect(document.querySelectorAll(".opacity-60").length).toBe(0);
  });

  it("puts the touch floor on the row, so rows are evenly pitched", () => {
    // jsdom computes no layout, so what is asserted is the class that
    // decides it. Measured in Chromium with a coarse pointer: without this
    // the dead-end rows were 44px (the Download's own floor) and the
    // openable ones 40, which is the uneven pitch DESIGN.md §Row Actions
    // rules out.
    render(
      <ArchiveFileListing {...defaultProps} isClickable={(e) => e.is_dir} />
    );
    const rows = [...document.querySelectorAll("li > *")];
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.className).toContain("pointer-coarse:min-h-11");
    }
  });

  it("keeps every openable row a control", () => {
    // The assertion above is also true of a listing that rendered nothing.
    render(<ArchiveFileListing {...defaultProps} />);
    expect(screen.getAllByRole("button").length).toBe(3);
  });
});
