import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectionBar } from "../SelectionBar";

vi.mock("@/lib/api", () => ({
  batchDelete: vi.fn().mockResolvedValue({ deleted: 2, errors: [] }),
  batchMove: vi.fn().mockResolvedValue({ moved: 2, errors: [] }),
  batchTag: vi.fn().mockResolvedValue({ updated: 2, errors: [] }),
  batchRestore: vi.fn().mockResolvedValue({ restored: 2, errors: [] }),
  batchPurge: vi.fn().mockResolvedValue({ purged: 2, errors: [] }),
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm, onCancel }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open }: any) =>
    open ? <div data-testid="move-dialog" /> : null,
}));

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("../CollectionPicker", () => ({
  CollectionPicker: ({ open }: any) =>
    open ? <div data-testid="collection-picker" /> : null,
}));

const defaultProps = {
  count: 3,
  selectedIds: new Set(["f1", "f2", "f3"]),
  totalCount: 10,
  drive: "main",
  currentPath: "",
  onSelectAll: vi.fn(),
  onClear: vi.fn(),
  onComplete: vi.fn(),
};

describe("SelectionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders selection count", () => {
    render(<SelectionBar {...defaultProps} />);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("returns null when count is 0", () => {
    const { container } = render(
      <SelectionBar {...defaultProps} count={0} selectedIds={new Set()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows select all button when count < total", () => {
    render(<SelectionBar {...defaultProps} />);
    expect(screen.getByText("Select all")).toBeInTheDocument();
  });

  it("hides select all when count equals total", () => {
    render(<SelectionBar {...defaultProps} count={10} totalCount={10} />);
    expect(screen.queryByText("Select all")).not.toBeInTheDocument();
  });

  it("calls onSelectAll on click", () => {
    const onSelectAll = vi.fn();
    render(<SelectionBar {...defaultProps} onSelectAll={onSelectAll} />);
    fireEvent.click(screen.getByText("Select all"));
    expect(onSelectAll).toHaveBeenCalled();
  });

  it("calls onClear on deselect button", () => {
    const onClear = vi.fn();
    render(<SelectionBar {...defaultProps} onClear={onClear} />);
    fireEvent.click(screen.getByLabelText("Deselect"));
    expect(onClear).toHaveBeenCalled();
  });

  it("opens delete dialog", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Move to Trash"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("opens move dialog", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Move"));
    expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
  });

  it("opens collection picker", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Add to collection"));
    expect(screen.getByTestId("collection-picker")).toBeInTheDocument();
  });

  it("shows tag input on tag button click", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tagging"));
    expect(screen.getByPlaceholderText("tag1, tag2...")).toBeInTheDocument();
  });
});
