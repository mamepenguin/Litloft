/**
 * spec 2026-08-21-folder-scoped-tag-filter §6 / §6.1 / §6.2
 *
 * `isFolderContext` answered three different questions with one flag, and
 * that ambiguity is what made the folder+tag gap hard to see (hako
 * a8r4bT7Wt1LQ6IBPTBm7N).
 *
 * Two predicates carry those questions now, and this file holds the line
 * between them:
 *
 * - `isFolderAnchored` — "is there a folder *path*?" A folder-scoped tag
 *   filter answers yes. Per-folder sort, view mode and pinning need a
 *   non-empty key, so they ask this one.
 * - `isWriteDestination` — "is there a place to write into?" The drive
 *   root answers yes as well, reached as a location (`folderPath === ""`),
 *   unless a tag is applied there: the listing is then the whole drive,
 *   which names no destination (spec
 *   2026-09-12-purpose-oriented-navigation §7.1, AC 10).
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
import { useShortcuts } from "@/hooks/useShortcuts";

// ---- heavy children / infrastructure ----------------------------------------

vi.mock("@/components/folder/FolderContent", () => ({
  // Draws the two doors the browser hands it and nothing else. The point
  // of the tests at the bottom of this file is *which* of them arrive and
  // what happens when one is pressed, so a stand-in that swallowed them
  // would leave both questions unasked.
  FolderContent: ({
    onAddFiles,
    onCreateFile,
    sortQuery,
    viewMode,
  }: {
    onAddFiles?: () => void;
    onCreateFile?: () => void;
    sortQuery?: string;
    viewMode?: string;
  }) => (
    <div
      data-testid="folder-content"
      data-sort-query={sortQuery}
      data-view-mode={viewMode}
    >
      {onAddFiles && <button onClick={() => onAddFiles()}>Add files</button>}
      {onCreateFile && <button onClick={() => onCreateFile()}>Empty-state new note</button>}
    </div>
  ),
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
// `handleTogglePin` is the name `FolderBrowser` destructures, and the
// pin row travels with the handler: hand back a different name and the
// control is absent for every input, which is indistinguishable from
// "the root is not pinnable" (`.claude/rules/review-workflow.md`,
// detector rule 4).
const mockTogglePin = vi.hoisted(() => vi.fn());
vi.mock("@/components/folder/usePinnedFolders", () => ({
  usePinnedFolders: () => ({
    pinnedPaths: new Set<string>(),
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
 * How many files the listing reports. The toolbar puts its sort and
 * view controls away for a listing with nothing in it at all, so tests
 * that press those controls need a listing that holds something.
 */
const listing = vi.hoisted(() => ({
  total: 0,
  folders: [] as { path: string }[],
  files: [] as { id: string; file_type: string }[],
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

const sortQueryOf = () =>
  screen.getByTestId("folder-content").getAttribute("data-sort-query");
const viewModeOf = () =>
  screen.getByTestId("folder-content").getAttribute("data-view-mode");

/**
 * How many copies of an offered control this file sees.
 *
 * `FolderToolbar` renders its `leftActions` group twice — once in normal
 * flow for widths below 768px and once on the bar from 768 up — and CSS
 * hides one. That doubling is specific to `leftActions`: the `…` trigger,
 * the pin row, Rescan and Sort are each rendered once. jsdom lays nothing
 * out, so both copies of the doubled group are in the tree and both are
 * found here.
 *
 * It is also the stand-in's count, not the product's. `AddButton` is
 * mocked to a flat row of `<button>`s; the real component keeps New
 * Folder and New Note behind a click, as menu items. What two means here
 * is "this control was offered", and zero "it was withheld" — nothing
 * about what a viewer sees.
 */
const OFFERED = 2;

const addButtons = () => screen.queryAllByRole("button", { name: "Add" });
const newFolderButtons = () =>
  screen.queryAllByRole("button", { name: "New Folder" });

/**
 * Invoke a registered shortcut's handler.
 *
 * `useShortcuts` is mocked away here, so pressing the key reaches
 * nothing: without this the `Cmd+N` gate can be reverted and every test
 * in the file stays green. The registration is `FolderBrowser`'s own
 * output, so reading it back still measures this component.
 *
 * The `enabled` argument is checked, not just the list: `useShortcuts`
 * returns early when it is false, so a group registered disabled has no
 * live keys at all, and a helper that read only the list would report a
 * handler for a key that cannot be pressed.
 *
 * What it does not measure: that the key is bound to the handler. That
 * lives in the real hook.
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
    expect(newNoteButtons()).toHaveLength(OFFERED);

    fireEvent.click(newNoteButtons()[0]);
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
    expect(newNoteButtons()).toHaveLength(OFFERED);
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

/**
 * The empty folder's own doors, and the picker behind one of them.
 *
 * `FolderBrowser` owns the hidden `<input>` and `FolderContent` owns the
 * button several components away, so "the prop was passed" is not the
 * question — the question is whether pressing it reaches the file chooser.
 * The header of this file makes the same argument about creation being
 * gated twice.
 */
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

  it("offers both doors on an anchored folder", () => {
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect(addFilesButton()).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Empty-state new note" }),
    ).toBeInTheDocument();
  });

  // The same gate the toolbar uses. A view with no concrete folder has
  // nowhere to put a file, and offering the door anyway would upload into
  // whatever the last folder happened to be.
  it.each([
    ["a special view", { driveName: "main", view: "favorites" as const }],
    ["a search", { driveName: "main", searchQuery: "cake" }],
    ["the drive root", { driveName: "main" }],
  ])("offers neither in %s", (_case, props) => {
    render(<FolderBrowser {...props} />);
    expect(screen.queryByRole("button", { name: "Add files" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Empty-state new note" }),
    ).toBeNull();
  });
});

/**
 * `nav=folder` is what lets the detail pane draw an `n / N` and walk the
 * folder's own order. The claim it makes is "the rows on screen are this
 * folder, in this order, and nothing else" — which the Library root now
 * satisfies: its rows are the drive root's children, and
 * `RootFileListing` already says the same of the same request.
 */
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

  // A flat view carrying a folder path is not a state the router builds,
  // but it is the one the `!isSpecialView` conjunct exists for, and
  // without a case the conjunct is held only by a scan for its own
  // spelling.
  it("withholds it from a flat view even when a folder path comes with it", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="favorites" />);
    expect(sortQueryOf()).not.toContain("nav=folder");
  });

  it("withholds it where there is no folder to stand in", () => {
    render(<FolderBrowser driveName="main" tagFilter="soup" />);
    expect(sortQueryOf()).not.toContain("nav=folder");
  });
});

/**
 * spec 2026-09-12-purpose-oriented-navigation §7.1 / AC 10 — the drive
 * root is a concrete write destination that is deliberately not
 * pinnable, and a tag applied there is not a destination at all.
 *
 * The write targets needed no change to reach the root: `useCreateFile`,
 * `useCreateFolder`, `clipboard.paste` and `UploadZone` all already
 * resolve an absent folder path to `""`. Of those, the first two are
 * measured here. The last two are **not gated by either predicate** —
 * paste and drop are offered everywhere except search and write into the
 * root from views that name no destination — which predates this and is
 * not settled by it.
 *
 * `folderPath === ""` is what names the root, and only the route's
 * Library branch supplies it. A `FolderBrowser` with no folder path at
 * all is a listing that names no location, which is the last case below.
 */
describe("FolderBrowser — the drive root as a write destination", () => {
  // `useViewModeState` reads the global view-mode preference from
  // localStorage on mount and `select` writes it, so this isolates the
  // describe from that key rather than from an effect observed here.
  beforeEach(() => {
    localStorage.clear();
  });

  it("offers the whole mutating group", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(newNoteButtons()).toHaveLength(OFFERED);
    expect(addButtons()).toHaveLength(OFFERED);
    expect(newFolderButtons()).toHaveLength(OFFERED);
  });

  it("creates a file into the drive root", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    fireEvent.click(newNoteButtons()[0]);
    expect(mockCreateFile).toHaveBeenCalledWith("main", "");
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

  it("offers both of the empty state's doors", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(screen.getByRole("button", { name: "Add files" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Empty-state new note" }),
    ).toBeInTheDocument();
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
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    fireEvent.click(screen.getAllByRole("button", { name: "More actions" })[0]);
    expect(
      screen.getByRole("menuitem", { name: "Pin this folder" }),
    ).toBeInTheDocument();
  });

  // Library is the hierarchy seen from its top, not a view that cuts
  // across it, so it keeps what the flat views lose.
  it("keeps Play All, which a flat virtual view does not", () => {
    listing.total = 1;
    listing.files = [{ id: "v1", file_type: "video" }];
    const { unmount } = render(
      <FolderBrowser driveName="main" folderPath="" view="library" />,
    );
    expect(screen.queryAllByRole("button", { name: /Play/ }).length).toBe(1);
    unmount();
    render(<FolderBrowser driveName="main" view="favorites" />);
    expect(screen.queryAllByRole("button", { name: /Play/ })).toHaveLength(0);
  });

  // A tag applied at the root widens the listing to the whole drive, so
  // there is no folder under it to write into — the same rule that
  // withholds them in a flat view.
  it("withholds everything when a tag is applied at the root", () => {
    render(<FolderBrowser driveName="main" folderPath="" view="library" tagFilter="soup" />);
    expect(newNoteButtons()).toHaveLength(0);
    expect(addButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add files" })).toBeNull();
    expect(() => pressShortcut("ctrl+n")).not.toThrow();
    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  it("withholds everything where there is no folder path at all", () => {
    render(<FolderBrowser driveName="main" />);
    expect(newNoteButtons()).toHaveLength(0);
    expect(addButtons()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add files" })).toBeNull();
  });

  it("leaves that key inert where there is nowhere to write", () => {
    render(<FolderBrowser driveName="main" view="favorites" />);
    pressShortcut("ctrl+n");
    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  // Which of two stores the root reads. `useFolderViewMode` — the
  // per-folder one — is stubbed to "list" throughout this file, so
  // setting the single global preference names the store the mode came
  // from. The root having no per-folder key is the documented rule
  // (`docs/user-guide/file-browsing.md`: the drive root, the flat views
  // and search "fall back to a single global preference").
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

  // Both halves of "session-local": the per-folder store is not written,
  // *and* the choice takes effect on the listing. Without the second the
  // root's sort control could be made inert and nothing would fail.
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
