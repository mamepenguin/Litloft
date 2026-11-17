import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";

const listing = vi.hoisted(() => ({
  initial: ["a", "b", "c"] as string[],
  removeContinuationFiles: vi.fn(),
}));

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: ({ files }: { files: { id: string }[] }) => (
    <div data-testid="folder-content" data-file-ids={files.map((f) => f.id).join(",")} />
  ),
}));
vi.mock("@/components/folder/FolderToolbar", () => ({
  FolderToolbar: ({ onToggleSelectable }: { onToggleSelectable: () => void }) => (
    <button onClick={() => onToggleSelectable()}>selection mode</button>
  ),
}));
vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: (p: {
    selectedIds: Set<string>;
    onSelectOnly?: (ids: string[]) => void;
    onProcessed?: (ids: string[]) => void;
  }) => (
    <div data-testid="selection-bar" data-selected={Array.from(p.selectedIds).join(",")}>
      <button onClick={() => p.onSelectOnly?.(["b", "c"])}>select b c</button>
      <button onClick={() => p.onSelectOnly?.(["b"])}>select b</button>
      <button onClick={() => p.onProcessed?.(["b"])}>processed b</button>
    </div>
  ),
}));
vi.mock("@/components/Breadcrumb", () => ({ Breadcrumb: () => <nav>trail</nav> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => <button>tree</button> }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SmartFolderMenuItems: () => null,
  SmartFolderOverwriteButton: () => null,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SortButton", () => ({ SortButton: () => null }));
vi.mock("@/components/AddButton", () => ({ AddButton: () => null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => ({ fileId: null }) }));
vi.mock("@/lib/scrollContainer", () => ({ useScrollContainer: () => null }));
vi.mock("@/lib/listSnapshot", () => ({
  buildListSnapshotKey: () => "key",
  clearListSnapshot: vi.fn(),
  loadListSnapshot: () => null,
  saveListSnapshot: vi.fn(),
}));
vi.mock("@/components/folder/usePinnedFolders", () => ({
  usePinnedFolders: () => ({
    pinnedPaths: new Set<string>(),
    homePaths: new Set<string>(),
    togglePin: vi.fn(),
    handleToggleHome: vi.fn(),
  }),
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
vi.mock("@/hooks/useIsInternalDragging", () => ({
  useIsInternalDragging: () => false,
}));
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title" as const, order: "asc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "grid" as const, setViewMode: vi.fn() }),
}));

vi.mock("@/components/folder/useFolderFiles", async () => {
  const React = await import("react");
  return {
    useFolderFiles: () => {
      const [files, setFiles] = React.useState(() =>
        listing.initial.map((id) => ({
          id,
          filename: `${id}.mp4`,
          file_type: "video" as const,
          mime_type: "video/mp4",
        })),
      );
      return {
        files,
        folders: [],
        total: files.length,
        loading: false,
        loadingMore: false,
        hasMore: false,
        pagesLoaded: 1,
        sentinelRef: { current: null },
        reset: vi.fn(),
        setFiles,
        setPaginatedTotal: vi.fn(),
        isRecent: false,
        isContinue: false,
        hasProfile: false,
        snapshotKey: "key",
        hydratedScrollY: null,
        continuationState: "hidden" as const,
        onShowMore: vi.fn(),
        continuationSentinelRef: { current: null },
        continuationDrawnIds: new Set<string>(),
        updateContinuationFile: vi.fn(),
        removeContinuationFiles: listing.removeContinuationFiles,
        passagesApplicable: false,
        passageGroups: [],
        passagesLoading: false,
        passagesFailed: false,
        retryPassages: vi.fn(),
        inNameBlocked: false,
        inNamePending: false,
        inNameState: null,
        retryInName: vi.fn(),
      };
    },
  };
});

function renderBrowser() {
  render(<FolderBrowser driveName="main" folderPath="photos" />);
  fireEvent.click(screen.getByRole("button", { name: "selection mode" }));
}

function shownIds() {
  return screen.getByTestId("folder-content").getAttribute("data-file-ids");
}

describe("SPEC-CORE-120 I21: FolderBrowser holds the ids a batch run could not process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listing.initial = ["a", "b", "c"];
  });

  it("I21 [SPEC-CORE-120] onSelectOnly replaces the selection with exactly the ids passed", () => {
    renderBrowser();

    fireEvent.click(screen.getByRole("button", { name: "select b c" }));
    expect(screen.getByTestId("selection-bar")).toHaveAttribute("data-selected", "b,c");

    fireEvent.click(screen.getByRole("button", { name: "select b" }));
    expect(screen.getByTestId("selection-bar")).toHaveAttribute("data-selected", "b");
  });

  it("I21 [SPEC-CORE-120] onProcessed removes the processed rows from the listing and the continuation", () => {
    renderBrowser();

    fireEvent.click(screen.getByRole("button", { name: "processed b" }));

    expect(shownIds()).toBe("a,c");
    expect(listing.removeContinuationFiles).toHaveBeenCalledWith(["b"]);
  });
});
