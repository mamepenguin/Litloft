/**
 * These assertions go through FolderBrowser rather than the toolbar alone
 * because creation is gated twice: FolderBrowser decides what to pass, and
 * FolderToolbar decides whether to render the group at all.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";
import { useShortcuts } from "@/hooks/useShortcuts";

// ---- heavy children / infrastructure ----------------------------------------

const folderContentHandlers = vi.hoisted(() => ({ names: [] as string[] }));

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: (props: { onAddFiles?: () => void; sortQuery?: string; viewMode?: string }) => {
    folderContentHandlers.names = Object.keys(props).filter((k) => /^on[A-Z]/.test(k));
    const { onAddFiles, sortQuery, viewMode } = props;
    return (
      <div
        data-testid="folder-content"
        data-sort-query={sortQuery}
        data-view-mode={viewMode}
      >
        {onAddFiles && <button onClick={() => onAddFiles()}>Add files</button>}
      </div>
    );
  },
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
  AddButton: ({ onCreateFolder }: { onCreateFolder?: () => void }) => (
    <>
      <button>Add</button>
      {onCreateFolder && (
        // Called with no arguments, as `ActionMenuItem` calls it: the handler
        // expects a name, not a click event.
        <button onClick={() => onCreateFolder()}>New Folder</button>
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
// `handleTogglePin` is the name `FolderBrowser` destructures: under a
// different name the pin row is absent for every input, which looks the same
// as "the root is not pinnable".
const mockTogglePin = vi.hoisted(() => vi.fn());
// A pinned folder has to be in here, or "Pin" and "Unpin" cannot be told
// apart.
const pinnedPaths = vi.hoisted(() => new Set<string>(["recipes"]));
vi.mock("@/components/folder/usePinnedFolders", () => ({
  usePinnedFolders: () => ({
    pinnedPaths,
    handleTogglePin: mockTogglePin,
  }),
}));
vi.mock("@/components/folder/useDriveScan", () => ({
  useDriveScan: () => ({ scanning: false, handleScan: vi.fn() }),
}));
const mockUseCreateFolder = vi.hoisted(() => vi.fn());
vi.mock("@/components/folder/useCreateFolder", () => ({
  useCreateFolder: (...args: unknown[]) => (mockUseCreateFolder(...args), {
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
 * The toolbar puts its sort and view controls away for an empty listing, so
 * tests that press those controls need a listing that holds something.
 */
const listing = vi.hoisted(() => ({
  total: 0,
  folders: [] as { path: string }[],
  files: [] as { id: string; filename: string; file_type: string }[],
}));

vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    get files() {
      return listing.files;
    },
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

const sortQueryOf = () =>
  screen.getByTestId("folder-content").getAttribute("data-sort-query");
const viewModeOf = () =>
  screen.getByTestId("folder-content").getAttribute("data-view-mode");

/**
 * `FolderToolbar` renders its `leftActions` group twice, one per breakpoint,
 * and CSS hides one.
 */
const OFFERED = 2;

const addButtons = () => screen.queryAllByRole("button", { name: "Add" });
const newFolderButtons = () =>
  screen.queryAllByRole("button", { name: "New Folder" });

/**
 * The `enabled` argument is checked as well as the list: a group registered
 * disabled has no live keys at all.
 */
function pressShortcut(key: string) {
  const groups = vi.mocked(useShortcuts).mock.calls.filter(
    (call) => call[3] === undefined || call[3] === true,
  );
  const hit = groups
    .flatMap((call) => (Array.isArray(call[2]) ? call[2] : []))
    .find((s) => (s as { key?: string }).key === key) as
    | { handler: () => void }
    | undefined;
  if (!hit) throw new Error(`no enabled shortcut registered for ${key}`);
  hit.handler();
}

beforeEach(() => {
  vi.clearAllMocks();
  folderSortCalls.length = 0;
  folderViewModeCalls.length = 0;
  listing.total = 0;
  listing.folders = [];
  listing.files = [];
});

// ---- tests -------------------------------------------------------------------

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
  it("creates a file into the anchored folder from the keyboard", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" tagFilter="soup" />);
    pressShortcut("ctrl+n");
    expect(mockCreateFile).toHaveBeenCalledWith("main", "recipes");
  });

  it("offers the add menu and new-folder during a folder tag filter", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" tagFilter="soup" />);
    expect(addButtons()).toHaveLength(OFFERED);
    expect(newFolderButtons()).toHaveLength(OFFERED);
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
    render(<FolderBrowser driveName="main" tagFilter="soup" />);
    expect(
      screen.queryByRole("link", { name: "Search the whole drive" }),
    ).not.toBeInTheDocument();
  });

  it("leaves create-file inert in a special view", () => {
    render(<FolderBrowser driveName="main" view="favorites" />);
    pressShortcut("ctrl+n");
    expect(mockCreateFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("leaves create-file inert in search mode", () => {
    render(<FolderBrowser driveName="main" searchQuery="kyoto" />);
    pressShortcut("ctrl+n");
    expect(mockCreateFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("leaves create-file inert for a drive-root tag filter", () => {
    render(<FolderBrowser driveName="main" tagFilter="soup" />);
    pressShortcut("ctrl+n");
    expect(mockCreateFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("still creates a file for a plain folder listing", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    pressShortcut("ctrl+n");
    expect(mockCreateFile).toHaveBeenCalledWith("main", "recipes");
  });
});

describe("FolderBrowser — what the toolbar is told about emptiness", () => {
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

describe("FolderBrowser — the empty folder's own doors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const addFilesButton = () => screen.getByRole("button", { name: "Add files" });

  it("opens the file chooser when the empty state asks for files", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const clicked = vi.fn();
    input!.addEventListener("click", clicked);

    fireEvent.click(addFilesButton());
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("offers Add files on an anchored folder", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect(addFilesButton()).toBeInTheDocument();
  });

  it("hands the listing no way to create a note", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect([...folderContentHandlers.names].sort()).toEqual(
      [
        "onAddFiles",
        "onSelect",
        "onMetaSelect",
        "onShiftSelect",
        "onTogglePin",
        "onFavoriteToggle",
        "onRefresh",
        "onDragStart",
        "onDragEnd",
        "onFolderDragStart",
      ].sort(),
    );
  });

  it.each([
    ["a special view", { driveName: "main", view: "favorites" as const }],
    ["a search", { driveName: "main", searchQuery: "cake" }],
    ["the drive root", { driveName: "main" }],
  ])("offers neither in %s", (_case, props) => {
    render(<FolderBrowser {...props} />);
    expect(screen.queryByRole("button", { name: "Add files" })).toBeNull();
  });
});

describe("FolderBrowser — which listings may be counted", () => {
  it("marks the Library root, whose rows are the root folder's own", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(sortQueryOf()).toContain("nav=folder");
  });

  it("marks a named folder", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect(sortQueryOf()).toContain("nav=folder");
  });

  it("withholds it from a flat view, whose rows are not one folder's", () => {
    render(<FolderBrowser driveName="main" view="favorites" />);
    expect(sortQueryOf()).not.toContain("nav=folder");
  });

  // A flat view carrying a folder path is not a state the router builds, but
  // it is the one the `!isSpecialView` conjunct exists for.
  it("withholds it from a flat view even when a folder path comes with it", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="favorites" />);
    expect(sortQueryOf()).not.toContain("nav=folder");
  });

  it("withholds it where there is no folder to stand in", () => {
    render(<FolderBrowser driveName="main" tagFilter="soup" />);
    expect(sortQueryOf()).not.toContain("nav=folder");
  });
});

describe("FolderBrowser — the drive root as a write destination", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("offers the whole mutating group", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(addButtons()).toHaveLength(OFFERED);
    expect(newFolderButtons()).toHaveLength(OFFERED);
  });

  it("creates a file into the drive root from the keyboard too", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    pressShortcut("ctrl+n");
    expect(mockCreateFile).toHaveBeenCalledWith("main", "");
  });

  it("creates a folder into the drive root", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(mockUseCreateFolder).toHaveBeenCalledWith("main", "", expect.any(Function));
  });

  it("offers the empty state's Add files", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(screen.getByRole("button", { name: "Add files" })).toBeInTheDocument();
  });

  it("is not pinnable", () => {
    listing.total = 3;
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    fireEvent.click(screen.getAllByRole("button", { name: "More actions" })[0]);
    expect(
      screen.queryByRole("menuitem", { name: "Pin this folder" }),
    ).toBeNull();
  });

  it("is pinnable in a named folder, which is what makes the line a line", () => {
    listing.total = 3;
    render(<FolderBrowser driveName="main" folderPath="photos" />);
    fireEvent.click(screen.getAllByRole("button", { name: "More actions" })[0]);
    expect(
      screen.getByRole("menuitem", { name: "Pin this folder" }),
    ).toBeInTheDocument();
  });

  it("names the flip it is actually making", () => {
    listing.total = 3;
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    fireEvent.click(screen.getAllByRole("button", { name: "More actions" })[0]);
    expect(
      screen.getByRole("menuitem", { name: "Unpin this folder" }),
    ).toBeInTheDocument();
  });

  it("keeps Play All, which a flat virtual view does not", () => {
    listing.total = 1;
    listing.files = [{ id: "v1", filename: "v1.mp4", file_type: "video" }];
    const { unmount } = render(
      <FolderBrowser driveName="main" folderPath="" view="library" />,
    );
    expect(screen.queryAllByRole("button", { name: /Play/ }).length).toBe(1);
    unmount();
    render(<FolderBrowser driveName="main" view="favorites" />);
    expect(screen.queryAllByRole("button", { name: /Play/ })).toHaveLength(0);
  });

  it("withholds everything when a tag is applied at the root", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" tagFilter="soup" />);
    expect(addButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add files" })).toBeNull();
    expect(() => pressShortcut("ctrl+n")).not.toThrow();
    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  it("withholds everything where there is no folder path at all", () => {
    render(<FolderBrowser driveName="main" />);
    expect(addButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add files" })).toBeNull();
    pressShortcut("ctrl+n");
    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  it("leaves that key inert where there is nowhere to write", () => {
    render(<FolderBrowser driveName="main" view="favorites" />);
    pressShortcut("ctrl+n");
    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  // `useFolderViewMode` is stubbed to "list" throughout this file, so the
  // global preference names the store the mode came from.
  it("draws the rows in the single global preference", () => {
    localStorage.setItem("video-share-view-mode", "grid");
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(viewModeOf()).toBe("grid");
  });

  it("follows that preference when it is the other one", () => {
    localStorage.setItem("video-share-view-mode", "list");
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(viewModeOf()).toBe("list");
  });

  it("draws a named folder's rows in its own stored mode instead", () => {
    localStorage.setItem("video-share-view-mode", "grid");
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect(viewModeOf()).toBe("list");
  });

  it("keeps sort session-local at the root, and lets it take effect", () => {
    listing.total = 3;
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    chooseSort("Size smallest");
    expect(mockSetSort).not.toHaveBeenCalled();
    expect(sortQueryOf()).toContain("sort=file_size");
    expect(sortQueryOf()).toContain("order=asc");
  });

  it("keeps view mode session-local at the root, and lets it take effect", () => {
    listing.total = 3;
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    chooseView("List view");
    expect(mockSetViewMode).not.toHaveBeenCalled();
    expect(viewModeOf()).toBe("list");
  });

  it("offers no widening link, the listing already being drive-wide", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" tagFilter="soup" />);
    expect(
      screen.queryByRole("link", { name: "Search the whole drive" }),
    ).not.toBeInTheDocument();
  });
});
