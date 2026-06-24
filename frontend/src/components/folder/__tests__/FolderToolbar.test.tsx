import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FolderToolbar } from "../FolderToolbar";

vi.mock("@/components/SortButton", () => ({
  SortButton: () => <button data-testid="sort-button">Sort</button>,
}));

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: () => null,
}));

// UploadButton is rendered in both the mobile row and the desktop sticky bar.
// Mock it to a stable shape so tests can target it without CSS-based visibility.
vi.mock("@/components/UploadButton", () => ({
  UploadButton: ({ onCreateFolder }: { onCreateFolder?: () => void }) => (
    <>
      <button aria-label="Upload">Upload</button>
      {onCreateFolder && (
        <button onClick={onCreateFolder} aria-label="New Folder">
          New Folder
        </button>
      )}
    </>
  ),
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
    // Both buttons appear in mobile row and desktop sticky bar (CSS-only split).
    expect(screen.getAllByLabelText("Upload").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("New Folder").length).toBeGreaterThan(0);
  });

  it("renders new note button when onCreateFile is provided", () => {
    const onCreateFile = vi.fn();
    render(<FolderToolbar {...defaultProps} onCreateFile={onCreateFile} />);
    expect(screen.getAllByLabelText("New Note").length).toBeGreaterThan(0);
  });

  it("does not render new note button when onCreateFile is omitted", () => {
    render(<FolderToolbar {...defaultProps} />);
    expect(screen.queryByLabelText("New Note")).not.toBeInTheDocument();
  });

  it("clicking new note calls onCreateFile", () => {
    const onCreateFile = vi.fn();
    render(<FolderToolbar {...defaultProps} onCreateFile={onCreateFile} />);
    fireEvent.click(screen.getAllByLabelText("New Note")[0]);
    expect(onCreateFile).toHaveBeenCalledTimes(1);
  });

  it("hides new note button in special view even if onCreateFile is provided", () => {
    const onCreateFile = vi.fn();
    render(
      <FolderToolbar {...defaultProps} isSpecialView={true} onCreateFile={onCreateFile} />,
    );
    expect(screen.queryByLabelText("New Note")).not.toBeInTheDocument();
  });

  it("hides upload and folder buttons in special view", () => {
    render(<FolderToolbar {...defaultProps} isSpecialView={true} />);
    expect(screen.queryByLabelText("Upload")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New Folder")).not.toBeInTheDocument();
  });

  it("hides upload and folder buttons when tag filter active", () => {
    render(<FolderToolbar {...defaultProps} tagFilter="nature" />);
    expect(screen.queryByLabelText("Upload")).not.toBeInTheDocument();
  });

  it("clicking new folder triggers onSetCreatingFolder", () => {
    render(<FolderToolbar {...defaultProps} />);
    fireEvent.click(screen.getAllByLabelText("New Folder")[0]);
    expect(defaultProps.onSetCreatingFolder).toHaveBeenCalledWith(true);
  });

  it("shows folder creation input when creatingFolder is true", () => {
    render(<FolderToolbar {...defaultProps} creatingFolder={true} />);
    // Input appears in both mobile and desktop rows.
    expect(screen.getAllByPlaceholderText("Folder name...").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create").length).toBeGreaterThan(0);
  });

  it("calls onCreateFolder on create button click", () => {
    const onCreateFolder = vi.fn();
    render(
      <FolderToolbar {...defaultProps} creatingFolder={true} onCreateFolder={onCreateFolder} />
    );
    fireEvent.click(screen.getAllByText("Create")[0]);
    expect(onCreateFolder).toHaveBeenCalled();
  });

  it("calls onCreateFolder on Enter key", () => {
    const onCreateFolder = vi.fn();
    render(
      <FolderToolbar {...defaultProps} creatingFolder={true} onCreateFolder={onCreateFolder} />
    );
    fireEvent.keyDown(screen.getAllByPlaceholderText("Folder name...")[0], { key: "Enter" });
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
    fireEvent.keyDown(screen.getAllByPlaceholderText("Folder name...")[0], { key: "Escape" });
    expect(onSetCreatingFolder).toHaveBeenCalledWith(false);
    expect(onSetNewFolderName).toHaveBeenCalledWith("");
    expect(onSetFolderError).toHaveBeenCalledWith(null);
  });

  it("shows folder error message", () => {
    render(
      <FolderToolbar {...defaultProps} creatingFolder={true} folderError="Invalid folder name" />
    );
    expect(screen.getAllByText("Invalid folder name").length).toBeGreaterThan(0);
  });

  it("shows total count", () => {
    render(<FolderToolbar {...defaultProps} />);
    expect(screen.getByText("42 items")).toBeInTheDocument();
  });

  it("opens type filter popover and lists options", () => {
    render(<FolderToolbar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("File type"));
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
  });

  it("calls onTypeFilterChange when picking from popover", () => {
    const onTypeFilterChange = vi.fn();
    render(<FolderToolbar {...defaultProps} onTypeFilterChange={onTypeFilterChange} />);
    fireEvent.click(screen.getByLabelText("File type"));
    fireEvent.click(screen.getByText("Video"));
    expect(onTypeFilterChange).toHaveBeenCalledWith("video");
  });

  it("shows play all button when hasPlayableFiles", () => {
    render(<FolderToolbar {...defaultProps} hasPlayableFiles={true} />);
    expect(screen.getByLabelText("Play all")).toBeInTheDocument();
  });

  it("hides play all in special view", () => {
    render(<FolderToolbar {...defaultProps} hasPlayableFiles={true} isSpecialView={true} />);
    expect(screen.queryByLabelText("Play all")).not.toBeInTheDocument();
  });

  it("opens overflow menu and exposes rescan + select mode", () => {
    render(<FolderToolbar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    expect(screen.getByText("Rescan")).toBeInTheDocument();
    expect(screen.getByText("Selection mode")).toBeInTheDocument();
  });

  it("calls onScan from overflow menu", () => {
    const onScan = vi.fn();
    render(<FolderToolbar {...defaultProps} onScan={onScan} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(screen.getByText("Rescan"));
    expect(onScan).toHaveBeenCalled();
  });

  it("calls onToggleSelectable from overflow menu", () => {
    const onToggleSelectable = vi.fn();
    render(<FolderToolbar {...defaultProps} onToggleSelectable={onToggleSelectable} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    fireEvent.click(screen.getByText("Selection mode"));
    expect(onToggleSelectable).toHaveBeenCalled();
  });

  it("hides rescan in search mode", () => {
    render(<FolderToolbar {...defaultProps} isSearch={true} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    expect(screen.queryByText("Rescan")).not.toBeInTheDocument();
    expect(screen.getByText("Selection mode")).toBeInTheDocument();
  });

  it("shows reshuffle button when sort is random and onReshuffle is provided", () => {
    const onReshuffle = vi.fn();
    render(<FolderToolbar {...defaultProps} sort="random" onReshuffle={onReshuffle} />);
    expect(screen.getByLabelText("Reshuffle")).toBeInTheDocument();
  });

  it("does not show reshuffle button when sort is not random", () => {
    const onReshuffle = vi.fn();
    render(<FolderToolbar {...defaultProps} sort="created_at" onReshuffle={onReshuffle} />);
    expect(screen.queryByLabelText("Reshuffle")).not.toBeInTheDocument();
  });

  it("does not show reshuffle button when onReshuffle is not provided", () => {
    render(<FolderToolbar {...defaultProps} sort="random" />);
    expect(screen.queryByLabelText("Reshuffle")).not.toBeInTheDocument();
  });

  it("calls onReshuffle when reshuffle button is clicked", () => {
    const onReshuffle = vi.fn();
    render(<FolderToolbar {...defaultProps} sort="random" onReshuffle={onReshuffle} />);
    fireEvent.click(screen.getByLabelText("Reshuffle"));
    expect(onReshuffle).toHaveBeenCalledTimes(1);
  });
});
