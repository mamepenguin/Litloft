import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MoveDialog } from "../MoveDialog";

vi.mock("@/lib/api", () => ({
  getFolders: vi.fn().mockResolvedValue([
    { name: "photos", path: "photos", file_count: 5, thumbnail_file_id: null },
    { name: "docs", path: "docs", file_count: 3, thumbnail_file_id: null },
  ]),
}));

import { getFolders } from "@/lib/api";

const defaultProps = {
  open: true,
  drive: "main",
  currentPath: "videos",
  onMove: vi.fn(),
  onCancel: vi.fn(),
};

describe("MoveDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<MoveDialog {...defaultProps} open={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when open", async () => {
    render(<MoveDialog {...defaultProps} />);
    expect(screen.getByText("移動先を選択")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("photos")).toBeInTheDocument();
    });
  });

  it("loads folders on open", async () => {
    render(<MoveDialog {...defaultProps} />);
    await waitFor(() => {
      expect(getFolders).toHaveBeenCalledWith("main", undefined);
    });
  });

  it("shows drive name in breadcrumb", () => {
    render(<MoveDialog {...defaultProps} />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("calls onCancel on close button", () => {
    const onCancel = vi.fn();
    render(<MoveDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onMove with selected path", async () => {
    const onMove = vi.fn();
    render(<MoveDialog {...defaultProps} onMove={onMove} />);

    await waitFor(() => {
      expect(screen.getByText("photos")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("photos"));

    await waitFor(() => {
      expect(getFolders).toHaveBeenCalledWith("main", "photos");
    });

    fireEvent.click(screen.getByText("ここに移動"));
    expect(onMove).toHaveBeenCalledWith("photos");
  });

  it("disables move button when selecting current path", () => {
    render(<MoveDialog {...defaultProps} currentPath="" />);
    // Default selected path is "" which equals currentPath ""
    const moveButton = screen.getByText("ここに移動");
    expect(moveButton).toBeDisabled();
  });
});
