import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FolderToolbar } from "../FolderToolbar";

vi.mock("@/components/SortButton", () => ({
  SortButton: () => <button data-testid="sort-button">Sort</button>,
}));

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: () => null,
}));

const defaultProps = {
  isSpecialView: false,
  tagFilter: null,
  hasPlayableFiles: false,
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 42,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: ["file-1", "file-2"],
  drive: "test-drive",
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
  onScan: vi.fn(),
  onPlayAll: vi.fn(),
  onSetCreatingFolder: vi.fn(),
  onSetNewFolderName: vi.fn(),
  onSetFolderError: vi.fn(),
  onCreateFolder: vi.fn(),
};

describe("FolderToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders upload button and new folder button", () => {
    render(<FolderToolbar {...defaultProps} />);
    expect(screen.getByLabelText("アップロード")).toBeInTheDocument();
    expect(screen.getByLabelText("新規フォルダ")).toBeInTheDocument();
  });

  it("hides upload and folder buttons in special view", () => {
    render(<FolderToolbar {...defaultProps} isSpecialView={true} />);
    expect(screen.queryByLabelText("アップロード")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("新規フォルダ")).not.toBeInTheDocument();
  });

  it("hides upload and folder buttons when tag filter active", () => {
    render(<FolderToolbar {...defaultProps} tagFilter="nature" />);
    expect(screen.queryByLabelText("アップロード")).not.toBeInTheDocument();
  });

  it("shows upload dropdown menu with Files and Folder options", () => {
    render(<FolderToolbar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("アップロード"));
    expect(screen.getByText("ファイル")).toBeInTheDocument();
    expect(screen.getByText("フォルダ")).toBeInTheDocument();
  });

  it("closes upload dropdown on second click", () => {
    render(<FolderToolbar {...defaultProps} />);
    const btn = screen.getByLabelText("アップロード");
    fireEvent.click(btn);
    expect(screen.getByText("ファイル")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText("ファイル")).not.toBeInTheDocument();
  });

  it("shows folder creation input when creatingFolder is true", () => {
    render(<FolderToolbar {...defaultProps} creatingFolder={true} />);
    expect(screen.getByPlaceholderText("フォルダ名...")).toBeInTheDocument();
    expect(screen.getByText("作成")).toBeInTheDocument();
  });

  it("calls onCreateFolder on create button click", () => {
    const onCreateFolder = vi.fn();
    render(
      <FolderToolbar {...defaultProps} creatingFolder={true} onCreateFolder={onCreateFolder} />
    );
    fireEvent.click(screen.getByText("作成"));
    expect(onCreateFolder).toHaveBeenCalled();
  });

  it("calls onCreateFolder on Enter key", () => {
    const onCreateFolder = vi.fn();
    render(
      <FolderToolbar {...defaultProps} creatingFolder={true} onCreateFolder={onCreateFolder} />
    );
    fireEvent.keyDown(screen.getByPlaceholderText("フォルダ名..."), { key: "Enter" });
    expect(onCreateFolder).toHaveBeenCalled();
  });

  it("cancels folder creation on Escape key", () => {
    const onSetCreatingFolder = vi.fn();
    const onSetNewFolderName = vi.fn();
    const onSetFolderError = vi.fn();
    render(
      <FolderToolbar
        {...defaultProps}
        creatingFolder={true}
        onSetCreatingFolder={onSetCreatingFolder}
        onSetNewFolderName={onSetNewFolderName}
        onSetFolderError={onSetFolderError}
      />
    );
    fireEvent.keyDown(screen.getByPlaceholderText("フォルダ名..."), { key: "Escape" });
    expect(onSetCreatingFolder).toHaveBeenCalledWith(false);
    expect(onSetNewFolderName).toHaveBeenCalledWith("");
    expect(onSetFolderError).toHaveBeenCalledWith(null);
  });

  it("shows folder error message", () => {
    render(
      <FolderToolbar {...defaultProps} creatingFolder={true} folderError="無効なフォルダ名です" />
    );
    expect(screen.getByText("無効なフォルダ名です")).toBeInTheDocument();
  });

  it("shows total count", () => {
    render(<FolderToolbar {...defaultProps} />);
    expect(screen.getByText("42 件")).toBeInTheDocument();
  });

  it("opens type filter popover and lists options", () => {
    render(<FolderToolbar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("ファイルタイプ"));
    expect(screen.getByText("すべて")).toBeInTheDocument();
    expect(screen.getByText("動画")).toBeInTheDocument();
    expect(screen.getByText("画像")).toBeInTheDocument();
    expect(screen.getByText("音声")).toBeInTheDocument();
  });

  it("calls onTypeFilterChange when picking from popover", () => {
    const onTypeFilterChange = vi.fn();
    render(<FolderToolbar {...defaultProps} onTypeFilterChange={onTypeFilterChange} />);
    fireEvent.click(screen.getByLabelText("ファイルタイプ"));
    fireEvent.click(screen.getByText("動画"));
    expect(onTypeFilterChange).toHaveBeenCalledWith("video");
  });

  it("shows play all button when hasPlayableFiles", () => {
    render(<FolderToolbar {...defaultProps} hasPlayableFiles={true} />);
    expect(screen.getByLabelText("全曲再生")).toBeInTheDocument();
  });

  it("hides play all in special view", () => {
    render(<FolderToolbar {...defaultProps} hasPlayableFiles={true} isSpecialView={true} />);
    expect(screen.queryByLabelText("全曲再生")).not.toBeInTheDocument();
  });

  it("opens overflow menu and exposes rescan + select mode", () => {
    render(<FolderToolbar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("その他の操作"));
    expect(screen.getByText("再スキャン")).toBeInTheDocument();
    expect(screen.getByText("選択モード")).toBeInTheDocument();
  });

  it("calls onScan from overflow menu", () => {
    const onScan = vi.fn();
    render(<FolderToolbar {...defaultProps} onScan={onScan} />);
    fireEvent.click(screen.getByLabelText("その他の操作"));
    fireEvent.click(screen.getByText("再スキャン"));
    expect(onScan).toHaveBeenCalled();
  });

  it("calls onToggleSelectable from overflow menu", () => {
    const onToggleSelectable = vi.fn();
    render(<FolderToolbar {...defaultProps} onToggleSelectable={onToggleSelectable} />);
    fireEvent.click(screen.getByLabelText("その他の操作"));
    fireEvent.click(screen.getByText("選択モード"));
    expect(onToggleSelectable).toHaveBeenCalled();
  });

  it("hides rescan in search mode", () => {
    render(<FolderToolbar {...defaultProps} isSearch={true} />);
    fireEvent.click(screen.getByLabelText("その他の操作"));
    expect(screen.queryByText("再スキャン")).not.toBeInTheDocument();
    expect(screen.getByText("選択モード")).toBeInTheDocument();
  });
});
