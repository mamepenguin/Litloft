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
  isFolderAnchored: true,
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
      <FolderToolbar
        {...defaultProps}
        isSpecialView={true}
        isFolderAnchored={false}
        onCreateFile={onCreateFile}
      />,
    );
    expect(screen.queryByLabelText("New Note")).not.toBeInTheDocument();
  });

  it("hides upload and folder buttons in special view", () => {
    render(<FolderToolbar {...defaultProps} isSpecialView={true} isFolderAnchored={false} />);
    expect(screen.queryByLabelText("Upload")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New Folder")).not.toBeInTheDocument();
  });

  // spec 2026-08-21-folder-scoped-tag-filter §6.2: the toolbar's gate is
  // the second of two, and it nulls the whole left group — so passing
  // onCreateFile without moving this predicate changes nothing visible.
  // What it actually tests is "is there a folder to write into?".
  it("shows upload, new folder and new note during a folder-anchored tag filter", () => {
    const onCreateFile = vi.fn();
    render(
      <FolderToolbar
        {...defaultProps}
        tagFilter="nature"
        folderPath="recipes"
        isFolderAnchored={true}
        onCreateFile={onCreateFile}
      />,
    );
    expect(screen.getAllByLabelText("Upload").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("New Folder").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("New Note").length).toBeGreaterThan(0);
  });

  it("hides upload and folder buttons for a tag filter with no folder anchor", () => {
    // A drive-root tag filter has no concrete folder to write into.
    render(
      <FolderToolbar {...defaultProps} tagFilter="nature" isFolderAnchored={false} />,
    );
    expect(screen.queryByLabelText("Upload")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New Folder")).not.toBeInTheDocument();
  });

  it("hides upload and folder buttons in search mode", () => {
    render(<FolderToolbar {...defaultProps} isSearch={true} isFolderAnchored={false} />);
    expect(screen.queryByLabelText("Upload")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New Folder")).not.toBeInTheDocument();
  });

  // spec 2026-08-21-folder-scoped-tag-filter §8
  it("offers the drive-wide widening link during a folder tag filter", () => {
    render(
      <FolderToolbar
        {...defaultProps}
        tagFilter="soup"
        folderPath="recipes"
        widenTagScope={{ tagName: "soup", href: "/drive/test-drive?tag=soup" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Search the whole drive" });
    expect(link).toHaveAttribute("href", "/drive/test-drive?tag=soup");
  });

  it("does not offer the widening link when there is nothing to widen", () => {
    render(<FolderToolbar {...defaultProps} widenTagScope={null} />);
    expect(
      screen.queryByRole("link", { name: "Search the whole drive" }),
    ).not.toBeInTheDocument();
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

  // The count moved to `PageHeader`'s scope line, where search mode had
  // always kept it — the toolbar and the header used to state the same fact
  // in two places and two wordings. Asserted here as an absence so the two
  // cannot quietly both come back.
  it("does not state the count; the page header does", () => {
    render(<FolderToolbar {...defaultProps} />);
    expect(screen.queryByText(/\d+ items/)).toBeNull();
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

  describe("an empty folder", () => {
    // Sort order, view mode and the type filter are ways of arranging
    // things. With nothing to arrange they are seven controls above an
    // empty page. What stays is everything that puts something in the
    // folder, plus the count that says it is empty.
    const empty = {
      ...defaultProps,
      total: 0,
      folderCount: 0,
      viewMode: "grid" as const,
    };

    it("puts away the arranging controls", () => {
      render(<FolderToolbar {...empty} />);
      expect(screen.queryByTestId("sort-button")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("File type")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Grid view")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("List view")).not.toBeInTheDocument();
    });

    it("keeps the ways of putting something in it", () => {
      render(<FolderToolbar {...empty} onCreateFile={vi.fn()} />);
      expect(screen.getAllByLabelText("Upload").length).toBeGreaterThan(0);
      expect(screen.getAllByLabelText("New Folder").length).toBeGreaterThan(0);
      expect(screen.getAllByLabelText("New Note").length).toBeGreaterThan(0);
    });

    it("keeps the way back to a rescan", () => {
      render(<FolderToolbar {...empty} />);
      // Rescan is how an empty folder stops being empty. The count that used
      // to be asserted alongside it is the header's now, and an empty folder
      // still shows it — `FolderBrowser.header.test.tsx` holds that.
      expect(screen.getByLabelText("More actions")).toBeInTheDocument();
    });

    it("keeps them all when only the files are gone", () => {
      // Subfolders are laid out by the same view toggle. A folder of
      // eight folders and no files is not an empty folder.
      render(<FolderToolbar {...empty} folderCount={8} />);
      expect(screen.getByTestId("sort-button")).toBeInTheDocument();
      expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    });

    it("keeps them all when a filter is what emptied it", () => {
      // Hiding the type chip that produced the empty result would leave
      // the user with no way back to the full listing.
      render(<FolderToolbar {...empty} typeFilter="audio" />);
      expect(screen.getByTestId("sort-button")).toBeInTheDocument();
      expect(screen.getByLabelText("File type")).toBeInTheDocument();
    });

    it("keeps them all when a trust filter is what emptied it", () => {
      render(
        <FolderToolbar
          {...empty}
          trustFilter="unreviewed"
          onTrustFilterChange={vi.fn()}
        />,
      );
      expect(screen.getByTestId("sort-button")).toBeInTheDocument();
    });

    it("keeps them all when a tag filter is what emptied it", () => {
      render(<FolderToolbar {...empty} tagFilter="recipes" />);
      expect(screen.getByTestId("sort-button")).toBeInTheDocument();
    });

    it("keeps them all for an empty search", () => {
      // A search that found nothing still needs its sort and its type
      // chip: they are how the query gets widened.
      render(<FolderToolbar {...empty} isSearch />);
      expect(screen.getByTestId("sort-button")).toBeInTheDocument();
      expect(screen.getByLabelText("File type")).toBeInTheDocument();
    });

    it("keeps them all when the folder count is simply not known", () => {
      // Callers that never pass folderCount must behave as they did.
      const { folderCount: _ignored, ...withoutCount } = empty;
      render(<FolderToolbar {...withoutCount} />);
      expect(screen.getByTestId("sort-button")).toBeInTheDocument();
    });
  });

  describe("the kinds it offers", () => {
    const kindMenu = () => {
      fireEvent.click(screen.getByLabelText("File type"));
      return screen.getAllByRole("menuitem").map((el) => el.textContent);
    };

    it("offers the whole vocabulary in a folder", () => {
      render(<FolderToolbar {...defaultProps} />);
      expect(kindMenu()).toEqual([
        "All", "Video", "Image", "Audio", "Document", "Markdown", "PDF",
        "Archive", "Other",
      ]);
    });

    it("offers the same vocabulary in search", () => {
      // For a while it offered two fewer here: intelligence's index
      // stores `file_type`, which never holds `markdown` or `pdf`, so
      // narrowing a search to either dropped every semantic hit and
      // fell back to filename matches without saying so. The addon
      // learned the nested kinds (`app/file_kind.py`), so both surfaces
      // now understand the question — which is the point of there being
      // one vocabulary. They still answer it at different points in
      // their pipelines (core filters in SQL before paging; the addon
      // filters after retrieval has produced its candidates), so a
      // narrow search can still come back short. That is how the six
      // flat kinds have always behaved.
      render(<FolderToolbar {...defaultProps} isSearch />);
      expect(kindMenu()).toEqual([
        "All", "Video", "Image", "Audio", "Document", "Markdown", "PDF",
        "Archive", "Other",
      ]);
    });
  });
});
