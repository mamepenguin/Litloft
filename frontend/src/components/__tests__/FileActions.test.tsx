import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileActions } from "../FileActions";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  moveFile: vi.fn().mockResolvedValue({}),
  renameFile: vi.fn().mockResolvedValue({}),
  getFolders: vi.fn().mockResolvedValue([]),
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm, onCancel, message }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{message}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../RenameDialog", () => ({
  RenameDialog: ({ open, onRename, onCancel }: any) =>
    open ? (
      <div data-testid="rename-dialog">
        <button onClick={() => onRename("new-name.mp4")}>Rename</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open, onMove, onCancel }: any) =>
    open ? (
      <div data-testid="move-dialog">
        <button onClick={() => onMove("target/path")}>Move</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

const mockFile: FileItem = {
  id: "file-1",
  filename: "test.mp4",
  title: "Test",
  description: "",
  drive: "main",
  folder_path: "videos",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: 60,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("FileActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders menu button", () => {
    render(<FileActions file={mockFile} />);
    expect(screen.getByLabelText("File actions")).toBeInTheDocument();
  });

  it("opens menu on click", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Move")).toBeInTheDocument();
    expect(screen.getByText("Move to Trash")).toBeInTheDocument();
  });

  it("opens rename dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Rename"));
    expect(screen.getByTestId("rename-dialog")).toBeInTheDocument();
  });

  it("opens move dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move"));
    expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
  });

  it("opens delete confirmation dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move to Trash"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("calls onDelete after successful deletion", async () => {
    const onDelete = vi.fn();
    render(<FileActions file={mockFile} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Move to Trash"));
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });
  });

  it("calls onUpdate after successful rename", async () => {
    const onUpdate = vi.fn();
    render(<FileActions file={mockFile} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByLabelText("File actions"));
    fireEvent.click(screen.getByText("Rename"));
    fireEvent.click(screen.getByText("Rename"));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});

describe("FileActions menu alignment", () => {
  // The menu hangs left of the trigger, which only holds while the trigger
  // sits near its column's right edge. A wrapped action row or a narrow pane
  // breaks that, and the menu would spill over whatever is to the left.
  function mountWithBounds(triggerRight: number, clipLeft: number) {
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (this.getAttribute("data-bounds") === "clip") {
          return { left: clipLeft, right: clipLeft + 300 } as DOMRect;
        }
        if ((this as HTMLElement).classList.contains("relative")) {
          return { left: triggerRight - 28, right: triggerRight } as DOMRect;
        }
        return original.call(this);
      },
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens leftward when the trigger has room to its left", async () => {
    mountWithBounds(300, 0);
    const { container } = render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));

    const menu = container.querySelector(".absolute.top-full");
    expect(menu?.className).toContain("right-0");
    expect(menu?.className).not.toContain("left-0");
  });

  it("flips rightward when the menu would spill past the column edge", async () => {
    // Trigger 150px from a column that starts at 0: a 160px menu hung to the
    // left would start at -10.
    mountWithBounds(150, 0);
    const { container } = render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("File actions"));

    const menu = container.querySelector(".absolute.top-full");
    expect(menu?.className).toContain("left-0");
  });
});
