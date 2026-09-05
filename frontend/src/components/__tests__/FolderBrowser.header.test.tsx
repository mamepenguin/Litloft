/**
 * The folder and search page header.
 *
 * The two modes used to render separate rows that happened to line up — a
 * `<header>` for search and a bare `<div>` for a folder — and they stated the
 * item count in different places: search in the header, a folder in the
 * toolbar. This is where that one fact now lives for both.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";

// ---- heavy children / infrastructure ----------------------------------------

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));
vi.mock("@/components/Breadcrumb", () => ({
  Breadcrumb: (props: Record<string, unknown>) => (
    <nav
      aria-label="Breadcrumb"
      data-drive={String(props.driveName ?? "")}
      data-folder={String(props.folderPath ?? "")}
      data-drop-props={props.getDropTargetProps ? "yes" : "no"}
      data-drop-target={props.isDropTarget ? "yes" : "no"}
    >
      trail
    </nav>
  ),
}));
vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle">tree</button>,
}));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderSaveButton: () => <button>Save search</button>,
}));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) => <div data-testid={`slot-${id}`} />,
}));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SortButton", () => ({
  SortButton: ({ onChange }: { onChange: (s: string, o: string) => void }) => (
    <button data-testid="sort-button" onClick={() => onChange("file_size", "asc")}>
      Sort
    </button>
  ),
}));
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));

/** What the listing reports, and whether it is still fetching. */
const listing = vi.hoisted(() => ({
  total: 0,
  loading: false,
  folders: [] as { path: string }[],
}));

vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [],
    get folders() {
      return listing.folders;
    },
    get total() {
      return listing.total;
    },
    get loading() {
      return listing.loading;
    },
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

// Stubbed like the rest: this file is about the header, and the per-folder
// preference hooks only matter to the toolbar below it.
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title" as const, order: "asc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "list" as const, setViewMode: vi.fn() }),
}));


// ---- the header --------------------------------------------------------------

function renderFolder(props: { searchQuery?: string } = {}) {
  return render(
    <FolderBrowser driveName="main" folderPath="videos" {...props} />,
  );
}

describe("the folder header", () => {
  beforeEach(() => {
    listing.total = 42;
    listing.folders = [];
  });

  it("names the folder with its trail and no heading", () => {
    renderFolder();
    expect(screen.getByLabelText("Breadcrumb")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("states the count, which the toolbar no longer does", () => {
    renderFolder();
    expect(screen.getAllByText("42 items")).toHaveLength(1);
  });

  // Phase 0.5 (E-2) puts the arranging controls away for an empty folder but
  // keeps the count. Moving the count to the header had to preserve that.
  it("keeps the count when the folder is empty", () => {
    listing.total = 0;
    renderFolder();
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("keeps the tree toggle leftmost", () => {
    const { container } = renderFolder();
    const firstRow = container.querySelector("header > div")!;
    expect(firstRow.firstElementChild?.getAttribute("data-testid")).toBe("tree-toggle");
  });
});

describe("the search header", () => {
  beforeEach(() => {
    listing.total = 42;
    listing.folders = [];
  });

  it("names the search in a heading, since there is no trail to name it", () => {
    renderFolder({ searchQuery: "cats" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/cats/);
    expect(screen.queryByLabelText("Breadcrumb")).toBeNull();
  });

  it("states the count exactly once", () => {
    renderFolder({ searchQuery: "cats" });
    expect(screen.getAllByText("42 items")).toHaveLength(1);
  });

  it("keeps the save-search action and the addon slot", () => {
    renderFolder({ searchQuery: "cats" });
    expect(screen.getByRole("button", { name: "Save search" })).toBeInTheDocument();
    expect(screen.getByTestId("slot-search-modes")).toBeInTheDocument();
  });

  // The comment on the header calls out that the tree toggle sits at the same
  // height in folder, file and search mode alike — and search mode had no
  // assertion at all: removing the toggle there, or moving it off the start of
  // the row, both left the suite green.
  it("keeps the tree toggle, leftmost, in search mode too", () => {
    const { container } = renderFolder({ searchQuery: "cats" });
    const firstRow = container.querySelector("header > div")!;
    expect(firstRow.firstElementChild?.getAttribute("data-testid")).toBe(
      "tree-toggle",
    );
  });

  it("offers neither of those outside search mode", () => {
    renderFolder();
    expect(screen.queryByRole("button", { name: "Save search" })).toBeNull();
    expect(screen.queryByTestId("slot-search-modes")).toBeNull();
  });
});

describe("the count while a refetch is in flight", () => {
  beforeEach(() => {
    listing.total = 42;
    listing.loading = false;
    listing.folders = [];
  });

  // A refetch sets `total` to 0 and `loading` to true together, so the raw
  // values are a false "0 items" and a blank. The old toolbar showed the
  // false count; gating on `loading` alone made it vanish and reflow the
  // breadcrumb beside it. Neither is what the header does now.
  it("keeps the last known count while loading", () => {
    const { rerender } = renderFolder();
    expect(screen.getByText("42 items")).toBeInTheDocument();
    listing.loading = true;
    listing.total = 0;
    rerender(<FolderBrowser driveName="main" folderPath="videos" />);
    expect(screen.getByText("42 items")).toBeInTheDocument();
    expect(screen.queryByText("0 items")).toBeNull();
  });

  it("states nothing before the first count is known", () => {
    listing.loading = true;
    listing.total = 0;
    renderFolder();
    expect(screen.queryByText(/\d+ items/)).toBeNull();
  });

  it("takes the new count once the refetch settles", () => {
    const { rerender } = renderFolder();
    listing.loading = true;
    listing.total = 0;
    rerender(<FolderBrowser driveName="main" folderPath="videos" />);
    listing.loading = false;
    listing.total = 7;
    rerender(<FolderBrowser driveName="main" folderPath="videos" />);
    expect(screen.getByText("7 items")).toBeInTheDocument();
    expect(screen.queryByText("42 items")).toBeNull();
  });
});

describe("what the header hands the breadcrumb", () => {
  beforeEach(() => {
    listing.total = 42;
    listing.loading = false;
    listing.folders = [];
  });

  it("passes the drive and folder it was given", () => {
    renderFolder();
    const trail = screen.getByLabelText("Breadcrumb");
    expect(trail.getAttribute("data-drive")).toBe("main");
    expect(trail.getAttribute("data-folder")).toBe("videos");
  });

  // The drop handlers are attached only while something is being dragged.
  // Handing a live drop target to the trail at rest was expressible and
  // unnoticed: the condition could be removed, inverted or reduced to one of
  // its two terms with nothing failing.
  it("withholds the drop handlers when nothing is being dragged", () => {
    renderFolder();
    const trail = screen.getByLabelText("Breadcrumb");
    expect(trail.getAttribute("data-drop-props")).toBe("no");
    expect(trail.getAttribute("data-drop-target")).toBe("no");
  });
});
