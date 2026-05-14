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

  it("shows download links for files", () => {
    render(<ArchiveFileListing {...defaultProps} />);
    expect(screen.getByLabelText("Download readme.txt")).toBeInTheDocument();
    expect(screen.getByLabelText("Download image.jpg")).toBeInTheDocument();
  });

  it("shows empty message when no entries", () => {
    render(<ArchiveFileListing {...defaultProps} entries={[]} />);
    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
  });

  it("disables non-clickable entries", () => {
    render(
      <ArchiveFileListing {...defaultProps} isClickable={() => false} />
    );
    const buttons = screen.getAllByRole("button");
    const entryButtons = buttons.filter((b) => b.hasAttribute("disabled"));
    expect(entryButtons.length).toBeGreaterThan(0);
  });

  it("renders children", () => {
    render(
      <ArchiveFileListing {...defaultProps}>
        <div data-testid="child">Extra content</div>
      </ArchiveFileListing>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
