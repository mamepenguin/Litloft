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
