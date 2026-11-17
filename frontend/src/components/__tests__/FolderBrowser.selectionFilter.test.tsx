import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

import type { FileItem } from "@/types";
import type { FolderFilterApi } from "@/hooks/useFolderFilter";
import { FolderBrowser } from "../FolderBrowser";

const FILES = [
  { id: "a", filename: "alpha.mp4", file_type: "video" },
  { id: "b", filename: "beta.txt", file_type: "text" },
  { id: "c", filename: "gamma.mp4", file_type: "video" },
];
const listing = { files: FILES, loading: false };

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: ({
    filter,
    onMetaSelect,
    onShiftSelect,
  }: {
    filter: FolderFilterApi<FileItem>;
    onMetaSelect: (id: string) => void;
    onShiftSelect: (id: string) => void;
  }) => (
    <div>
      <input
        aria-label="name filter"
        value={filter.text}
        onChange={(e) => filter.setText(e.target.value)}
      />
      {filter.files.map((f) => (
        <div key={f.id} data-testid="row">
          <button onClick={() => onMetaSelect(f.id)}>meta {f.id}</button>
          <button onClick={() => onShiftSelect(f.id)}>shift {f.id}</button>
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: ({
    selectedIds,
    totalCount,
    onSelectAll,
  }: {
    selectedIds: ReadonlySet<string>;
    totalCount: number;
    onSelectAll: () => void;
  }) => (
    <div>
      <output aria-label="selectable">{totalCount}</output>
      <output aria-label="selected">{[...selectedIds].sort().join(",")}</output>
      <button onClick={onSelectAll}>Select all</button>
    </div>
  ),
}));
vi.mock("@/components/Breadcrumb", () => ({ Breadcrumb: () => <nav /> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SmartFolderMenuItems: () => null,
  SmartFolderOverwriteButton: () => null,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({ AddButton: () => <button>Add</button> }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    paste: vi.fn(),
    clear: vi.fn(),
    copy: vi.fn(),
    cut: vi.fn(),
    isCut: () => false,
  }),
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
  usePinnedFolders: () => ({ pinnedPaths: new Set<string>(), homePaths: new Set<string>(), handleTogglePin: vi.fn(), handleToggleHome: vi.fn() }),
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
vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: listing.files,
    folders: [],
    total: listing.files.length,
    loading: listing.loading,
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
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title" as const, order: "asc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "list" as const, setViewMode: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  listing.files = FILES;
  listing.loading = false;
});

async function narrowTo(text: string) {
  fireEvent.change(screen.getByLabelText("name filter"), { target: { value: text } });
  await waitFor(() => expect(screen.getAllByTestId("row")).toHaveLength(2));
}

const selected = () => screen.getByLabelText("selected").textContent;

// UNSPEC: with the folder's name filter in use, the selection holds only the
// files the filter shows: "Select all" and a Shift range never reach a hidden
// file, and a file the filter comes to hide leaves the selection.
describe("FolderBrowser — selection under the name filter", () => {
  it("selects only the shown files on Select all", async () => {
    render(<FolderBrowser driveName="d" folderPath="" />);
    await narrowTo(".mp4");
    fireEvent.click(screen.getByRole("button", { name: "meta a" }));
    expect(screen.getByLabelText("selectable").textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(selected()).toBe("a,c");
  });

  it("skips a hidden file inside a Shift range", async () => {
    render(<FolderBrowser driveName="d" folderPath="" />);
    await narrowTo(".mp4");
    fireEvent.click(screen.getByRole("button", { name: "meta a" }));
    fireEvent.click(screen.getByRole("button", { name: "shift c" }));
    expect(selected()).toBe("a,c");
  });

  it("drops a selected file when the filter comes to hide it", async () => {
    render(<FolderBrowser driveName="d" folderPath="" />);
    fireEvent.click(screen.getByRole("button", { name: "meta a" }));
    fireEvent.click(screen.getByRole("button", { name: "meta b" }));
    expect(selected()).toBe("a,b");
    await narrowTo(".mp4");
    await waitFor(() => expect(selected()).toBe("a"));
  });

  it("keeps the selection when the list reloads under the filter", async () => {
    const view = render(<FolderBrowser driveName="d" folderPath="" />);
    await narrowTo(".mp4");
    fireEvent.click(screen.getByRole("button", { name: "meta a" }));
    fireEvent.click(screen.getByRole("button", { name: "meta c" }));
    listing.files = [];
    listing.loading = true;
    view.rerender(<FolderBrowser driveName="d" folderPath="" />);
    // A reload brings back only the first page.
    listing.files = FILES.slice(0, 2);
    listing.loading = false;
    view.rerender(<FolderBrowser driveName="d" folderPath="" />);
    expect(selected()).toBe("a,c");
  });

  it("waits for a reload before pruning against newly typed text", async () => {
    const view = render(<FolderBrowser driveName="d" folderPath="" />);
    fireEvent.click(screen.getByRole("button", { name: "meta a" }));
    listing.files = [];
    listing.loading = true;
    view.rerender(<FolderBrowser driveName="d" folderPath="" />);
    fireEvent.change(screen.getByLabelText("name filter"), { target: { value: ".mp4" } });
    await new Promise((r) => setTimeout(r, 400));
    listing.files = FILES;
    listing.loading = false;
    view.rerender(<FolderBrowser driveName="d" folderPath="" />);
    await waitFor(() => expect(screen.getAllByTestId("row")).toHaveLength(2));
    expect(selected()).toBe("a");
  });

  it("selects only the clicked row on Shift after the anchor was hidden", async () => {
    render(<FolderBrowser driveName="d" folderPath="" />);
    fireEvent.click(screen.getByRole("button", { name: "meta b" }));
    await narrowTo(".mp4");
    await waitFor(() => expect(selected()).toBe(""));
    fireEvent.click(screen.getByRole("button", { name: "shift c" }));
    expect(selected()).toBe("c");
  });
});
