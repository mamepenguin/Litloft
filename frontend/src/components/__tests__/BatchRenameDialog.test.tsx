import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BatchRenameDialog } from "../BatchRenameDialog";

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
    expect(screen.getByText("一括リネーム")).toBeInTheDocument();
  });

  it("switches modes", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("正規表現"));
    expect(screen.getByText("検索パターン")).toBeInTheDocument();

    fireEvent.click(screen.getByText("プレフィックス・サフィックス"));
    expect(screen.getByText("値")).toBeInTheDocument();

    fireEvent.click(screen.getByText("テンプレート"));
    expect(screen.getByText("開始番号")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("正規表現"));

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
    fireEvent.click(screen.getByText("正規表現"));

    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "[invalid" } });

    expect(screen.getByText("正規表現が無効です")).toBeInTheDocument();
  });

  it("shows prefix_suffix preview for add_prefix", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("プレフィックス・サフィックス"));

    const valueInput = screen.getByRole("textbox");
    fireEvent.change(valueInput, { target: { value: "new_" } });

    expect(screen.getByText("new_photo_a.jpg")).toBeInTheDocument();
    expect(screen.getByText("new_photo_b.jpg")).toBeInTheDocument();
    expect(screen.getByText("new_document.pdf")).toBeInTheDocument();
  });

  it("shows prefix_suffix preview for remove_prefix", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("プレフィックス・サフィックス"));

    const select = screen.getByDisplayValue("先頭に追加");
    fireEvent.change(select, { target: { value: "remove_prefix" } });

    const valueInput = screen.getByRole("textbox");
    fireEvent.change(valueInput, { target: { value: "photo_" } });

    expect(screen.getByText("a.jpg")).toBeInTheDocument();
    expect(screen.getByText("b.jpg")).toBeInTheDocument();
  });

  it("calls batchRename API on execute", async () => {
    render(<BatchRenameDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("リネーム実行"));

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

    fireEvent.click(screen.getByText("リネーム実行"));

    await waitFor(() => {
      expect(screen.getByText("リネームに失敗しました")).toBeInTheDocument();
    });
  });

  it("calls onCancel on close button", () => {
    const onCancel = vi.fn();
    render(<BatchRenameDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel on Escape key", () => {
    const onCancel = vi.fn();
    render(<BatchRenameDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables execute when no changes", () => {
    render(<BatchRenameDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("正規表現"));
    // No pattern entered, so no changes
    const button = screen.getByText("リネーム実行");
    expect(button).toBeDisabled();
  });
});
