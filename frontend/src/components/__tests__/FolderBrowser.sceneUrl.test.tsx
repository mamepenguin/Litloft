import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";

vi.mock("@/components/folder/FolderContent", () => ({
  // Exposes the drag-start handler it is given, so a test can begin a drag
  // *inside* this browser — the other half of the drop-target condition, which
  // the app-wide hook cannot reach.
  FolderContent: ({ onDragStart }: { onDragStart?: (e: unknown, f: unknown) => void }) => (
    <div data-testid="folder-content">
      <button
        data-testid="drag-source"
        onClick={() =>
          onDragStart?.({ dataTransfer: { setData: () => {}, effectAllowed: "" } }, {
            id: "f1",
            filename: "a.mp4",
          })
        }
      >
        drag
      </button>
    </div>
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
vi.mock("@/components/folder/FolderToolbar", () => ({
  FolderToolbar: ({
    onSortChange,
    onTypeFilterChange,
  }: {
    onSortChange: (s: string, o: string) => void;
    onTypeFilterChange: (t: string | null) => void;
  }) => (
    <div>
      <button data-testid="set-sort" onClick={() => onSortChange("file_size", "asc")} />
      <button data-testid="set-type" onClick={() => onTypeFilterChange("video")} />
    </div>
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

const routerReplace = vi.hoisted(() => vi.fn());
// One object for every render, as the app router gives: a fresh one per call
// re-runs every effect that lists the router, which hides a missing
// dependency.
const stableRouter = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => {
  stableRouter.replace = routerReplace;
  return { useRouter: () => stableRouter };
});

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

vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title" as const, order: "asc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "list" as const, setViewMode: vi.fn() }),
}));


/**
 * Reset once for the whole file: a shared mutable fixture with per-block
 * resets asks every block to remember every field.
 */
beforeEach(() => {
  listing.total = 42;
  listing.loading = false;
  listing.folders = [];
  dragging.internal = false;
});

const lastReplacedUrl = () => {
  const raw = routerReplace.mock.calls.at(-1)?.[0] as string | undefined;
  if (!raw) return null;
  const url = new URL(raw, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

function renderSearch(props: {
  searchQuery?: string;
  typeFilter?: "video" | "image";
  smartFolderId?: string;
  includeSceneClip?: boolean;
}) {
  const tree = (p: typeof props) => (
    <FolderBrowser driveName="main" searchQuery="cats" {...p} />
  );
  const view = render(tree(props));
  return { rerender: (p: typeof props) => view.rerender(tree(p)) };
}

describe("search URL sync keeps include_scene_clip (SPEC-CORE-025)", () => {
  beforeEach(() => {
    routerReplace.mockClear();
  });

  it("writes include_scene_clip=true when the flag is on and nothing when it is off", () => {
    const on = render(<FolderBrowser driveName="main" searchQuery="cats" includeSceneClip />);
    const url = lastReplacedUrl();
    expect(url?.pathname).toBe("/drive/main/search");
    expect(url?.params.get("q")).toBe("cats");
    expect(url?.params.get("include_scene_clip")).toBe("true");
    on.unmount();
    routerReplace.mockClear();

    render(<FolderBrowser driveName="main" searchQuery="cats" includeSceneClip={false} />);
    expect(lastReplacedUrl()?.pathname).toBe("/drive/main/search");
    expect(lastReplacedUrl()?.params.has("include_scene_clip")).toBe(false);
  });

  it("keeps the flag when the type filter changes", () => {
    renderSearch({ includeSceneClip: true });
    fireEvent.click(screen.getByTestId("set-type"));
    const url = lastReplacedUrl();
    expect(url?.params.get("type")).toBe("video");
    expect(url?.params.get("include_scene_clip")).toBe("true");
  });

  it("keeps the flag when the sort changes", () => {
    renderSearch({ includeSceneClip: true });
    fireEvent.click(screen.getByTestId("set-sort"));
    const url = lastReplacedUrl();
    expect(url?.params.get("sort")).toBe("file_size");
    expect(url?.params.get("include_scene_clip")).toBe("true");
  });

  it("leaves the other parameters as they were", () => {
    renderSearch({ includeSceneClip: true, typeFilter: "video", smartFolderId: "sf1" });
    const url = lastReplacedUrl();
    expect([...url!.params.keys()].sort()).toEqual([
      "include_scene_clip",
      "q",
      "smart_folder_id",
      "type",
    ]);
    expect(url?.params.get("q")).toBe("cats");
    expect(url?.params.get("type")).toBe("video");
    expect(url?.params.get("smart_folder_id")).toBe("sf1");
  });
  it("answers a toggle change with one replace carrying the new flag and nothing else new", () => {
    const view = renderSearch({ typeFilter: "video", includeSceneClip: false });
    routerReplace.mockClear();

    view.rerender({ typeFilter: "video", includeSceneClip: true });
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect([...lastReplacedUrl()!.params.entries()].sort()).toEqual([
      ["include_scene_clip", "true"],
      ["q", "cats"],
      ["type", "video"],
    ]);

    routerReplace.mockClear();
    view.rerender({ typeFilter: "video", includeSceneClip: false });
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(lastReplacedUrl()!.params.has("include_scene_clip")).toBe(false);
  });
});
