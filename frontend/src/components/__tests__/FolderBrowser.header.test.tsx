/**
 * The folder and search page header.
 *
 * The two modes used to render separate rows that happened to line up — a
 * `<header>` for search and a bare `<div>` for a folder — and they stated the
 * item count in different places: search in the header, a folder in the
 * toolbar. This is where that one fact now lives for both.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";

// ---- heavy children / infrastructure ----------------------------------------

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));
vi.mock("@/components/Breadcrumb", () => ({
  Breadcrumb: () => <nav aria-label="Breadcrumb">trail</nav>,
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

  it("offers neither of those outside search mode", () => {
    renderFolder();
    expect(screen.queryByRole("button", { name: "Save search" })).toBeNull();
    expect(screen.queryByTestId("slot-search-modes")).toBeNull();
  });
});
