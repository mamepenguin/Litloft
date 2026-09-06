import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArchiveTextViewer } from "../ArchiveTextViewer";
import type { ArchiveEntry } from "@/types";

const textEntry: ArchiveEntry = {
  path: "readme.txt",
  filename: "readme.txt",
  file_size: 2048,
  compressed_size: 1024,
  file_type: "document",
  mime_type: "text/plain",
  is_dir: false,
};

const defaultProps = {
  viewingEntry: textEntry,
  fileId: "zip-1",
  textConfirmed: false,
  textLoading: false,
  textError: null,
  textContent: null,
  setTextConfirmed: vi.fn(),
  closeViewer: vi.fn(),
};

describe("ArchiveTextViewer", () => {
  it("shows confirmation prompt when not confirmed", () => {
    render(<ArchiveTextViewer {...defaultProps} />);
    expect(screen.getByText("Load")).toBeInTheDocument();
    expect(screen.getByText(/File is large/)).toBeInTheDocument();
    expect(screen.getByText(/2.0 KB/)).toBeInTheDocument();
  });

  it("calls setTextConfirmed on confirm button click", () => {
    const setTextConfirmed = vi.fn();
    render(<ArchiveTextViewer {...defaultProps} setTextConfirmed={setTextConfirmed} />);
    fireEvent.click(screen.getByText("Load"));
    expect(setTextConfirmed).toHaveBeenCalledWith(true);
  });

  it("shows loading state when textLoading is true", () => {
    render(<ArchiveTextViewer {...defaultProps} textConfirmed={true} textLoading={true} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows error message when textError is set", () => {
    render(
      <ArchiveTextViewer {...defaultProps} textConfirmed={true} textError="500 Server Error" />
    );
    expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    expect(screen.getByText(/500 Server Error/)).toBeInTheDocument();
  });

  it("offers the file itself when it could not be read", () => {
    // The two assertions above are satisfied by the empty state's
    // description alone, so deleting the action left them green. The point of
    // the empty state here is that the entry turned out not to be openable
    // and the download is the way out of that.
    render(
      <ArchiveTextViewer {...defaultProps} textConfirmed={true} textError="500 Server Error" />
    );
    const action = screen.getByRole("link", { name: "Download" });
    expect(action.hasAttribute("download")).toBe(true);
    expect(action.getAttribute("href")).toContain("readme.txt");
  });

  it("offers the file itself while it is being read, too", () => {
    // ARC-1 (b) took the download off the openable row, and the page-turner
    // has always carried one for images. Without this the text viewer is the
    // only place in the archive with no route to the file on disk.
    render(
      <ArchiveTextViewer
        {...defaultProps}
        textConfirmed={true}
        textContent="hello"
      />
    );
    const action = screen.getByRole("link", { name: "Download readme.txt" });
    expect(action.getAttribute("download")).toBe("readme.txt");
  });

  it("displays text content when loaded", () => {
    render(
      <ArchiveTextViewer
        {...defaultProps}
        textConfirmed={true}
        textContent="Hello, World!"
      />
    );
    expect(screen.getByText("Hello, World!")).toBeInTheDocument();
  });

  it("shows filename in header", () => {
    render(<ArchiveTextViewer {...defaultProps} />);
    expect(screen.getByText("readme.txt")).toBeInTheDocument();
  });

  it("calls closeViewer on back button click", () => {
    const closeViewer = vi.fn();
    render(<ArchiveTextViewer {...defaultProps} closeViewer={closeViewer} />);
    fireEvent.click(screen.getByText("Back to list"));
    expect(closeViewer).toHaveBeenCalled();
  });
});
