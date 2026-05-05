import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { BatchRenameDialog } from "../BatchRenameDialog";
import { ShortcutsProvider } from "../ShortcutsProvider";

function renderWithShortcuts(ui: ReactNode) {
  return render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
}

const mockBatchRename = vi.fn().mockResolvedValue({ renamed: 2, results: [] });

vi.mock("@/lib/api", () => ({
  batchRename: (...args: unknown[]) => mockBatchRename(...args),
}));

const files = [
  { id: "f1", filename: "photo_a.jpg" },
  { id: "f2", filename: "photo_b.jpg" },
  { id: "f3", filename: "document.pdf" },
];

const defaultProps = {
  open: true,
  files,
  onComplete: vi.fn(),
  onCancel: vi.fn(),
};

describe("BatchRenameDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <BatchRenameDialog {...defaultProps} open={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when open", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    expect(screen.getByText("Batch Rename")).toBeInTheDocument();
  });

  it("switches modes", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Regex"));
    expect(screen.getByText("Search pattern")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Prefix / Suffix"));
    expect(screen.getByText("Value")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Template"));
    expect(screen.getByText("Start number")).toBeInTheDocument();
  });

  it("shows template preview with default settings", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    // Default template: {original}_{n}, start=1, pad=3
    expect(screen.getByText("photo_a_001.jpg")).toBeInTheDocument();
    expect(screen.getByText("photo_b_002.jpg")).toBeInTheDocument();
    expect(screen.getByText("document_003.pdf")).toBeInTheDocument();
  });

  it("updates template preview when inputs change", () => {
    render(<BatchRenameDialog {...defaultProps} />);

    const templateInput = screen.getByDisplayValue("{original}_{n}");
    fireEvent.change(templateInput, { target: { value: "img_{n}" } });

    expect(screen.getByText("img_001.jpg")).toBeInTheDocument();
    expect(screen.getByText("img_002.jpg")).toBeInTheDocument();
    expect(screen.getByText("img_003.pdf")).toBeInTheDocument();
  });

  it("shows regex preview", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Regex"));

    const inputs = screen.getAllByRole("textbox");
    const patternInput = inputs[0];
    const replaceInput = inputs[1];

    fireEvent.change(patternInput, { target: { value: "photo" } });
    fireEvent.change(replaceInput, { target: { value: "image" } });

    expect(screen.getByText("image_a.jpg")).toBeInTheDocument();
    expect(screen.getByText("image_b.jpg")).toBeInTheDocument();
  });

  it("shows invalid regex error", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Regex"));

    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "[invalid" } });

    expect(screen.getByText("Invalid regular expression")).toBeInTheDocument();
  });

  it("shows prefix_suffix preview for add_prefix", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Prefix / Suffix"));

    const valueInput = screen.getByRole("textbox");
    fireEvent.change(valueInput, { target: { value: "new_" } });

    expect(screen.getByText("new_photo_a.jpg")).toBeInTheDocument();
    expect(screen.getByText("new_photo_b.jpg")).toBeInTheDocument();
    expect(screen.getByText("new_document.pdf")).toBeInTheDocument();
  });

  it("shows prefix_suffix preview for remove_prefix", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Prefix / Suffix"));

    fireEvent.click(screen.getByText("Remove prefix"));

    const valueInput = screen.getByRole("textbox");
    fireEvent.change(valueInput, { target: { value: "photo_" } });

    expect(screen.getByText("a.jpg")).toBeInTheDocument();
    expect(screen.getByText("b.jpg")).toBeInTheDocument();
  });

  it("calls batchRename API on execute", async () => {
    render(<BatchRenameDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("Rename"));

    await waitFor(() => {
      expect(mockBatchRename).toHaveBeenCalledWith({
        ids: ["f1", "f2", "f3"],
        mode: "template",
        template: "{original}_{n}",
        start_number: 1,
        zero_pad: 3,
      });
    });
    expect(defaultProps.onComplete).toHaveBeenCalled();
  });

  it("shows error on API failure", async () => {
    mockBatchRename.mockRejectedValueOnce(new Error("fail"));
    render(<BatchRenameDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("Rename"));

    await waitFor(() => {
      expect(screen.getByText("Rename failed")).toBeInTheDocument();
    });
  });

  it("calls onCancel on close button", () => {
    const onCancel = vi.fn();
    render(<BatchRenameDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel on Escape key", () => {
    const onCancel = vi.fn();
    renderWithShortcuts(<BatchRenameDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables execute when no changes", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Regex"));
    // No pattern entered, so no changes
    const button = screen.getByText("Rename");
    expect(button).toBeDisabled();
  });
});
