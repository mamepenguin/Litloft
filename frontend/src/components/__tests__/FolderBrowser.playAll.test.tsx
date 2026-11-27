/**
 * SPEC-CORE-191 step 1: a folder's Play all opens the queue's first file on
 * the folder's own page with `queue=folder`.
 */

import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";
import { installWireFetch, pagedListing } from "@/__tests__/helpers/wireFetch";

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
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SmartFolderMenuItems: () => null,
  SmartFolderOverwriteButton: () => null,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({
  AddButton: ({ onCreateFolder }: { onCreateFolder?: () => void }) => (
    <>
      <button>Add</button>
      {onCreateFolder && (
        <button onClick={() => onCreateFolder()}>New Folder</button>
      )}
    </>
  ),
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/drive/main/movies",
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
const mockTogglePin = vi.hoisted(() => vi.fn());
const pinnedPaths = vi.hoisted(() => new Set<string>(["recipes"]));
vi.mock("@/components/folder/usePinnedFolders", () => ({
  usePinnedFolders: () => ({
    pinnedPaths,
    homePaths: new Set<string>(),
    handleTogglePin: mockTogglePin,
    handleToggleHome: vi.fn(),
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

const folderSort = vi.hoisted(() => ({ sort: "title" as string, order: "asc" as string }));
const mockSetSort = vi.fn();
const mockSetViewMode = vi.fn();
const folderSortCalls: { drive: string; folderPath: string }[] = [];
const folderViewModeCalls: { drive: string; folderPath: string }[] = [];
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: ({ drive, folderPath }: { drive: string; folderPath: string }) => {
    folderSortCalls.push({ drive, folderPath });
    return { sort: folderSort.sort, order: folderSort.order, setSort: mockSetSort };
  },
  useFolderViewMode: ({ drive, folderPath }: { drive: string; folderPath: string }) => {
    folderViewModeCalls.push({ drive, folderPath });
    return { viewMode: "list" as const, setViewMode: mockSetViewMode };
  },
}));


type Row = { id: string; filename: string; file_type: string; title?: string };

function listed(rows: Row[]) {
  listing.files = rows;
  listing.total = rows.length;
}

function playTarget(): URL {
  const calls = [...mockPush.mock.calls, ...mockReplace.mock.calls].map((c) => String(c[0]));
  const target = calls.find((t) => /[?&]queue=/.test(t) || t.includes("folder_play"));
  if (!target) throw new Error(`no playback navigation among ${JSON.stringify(calls)}`);
  return new URL(target, "http://localhost");
}

const playAll = () => fireEvent.click(screen.getByRole("button", { name: /^Play/ }));

beforeEach(() => {
  vi.clearAllMocks();
  folderSort.sort = "title";
  folderSort.order = "asc";
  listing.total = 0;
  listing.folders = [];
  listing.files = [];
  sessionStorage.clear();
  installWireFetch((call) => {
    const types = call.url.searchParams.getAll("type");
    return pagedListing(
      listing.files.filter((f) => types.length === 0 || types.includes(f.file_type)),
      call,
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-191 step 1 / I15 Play all opens the folder queue on the folder's own page", () => {
  it("selects the first video or audio with queue=folder and the folder's sort and order", async () => {
    listed([
      { id: "i1", filename: "i1.png", file_type: "image" },
      { id: "v1", filename: "v1.mp4", file_type: "video" },
      { id: "a1", filename: "a1.mp3", file_type: "audio" },
    ]);
    render(<FolderBrowser driveName="main" folderPath="movies" />);
    playAll();
    await waitFor(() => expect(() => playTarget()).not.toThrow());
    const url = playTarget();
    expect(url.pathname).toBe("/drive/main/movies");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      file: "v1",
      queue: "folder",
      sort: "title",
      order: "asc",
    });
  });

  it("uses the drive's own page for the root folder", async () => {
    listed([{ id: "v1", filename: "v1.mp4", file_type: "video" }]);
    render(<FolderBrowser driveName="main" folderPath="" />);
    playAll();
    await waitFor(() => expect(() => playTarget()).not.toThrow());
    const url = playTarget();
    expect(url.pathname).toBe("/drive/main");
    expect(url.searchParams.get("queue")).toBe("folder");
    expect(url.searchParams.get("file")).toBe("v1");
  });

  it("under a random sort, stores the shown order of the video and audio for the tab and carries sort=random", async () => {
    folderSort.sort = "random";
    folderSort.order = "desc";
    listed([
      { id: "a7", filename: "a7.mp3", file_type: "audio" },
      { id: "i1", filename: "i1.png", file_type: "image" },
      { id: "v3", filename: "v3.mp4", file_type: "video" },
      { id: "v2", filename: "v2.mp4", file_type: "video" },
    ]);
    render(<FolderBrowser driveName="main" folderPath="movies" />);
    playAll();
    await waitFor(() => expect(() => playTarget()).not.toThrow());
    const url = playTarget();
    expect(url.pathname).toBe("/drive/main/movies");
    expect(url.searchParams.get("queue")).toBe("folder");
    expect(url.searchParams.get("sort")).toBe("random");
    expect(url.searchParams.get("file")).toBe("a7");
    const stored = sessionStorage.getItem("folder-queue:main:movies");
    expect(stored).not.toBeNull();
    const at = (id: string) => stored!.indexOf(id);
    expect(at("a7")).toBeGreaterThanOrEqual(0);
    expect(at("a7")).toBeLessThan(at("v3"));
    expect(at("v3")).toBeLessThan(at("v2"));
    expect(at("i1")).toBe(-1);
  });

  it("does not store an order when the sort is not random", async () => {
    listed([{ id: "v1", filename: "v1.mp4", file_type: "video" }]);
    render(<FolderBrowser driveName="main" folderPath="movies" />);
    playAll();
    await waitFor(() => expect(() => playTarget()).not.toThrow());
    expect(playTarget().searchParams.get("queue")).toBe("folder");
    expect(sessionStorage.getItem("folder-queue:main:movies")).toBeNull();
  });
});
