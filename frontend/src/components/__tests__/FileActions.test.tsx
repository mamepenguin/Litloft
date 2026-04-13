import { describe, it, expect, vi, beforeEach } from "vitest";
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
        <button onClick={onConfirm}>確認</button>
        <button onClick={onCancel}>キャンセル</button>
      </div>
    ) : null,
}));

vi.mock("../RenameDialog", () => ({
  RenameDialog: ({ open, onRename, onCancel }: any) =>
    open ? (
      <div data-testid="rename-dialog">
        <button onClick={() => onRename("new-name.mp4")}>リネーム実行</button>
        <button onClick={onCancel}>キャンセル</button>
      </div>
    ) : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open, onMove, onCancel }: any) =>
    open ? (
      <div data-testid="move-dialog">
        <button onClick={() => onMove("target/path")}>移動実行</button>
        <button onClick={onCancel}>キャンセル</button>
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
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("FileActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders menu button", () => {
    render(<FileActions file={mockFile} />);
    expect(screen.getByLabelText("ファイル操作")).toBeInTheDocument();
  });

  it("opens menu on click", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("ファイル操作"));
    expect(screen.getByText("ダウンロード")).toBeInTheDocument();
    expect(screen.getByText("名前を変更")).toBeInTheDocument();
    expect(screen.getByText("移動")).toBeInTheDocument();
    expect(screen.getByText("ゴミ箱に移動")).toBeInTheDocument();
  });

  it("opens rename dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("ファイル操作"));
    fireEvent.click(screen.getByText("名前を変更"));
    expect(screen.getByTestId("rename-dialog")).toBeInTheDocument();
  });

  it("opens move dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("ファイル操作"));
    fireEvent.click(screen.getByText("移動"));
    expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
  });

  it("opens delete confirmation dialog", () => {
    render(<FileActions file={mockFile} />);
    fireEvent.click(screen.getByLabelText("ファイル操作"));
    fireEvent.click(screen.getByText("ゴミ箱に移動"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("calls onDelete after successful deletion", async () => {
    const onDelete = vi.fn();
    render(<FileActions file={mockFile} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("ファイル操作"));
    fireEvent.click(screen.getByText("ゴミ箱に移動"));
    fireEvent.click(screen.getByText("確認"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });
  });

  it("calls onUpdate after successful rename", async () => {
    const onUpdate = vi.fn();
    render(<FileActions file={mockFile} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByLabelText("ファイル操作"));
    fireEvent.click(screen.getByText("名前を変更"));
    fireEvent.click(screen.getByText("リネーム実行"));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});
