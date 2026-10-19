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
// would make the Add menu's addon rows unreachable from this file.
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: () => true }),
}));

const openAddMenu = () => {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
};

const sortControl = () => screen.queryByRole("button", { name: /^Sort/ });

const openSortMenu = () => fireEvent.click(sortControl()!);

const defaultProps = {
  isSpecialView: false,
  isWriteDestination: true,
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
    render(<FolderToolbar {...defaultProps} />);
    screen
      .getAllByRole("button", { name: "Add" })
      .forEach((b) => fireEvent.click(b));
    expect(addonSlotIds).not.toContain("folder-actions");
    expect(addonSlotIds).toContain("folder-actions-menu");
    expect(addonSlotIds.every((id) => id === "folder-actions-menu")).toBe(true);
  });

  describe("the add menu's addon slot", () => {
    const menuSlots = () =>
      addonSlotProps.filter((s) => s.id === "folder-actions-menu");

    // The slot is only asked for once the menu is open.
    const openEvery = () =>
      screen
        .getAllByRole("button", { name: "Add" })
        .forEach((b) => fireEvent.click(b));

    it("is asked for once, when the menu opens", () => {
      render(<FolderToolbar {...defaultProps} />);
      expect(menuSlots()).toHaveLength(0);
      openEvery();
      expect(menuSlots()).toHaveLength(1);
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
        surface: "library",
      });
    });

    it("says the drive root with an empty path, not undefined", () => {
      render(<FolderToolbar {...defaultProps} />);
      openEvery();
      expect(menuSlots()[0].props.path).toBe("");
      expect(menuSlots()[0].props.surface).toBe("library");
    });

    it("is not offered where there is no folder to write into", () => {
      render(
        <FolderToolbar {...defaultProps} isSearch isWriteDestination={false} />,
      );
      expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
      expect(menuSlots()).toHaveLength(0);
    });
  });

  it("puts upload and new folder behind one add menu", () => {
    render(<FolderToolbar {...defaultProps} />);
    expect(screen.queryByText("Files")).not.toBeInTheDocument();
    expect(screen.queryByText("New Folder")).not.toBeInTheDocument();
    openAddMenu();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Folder")).toBeInTheDocument();
    expect(screen.getByText("New Folder")).toBeInTheDocument();
  });

  it("offers no note row of its own in the add menu", () => {
    render(<FolderToolbar {...defaultProps} />);
    openAddMenu();
    const menu = screen.getAllByRole("menu")[0];
    const rows = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((r) => r.textContent?.trim());
    expect(rows).toEqual(["Files", "Folder", "New Folder"]);
  });

  it("hides the add menu entirely in special view", () => {
    render(
      <FolderToolbar
        {...defaultProps}
        isSpecialView={true}
        isWriteDestination={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("shows upload and new folder during a folder-anchored tag filter", () => {
    render(
      <FolderToolbar
        {...defaultProps}
        tagFilter="nature"
        folderPath="recipes"
        isWriteDestination={true}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Add" }).length).toBeGreaterThan(0);
    openAddMenu();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("New Folder")).toBeInTheDocument();
  });

  it("hides the add menu for a tag filter with no folder anchor", () => {
    render(
      <FolderToolbar {...defaultProps} tagFilter="nature" isWriteDestination={false} />,
    );
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("hides the add menu in search mode", () => {
    render(<FolderToolbar {...defaultProps} isSearch={true} isWriteDestination={false} />);
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

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
      render(<FolderToolbar {...empty} />);
      openAddMenu();
      expect(screen.getByText("Files")).toBeInTheDocument();
      expect(screen.getByText("New Folder")).toBeInTheDocument();
    });

    it("still hands the add menu's addon rows the folder", () => {
      render(<FolderToolbar {...empty} folderPath="recipes/soup" />);
      screen
        .getAllByRole("button", { name: "Add" })
        .forEach((b) => fireEvent.click(b));
      const slots = addonSlotProps.filter((s) => s.id === "folder-actions-menu");
      expect(slots).toHaveLength(1);
      for (const slot of slots) {
        expect(slot.props).toMatchObject({
          drive: "test-drive",
          path: "recipes/soup",
          surface: "library",
        });
      }
    });

    it("keeps the way back to a rescan", () => {
      render(<FolderToolbar {...empty} />);
      expect(screen.getByLabelText("More actions")).toBeInTheDocument();
    });

    it("keeps them all when only the files are gone", () => {
      render(<FolderToolbar {...empty} folderCount={8} />);
      expect(sortControl()).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^View/ })).toBeInTheDocument();
    });

    it("keeps them all when a filter is what emptied it", () => {
      render(<FolderToolbar {...empty} typeFilter="audio" />);
      expect(sortControl()).toBeInTheDocument();
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
      render(<FolderToolbar {...empty} isSearch />);
      expect(sortControl()).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Filter/ })).toBeInTheDocument();
    });

    it("keeps them all when the folder count is simply not known", () => {
      const { folderCount: _ignored, ...withoutCount } = empty;
      render(<FolderToolbar {...withoutCount} />);
      expect(sortControl()).toBeInTheDocument();
    });
  });

  describe("the kinds it offers", () => {
    const kindMenu = () => {
      fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
      return within(screen.getByRole("group", { name: "File type" }))
        .getAllByRole("menuitemradio")
        .map((el) => el.textContent);
    };

    it("offers the whole vocabulary in a folder", () => {
      render(<FolderToolbar {...defaultProps} />);
      expect(kindMenu()).toEqual([
        "All", "Video", "Image", "Audio", "Document", "Text", "PDF",
        "Archive", "Other",
      ]);
    });

    it("offers the same vocabulary in search", () => {
      render(<FolderToolbar {...defaultProps} isSearch />);
      expect(kindMenu()).toEqual([
        "All", "Video", "Image", "Audio", "Document", "Text", "PDF",
        "Archive", "Other",
      ]);
    });
  });
});
