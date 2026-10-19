import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: ({ hasMore }: { hasMore?: unknown }) => (
    <div data-testid="folder-content" data-has-more={String(hasMore)} />
  ),
}));
vi.mock("@/components/Breadcrumb", () => ({
  Breadcrumb: (props: Record<string, unknown>) => (
    <nav
      aria-label="Breadcrumb"
      data-drive={String(props.driveName ?? "")}
      data-folder={String(props.folderPath ?? "")}
      data-drive-is-ancestor={props.driveIsAncestor ? "yes" : "no"}
      data-drop-props={props.getDropTargetProps ? "yes" : "no"}
      data-drop-target={props.isDropTarget ? "yes" : "no"}
    >
      trail
    </nav>
  ),
}));
vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: ({ drive }: { drive: string }) => (
    <button data-testid="tree-toggle" data-drive={drive}>
      tree
    </button>
  ),
}));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderSaveButton: (props: Record<string, unknown>) => (
    <button data-save-props={JSON.stringify(props)}>Save search</button>
  ),
}));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id, layout, props }: { id: string; layout?: string; props?: Record<string, unknown> }) => (
    <div
      data-testid={`slot-${id}`}
      data-layout={String(layout ?? "")}
      // The names separately from the values: `JSON.stringify` drops every
      // function, so a callback prop is invisible in the serialized object
      // and a test enumerating its keys would not see one arrive.
      data-slot-prop-keys={Object.keys(props ?? {}).sort().join(",")}
      data-slot-props={JSON.stringify({
        ...props,
        // A function does not survive JSON; record only whether one arrived.
        onSelect: props?.onSelect ? "fn" : "none",
      })}
    />
  ),
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
vi.mock("@/components/AddButton", () => ({
  // Stands in for the one control that puts things in a folder. It renders a
  // row per prop it is given, so a test can still see *which* of them
  // FolderBrowser decided to offer — the real menu keeps them behind a click.
  AddButton: ({ onCreateFolder }: { onCreateFolder?: () => void }) => (
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

const dragging = vi.hoisted(() => ({ internal: false }));
vi.mock("@/hooks/useIsInternalDragging", () => ({
  useIsInternalDragging: () => dragging.internal,
}));

const listing = vi.hoisted(() => ({
  hasMore: false,
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
    get hasMore() {
      return listing.hasMore;
    },
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
  useFolderViewMode: () => ({ viewMode: "grid" as const, setViewMode: vi.fn() }),
}));

beforeEach(() => {
  listing.total = 42;
  listing.loading = false;
  listing.folders = [];
  dragging.internal = false;
});

describe("SPEC-CORE-002 FolderBrowser hands the listing's hasMore to FolderContent", () => {
  it.each([true, false])("hasMore %s", (hasMore) => {
    listing.hasMore = hasMore;
    render(<FolderBrowser driveName="main" folderPath="photos" />);
    expect(screen.getByTestId("folder-content").getAttribute("data-has-more")).toBe(String(hasMore));
  });
});
