import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FolderToolbar } from "../FolderToolbar";

const addonSlotIds: string[] = [];
const addonSlotProps: Array<{ id: string; props: Record<string, unknown> }> = [];
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id, props }: { id: string; props: Record<string, unknown> }) => {
    addonSlotIds.push(id);
    addonSlotProps.push({ id, props });
    return null;
  },
}));

// The real provider's default context answers `hasSlot: () => false`, which
// would make the Add menu's addon rows unreachable from this file — and the
// wiring that feeds them is FolderToolbar's, not AddButton's.
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: () => true }),
}));

// `AddButton` is *not* mocked here. It is the toolbar's one accent fill and
// it now holds upload, new folder and new note, so a stand-in would leave
// this file asserting the stand-in's shape rather than the group the toolbar
// actually renders. It appears twice — mobile row and desktop sticky bar —
// so every lookup takes the first.
const openAddMenu = () => {
  fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
};

/**
 * The sort control on the bar, by its accessible name.
 *
 * Not a stand-in. An earlier version of this file mocked `SortButton` and
 * asserted the stand-in's `data-testid`, which is the shape `toolbarLabels`
 * records as having hidden a control from a count. `SortMenu` names itself
 * `Sort: <the order that is on>`, so the prefix finds it at every order —
 * including the fallback where the order is one this screen does not offer
 * and the name is the bare word.
 */
const sortControl = () => screen.queryByRole("button", { name: /^Sort/ });

/** The rows of the sort menu, which is where reshuffle now lives. */
const openSortMenu = () => fireEvent.click(sortControl()!);

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
    addonSlotIds.length = 0;
    addonSlotProps.length = 0;
  });

  it("offers addons the menu, and no longer a place on the bar", () => {
    // `folder-actions` drew a second button beside `Add` — a control this
    // bar has no room for, measured wrapping it onto two rows between 768
    // and 785px. No manifest names it, so the toolbar does not ask for it;
    // `folder-actions-menu` is the way in.
    render(<FolderToolbar {...defaultProps} />);
    expect(addonSlotIds).not.toContain("folder-actions");
    expect(addonSlotIds.every((id) => id === "folder-actions-menu")).toBe(true);
  });

  // The point of the PR: the Add menu's addon rows. Removing `addonProps`
  // from the AddButton call kills the slot in production, and until this
  // existed nothing failed when it did.
  describe("the add menu's addon slot", () => {
    const menuSlots = () =>
      addonSlotProps.filter((s) => s.id === "folder-actions-menu");

    // The slot lives inside the menu, so it is only asked for once the menu
    // is open — and the toolbar draws the whole left group twice, once per
    // breakpoint, each with its own menu.
    const openEvery = () =>
      screen
        .getAllByRole("button", { name: "Add" })
        .forEach((b) => fireEvent.click(b));

    it("is asked for at both widths", () => {
      render(<FolderToolbar {...defaultProps} />);
      expect(menuSlots()).toHaveLength(0);
      openEvery();
      expect(menuSlots()).toHaveLength(2);
    });

    it("is handed the folder it is looking at", () => {
      render(
        <FolderToolbar {...defaultProps} folderPath="recipes/soup" />,
      );
      openEvery();
      expect(menuSlots()[0].props).toMatchObject({
        drive: "test-drive",
        fileIds: ["file-1", "file-2"],
        path: "recipes/soup",
      });
    });

    it("says the drive root with an empty path, not undefined", () => {
      render(<FolderToolbar {...defaultProps} />);
      openEvery();
      expect(menuSlots()[0].props.path).toBe("");
    });

    it("is not offered where there is no folder to write into", () => {
      render(
        <FolderToolbar {...defaultProps} isSearch isFolderAnchored={false} />,
      );
      // There is no Add button to open at all there.
      expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
      expect(menuSlots()).toHaveLength(0);
    });
  });

  it("puts upload and new folder behind one add menu", () => {
    render(<FolderToolbar {...defaultProps} />);
    // Nothing on the bar until it is opened: the three controls that used to
    // sit here are rows now.
    expect(screen.queryByText("Files")).not.toBeInTheDocument();
    expect(screen.queryByText("New Folder")).not.toBeInTheDocument();
    openAddMenu();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Folder")).toBeInTheDocument();
    expect(screen.getByText("New Folder")).toBeInTheDocument();
  });

  it("offers new note in the add menu when onCreateFile is provided", () => {
    render(<FolderToolbar {...defaultProps} onCreateFile={vi.fn()} />);
    openAddMenu();
    expect(screen.getByText("New Note")).toBeInTheDocument();
  });

  it("does not offer new note when onCreateFile is omitted", () => {
    render(<FolderToolbar {...defaultProps} />);
    openAddMenu();
    expect(screen.queryByText("New Note")).not.toBeInTheDocument();
  });

  it("clicking new note calls onCreateFile", () => {
    const onCreateFile = vi.fn();
    render(<FolderToolbar {...defaultProps} onCreateFile={onCreateFile} />);
    openAddMenu();
    fireEvent.click(screen.getByText("New Note"));
    expect(onCreateFile).toHaveBeenCalledTimes(1);
  });

  it("hides the add menu entirely in special view", () => {
    const onCreateFile = vi.fn();
    render(
      <FolderToolbar
        {...defaultProps}
        isSpecialView={true}
        isFolderAnchored={false}
        onCreateFile={onCreateFile}
      />,
    );
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
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
    expect(screen.getAllByRole("button", { name: "Add" }).length).toBeGreaterThan(0);
    openAddMenu();
    expect(screen.getByText("New Folder")).toBeInTheDocument();
    expect(screen.getByText("New Note")).toBeInTheDocument();
  });

  it("hides the add menu for a tag filter with no folder anchor", () => {
    // A drive-root tag filter has no concrete folder to write into.
    render(
      <FolderToolbar {...defaultProps} tagFilter="nature" isFolderAnchored={false} />,
    );
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("hides the add menu in search mode", () => {
    render(<FolderToolbar {...defaultProps} isSearch={true} isFolderAnchored={false} />);
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
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
    openAddMenu();
    fireEvent.click(screen.getByText("New Folder"));
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

  it("opens the filter menu and lists the kinds", () => {
    render(<FolderToolbar {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
  });

  it("calls onTypeFilterChange when picking from popover", () => {
    const onTypeFilterChange = vi.fn();
    render(<FolderToolbar {...defaultProps} onTypeFilterChange={onTypeFilterChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    fireEvent.click(screen.getByText("Video"));
    expect(onTypeFilterChange).toHaveBeenCalledWith("video");
  });

  it("shows play all button when hasPlayableFiles", () => {
    render(<FolderToolbar {...defaultProps} hasPlayableFiles={true} />);
    // Named by the label a sighted reader sees, not by an `aria-label` that
    // said something else. It used to carry both, so screen readers heard
    // "Play all" where the button read "Play".
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("hides play all in special view", () => {
    render(<FolderToolbar {...defaultProps} hasPlayableFiles={true} isSpecialView={true} />);
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
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

  // Reshuffle used to be a bare `⇄` sitting on the bar beside the sort
  // button, appearing and disappearing as the order changed. It is a row of
  // the sort menu now — the row that turns the random order on is two lines
  // above it, and a control that is only meaningful in one of seven states
  // is not what the bar is for.
  it("offers reshuffle inside the sort menu when the order is random", () => {
    const onReshuffle = vi.fn();
    render(<FolderToolbar {...defaultProps} sort="random" onReshuffle={onReshuffle} />);
    expect(screen.queryByText("Reshuffle")).not.toBeInTheDocument();
    openSortMenu();
    expect(screen.getByRole("menuitem", { name: "Reshuffle" })).toBeInTheDocument();
  });

  it("does not offer reshuffle when the order is not random", () => {
    const onReshuffle = vi.fn();
    render(<FolderToolbar {...defaultProps} sort="created_at" onReshuffle={onReshuffle} />);
    openSortMenu();
    expect(screen.queryByText("Reshuffle")).not.toBeInTheDocument();
  });

  it("does not offer reshuffle when onReshuffle is not provided", () => {
    render(<FolderToolbar {...defaultProps} sort="random" />);
    openSortMenu();
    expect(screen.queryByText("Reshuffle")).not.toBeInTheDocument();
  });

  it("calls onReshuffle from the sort menu and closes it", () => {
    const onReshuffle = vi.fn();
    render(<FolderToolbar {...defaultProps} sort="random" onReshuffle={onReshuffle} />);
    openSortMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reshuffle" }));
    expect(onReshuffle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
      expect(sortControl()).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Filter/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^View/ })).not.toBeInTheDocument();
    });

    it("keeps the ways of putting something in it", () => {
      render(<FolderToolbar {...empty} onCreateFile={vi.fn()} />);
      openAddMenu();
      expect(screen.getByText("Files")).toBeInTheDocument();
      expect(screen.getByText("New Folder")).toBeInTheDocument();
      expect(screen.getByText("New Note")).toBeInTheDocument();
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
      expect(sortControl()).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^View/ })).toBeInTheDocument();
    });

    it("keeps them all when a filter is what emptied it", () => {
      // Hiding the type chip that produced the empty result would leave
      // the user with no way back to the full listing.
      render(<FolderToolbar {...empty} typeFilter="audio" />);
      expect(sortControl()).toBeInTheDocument();
      // Named by what it is filtering by, not by the word "Filter": that is
      // how the control says why the folder looks empty.
      expect(screen.getByRole("button", { name: "Filter: Audio" })).toBeInTheDocument();
    });

    it("keeps them all when a trust filter is what emptied it", () => {
      render(
        <FolderToolbar
          {...empty}
          trustFilter="unreviewed"
          onTrustFilterChange={vi.fn()}
        />,
      );
      expect(sortControl()).toBeInTheDocument();
    });

    it("keeps them all when a tag filter is what emptied it", () => {
      render(<FolderToolbar {...empty} tagFilter="recipes" />);
      expect(sortControl()).toBeInTheDocument();
    });

    it("keeps them all for an empty search", () => {
      // A search that found nothing still needs its sort and its type
      // chip: they are how the query gets widened.
      render(<FolderToolbar {...empty} isSearch />);
      expect(sortControl()).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Filter/ })).toBeInTheDocument();
    });

    it("keeps them all when the folder count is simply not known", () => {
      // Callers that never pass folderCount must behave as they did.
      const { folderCount: _ignored, ...withoutCount } = empty;
      render(<FolderToolbar {...withoutCount} />);
      expect(sortControl()).toBeInTheDocument();
    });
  });

  describe("the kinds it offers", () => {
    const kindMenu = () => {
      fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
      // Only the kind section: the trust rows follow it under their own
      // heading, and this is about the vocabulary of kinds.
      // The kind section only: `role="group"` separates the two axes now,
      // so ask for the one this is about rather than slicing a flat list.
      return within(screen.getByRole("group", { name: "File type" }))
        .getAllByRole("menuitemradio")
        .map((el) => el.textContent);
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
