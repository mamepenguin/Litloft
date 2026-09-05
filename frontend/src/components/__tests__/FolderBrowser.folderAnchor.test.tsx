/**
 * spec 2026-08-21-folder-scoped-tag-filter §6 / §6.1 / §6.2
 *
 * `isFolderContext` answered three different questions with one flag, and
 * that ambiguity is what made the folder+tag gap hard to see (hako
 * a8r4bT7Wt1LQ6IBPTBm7N). It is now `isFolderAnchored` — "is there a
 * concrete folder we are anchored to?" — which a folder-scoped tag filter
 * answers yes.
 *
 * These assertions go through FolderBrowser rather than the toolbar alone
 * on purpose: creation is gated twice (FolderBrowser decides whether to
 * pass `onCreateFile`, FolderToolbar decides whether to render the left
 * group at all), so a test that only checks the prop was passed would pass
 * while nothing reached the screen.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";

// ---- heavy children / infrastructure ----------------------------------------

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));
vi.mock("@/components/Breadcrumb", () => ({ Breadcrumb: () => <nav /> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({ SmartFolderSaveButton: () => null }));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({
  // Stands in for the one control that puts things in a folder. It renders a
  // row per prop it is given, so a test can still see *which* of them
  // FolderBrowser decided to offer — the real menu keeps them behind a click.
  AddButton: ({
    onCreateFolder,
    onCreateFile,
  }: {
    onCreateFolder?: () => void;
    onCreateFile?: () => void;
  }) => (
    <>
      {/* Named by their text, as the real rows are: `ActionMenuItem` puts
          the label in the button's content and carries no `aria-label`, so
          a stand-in with one would let an assertion pass against a naming
          path the product does not use. */}
      <button>Add</button>
      {onCreateFolder && (
        // Called with no arguments, as `ActionMenuItem` calls it. Passing
        // the click event instead hands the handler an event where it
        // expects a name.
        <button onClick={() => onCreateFolder()}>New Folder</button>
      )}
      {onCreateFile && (
        <button onClick={() => onCreateFile()}>New Note</button>
      )}
    </>
  ),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => ({ fileId: null }) }));
vi.mock("@/hooks/useTreeEnabled", () => ({ useTreeEnabled: () => ({ enabled: false }) }));
vi.mock("@/lib/scrollContainer", () => ({ useScrollContainer: () => null }));
vi.mock("@/lib/listSnapshot", () => ({
  buildListSnapshotKey: () => "key",
  clearListSnapshot: vi.fn(),
  loadListSnapshot: () => null,
  saveListSnapshot: vi.fn(),
}));
vi.mock("@/components/folder/usePinnedFolders", () => ({
  usePinnedFolders: () => ({ pinnedPaths: new Set<string>(), togglePin: vi.fn() }),
}));
vi.mock("@/components/folder/useDriveScan", () => ({
  useDriveScan: () => ({ scanning: false, handleScan: vi.fn() }),
}));
vi.mock("@/components/folder/useCreateFolder", () => ({
  useCreateFolder: () => ({
    creatingFolder: false,
    newFolderName: "",
    folderError: null,
    setCreatingFolder: vi.fn(),
    setNewFolderName: vi.fn(),
    setFolderError: vi.fn(),
    handleCreateFolder: vi.fn(),
  }),
}));

const mockCreateFile = vi.fn();
vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: (drive: string, currentPath: string) => ({
    createFile: (target?: string) => mockCreateFile(drive, target ?? currentPath),
    isCreating: false,
  }),
}));

/**
 * How many files the listing reports. The toolbar puts its sort and
 * view controls away for a listing with nothing in it at all, so tests
 * that press those controls need a listing that holds something.
 */
const listing = vi.hoisted(() => ({ total: 0, folders: [] as { path: string }[] }));

vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [],
    get folders() {
      return listing.folders;
    },
    get total() {
      return listing.total;
    },
    loading: false,
    loadingMore: false,
    hasMore: false,
    pagesLoaded: 1,
    sentinelRef: { current: null },
    reset: vi.fn(),
    setFiles: vi.fn(),
    setPaginatedTotal: vi.fn(),
    setFolders: vi.fn(),
    isRecent: false,
    hasProfile: false,
    snapshotKey: "key",
    hydratedScrollY: null,
  }),
}));

// The real per-folder preference hooks: this file's whole point is that
// they are consulted with the anchored folder during a tag filter.
const mockSetSort = vi.fn();
const mockSetViewMode = vi.fn();
const folderSortCalls: { drive: string; folderPath: string }[] = [];
const folderViewModeCalls: { drive: string; folderPath: string }[] = [];
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: ({ drive, folderPath }: { drive: string; folderPath: string }) => {
    folderSortCalls.push({ drive, folderPath });
    return { sort: "title" as const, order: "asc" as const, setSort: mockSetSort };
  },
  useFolderViewMode: ({ drive, folderPath }: { drive: string; folderPath: string }) => {
    folderViewModeCalls.push({ drive, folderPath });
    return { viewMode: "list" as const, setViewMode: mockSetViewMode };
  },
}));

// ---- helpers -----------------------------------------------------------------

function newNoteButtons() {
  return screen.queryAllByRole("button", { name: "New Note" });
}

beforeEach(() => {
  vi.clearAllMocks();
  folderSortCalls.length = 0;
  folderViewModeCalls.length = 0;
  listing.total = 0;
  listing.folders = [];
});

// ---- tests -------------------------------------------------------------------

/**
 * The two arranging controls, driven through their real menus.
 *
 * Both used to be stand-ins here — a `data-testid` button that called
 * `onChange` directly. What that could not see is the wiring between the
 * menu and the handler, which is the half `FolderBrowser` owns: the stub
 * would have gone on passing with `SortMenu` wired to nothing.
 */
const sortTrigger = () => screen.queryAllByRole("button", { name: /^Sort/ });
const chooseSort = (row: string) => {
  fireEvent.click(sortTrigger()[0]);
  fireEvent.click(screen.getByRole("menuitemradio", { name: row }));
};
const chooseView = (row: string) => {
  fireEvent.click(screen.getAllByRole("button", { name: /^View/ })[0]);
  fireEvent.click(screen.getByRole("menuitemradio", { name: row }));
};

describe("FolderBrowser — folder anchoring during a tag filter", () => {
  it("offers create-file and targets the anchored folder", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" tagFilter="soup" />);

    // Both gates cleared: the button is actually on screen.
    expect(newNoteButtons().length).toBeGreaterThan(0);

    fireEvent.click(newNoteButtons()[0]);
    expect(mockCreateFile).toHaveBeenCalledWith("main", "recipes");
  });

  it("offers the add menu and new-folder during a folder tag filter", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" tagFilter="soup" />);
    expect(screen.getAllByRole("button", { name: "Add" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "New Folder" }).length).toBeGreaterThan(0);
  });

  it("keys per-folder sort and viewMode on the anchored folder during a tag filter", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" tagFilter="soup" />);
    expect(folderSortCalls[0]).toEqual({ drive: "main", folderPath: "recipes" });
    expect(folderViewModeCalls[0]).toEqual({ drive: "main", folderPath: "recipes" });
  });

  it("persists a sort change to the folder during a tag filter", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" tagFilter="soup" />);
    chooseSort("Size smallest");
    expect(mockSetSort).toHaveBeenCalledWith("file_size", "asc");
  });

  it("persists a viewMode change to the folder during a tag filter", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" tagFilter="soup" />);
    chooseView("List view");
    expect(mockSetViewMode).toHaveBeenCalledWith("list");
  });

  it("keeps sort and viewMode session-local in search mode", () => {
    // No folder to anchor to — the per-folder stores must stay untouched.
    render(<FolderBrowser driveName="main" searchQuery="kyoto" />);
    chooseSort("Size smallest");
    expect(mockSetSort).not.toHaveBeenCalled();

    chooseView("List view");
    expect(mockSetViewMode).not.toHaveBeenCalled();
  });

  it("keeps sort and viewMode session-local in a special view", () => {
    listing.total = 3;
    render(<FolderBrowser driveName="main" view="favorites" />);
    chooseSort("Size smallest");
    expect(mockSetSort).not.toHaveBeenCalled();
  });

  // spec §8: the door out of folder scope, offered from FolderBrowser to
  // both the toolbar header and (via FolderContent) the empty state.
  it("offers the drive-wide widening link during a folder tag filter", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" tagFilter="soup" />);
    expect(
      screen.getByRole("link", { name: "Search the whole drive" }),
    ).toHaveAttribute("href", "/drive/main?tag=soup");
  });

  it("offers no widening link for a plain folder listing", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect(
      screen.queryByRole("link", { name: "Search the whole drive" }),
    ).not.toBeInTheDocument();
  });

  it("offers no widening link for a drive-root tag filter", () => {
    // Already drive-wide — there is nothing to widen to.
    render(<FolderBrowser driveName="main" tagFilter="soup" />);
    expect(
      screen.queryByRole("link", { name: "Search the whole drive" }),
    ).not.toBeInTheDocument();
  });

  it("hides create-file in a special view", () => {
    render(<FolderBrowser driveName="main" view="favorites" />);
    expect(newNoteButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("hides create-file in search mode", () => {
    render(<FolderBrowser driveName="main" searchQuery="kyoto" />);
    expect(newNoteButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("hides create-file for a drive-root tag filter", () => {
    // No folderPath: there is no concrete folder to write into.
    render(<FolderBrowser driveName="main" tagFilter="soup" />);
    expect(newNoteButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("still offers create-file for a plain folder listing", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect(newNoteButtons().length).toBeGreaterThan(0);
  });
});

describe("FolderBrowser — what the toolbar is told about emptiness", () => {
  // The rule that puts the sort and view controls away lives in
  // FolderToolbar and is tested there. What is only testable here is
  // that FolderBrowser hands it the subfolder count: a rule that is
  // correct and unwired looks exactly like no rule at all.
  it("puts the arranging controls away for a folder with nothing in it", () => {
    listing.total = 0;
    listing.folders = [];
    render(<FolderBrowser driveName="main" folderPath="empty" />);
    expect(sortTrigger()).toHaveLength(0);
  });

  it("keeps them for a folder that holds only subfolders", () => {
    listing.total = 0;
    listing.folders = [{ path: "a" }, { path: "b" }];
    render(<FolderBrowser driveName="main" folderPath="parent" />);
    expect(sortTrigger()).toHaveLength(1);
  });
});
