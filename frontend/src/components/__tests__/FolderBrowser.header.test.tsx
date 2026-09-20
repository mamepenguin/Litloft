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

function renderFolder(
  props: {
    searchQuery?: string;
    typeFilter?: "video" | "image";
    smartFolderId?: string;
  } = {},
) {
  return render(
    <FolderBrowser driveName="main" folderPath="videos" {...props} />,
  );
}

/** `null` means the trail is the subject and `PageHeader` emits no heading. */
const SUBJECT_BY_SCREEN: [string, () => React.ReactElement, string | null][] = [
  [
    "the Library root",
    () => <FolderBrowser driveName="main" folderPath="" />,
    "Library",
  ],
  [
    "a folder reached by its path",
    () => <FolderBrowser driveName="main" folderPath="videos" />,
    null,
  ],
  // `""` and "no folder at all" are one value under `!folderPath`; a
  // cross-folder view is the screen that tells them apart.
  [
    "a cross-folder view",
    () => <FolderBrowser driveName="main" view="favorites" />,
    null,
  ],
];

describe("which screen names itself in a heading", () => {
  it.each(SUBJECT_BY_SCREEN)("%s", (_name, screen_, expected) => {
    render(screen_());
    const heading = screen.queryByRole("heading", { level: 1 });
    expect(heading?.textContent ?? null).toBe(expected);
  });

  it.each(SUBJECT_BY_SCREEN.filter(([, , expected]) => expected === null))(
    "%s keeps its trail as the subject",
    (_name, screen_) => {
      render(screen_());
      expect(screen.getByLabelText("Breadcrumb").getAttribute("data-drive-is-ancestor")).toBe("no");
    },
  );

  it.each(SUBJECT_BY_SCREEN)("%s leaves the tree toggle to the app toolbar", (_name, screen_) => {
    render(screen_());
    expect(screen.queryByTestId("tree-toggle")).toBeNull();
  });

  it.each(SUBJECT_BY_SCREEN)("%s wears a full-width frame", (_name, screen_) => {
    const { container } = render(screen_());
    const header = container.querySelector("header")!;
    expect(header.parentElement?.getAttribute("data-page-frame")).toBe("full");
  });
});

describe("the Library root header", () => {
  const renderRoot = () =>
    render(<FolderBrowser driveName="main" folderPath="" view="library" />);

  it("draws no trail, so the title sits where Home's does", () => {
    renderRoot();
    expect(screen.queryByLabelText("Breadcrumb")).toBeNull();
  });

  it("states the drive and the count on one scope line", () => {
    renderRoot();
    expect(screen.getByText("main · 42 items")).toBeInTheDocument();
  });

  it("states the drive alone before the count is known", () => {
    listing.loading = true;
    renderRoot();
    const heading = screen.getByRole("heading", { level: 1 });
    const scope = heading.nextElementSibling;
    expect(scope?.textContent).toBe("main");
  });

  it("wears the sidebar row's icon ahead of the title", () => {
    const { container } = renderRoot();
    const titleRow = screen.getByRole("heading", { level: 1 }).closest("header > div")!;
    expect(titleRow.querySelector("svg.lucide-folder-tree")).not.toBeNull();
    expect(container.querySelectorAll("header svg.lucide-folder-tree")).toHaveLength(1);
  });


});

describe("the folder header", () => {

  it("names the folder with its trail and no heading", () => {
    renderFolder();
    expect(screen.getByLabelText("Breadcrumb")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("states the count, which the toolbar no longer does", () => {
    renderFolder();
    expect(screen.getAllByText("42 items")).toHaveLength(1);
  });

  it("keeps the count when the folder is empty", () => {
    listing.total = 0;
    renderFolder();
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("starts its trail row with the breadcrumb", () => {
    const { container } = renderFolder();
    const firstRow = container.querySelector("header > div")!;
    expect(firstRow.firstElementChild?.getAttribute("aria-label")).toBe("Breadcrumb");
  });
});

describe("the search header", () => {

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

describe("the count while a refetch is in flight", () => {

  // A refetch sets `total` to 0 and `loading` to true together, so the raw
  // values are a false "0 items" and a blank.
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

  // `reset()` is an effect, so on the render where the subject changes the
  // hook still reports `loading: false` and the previous subject's `total`.
  // Leaving `loading` alone is the whole point of this one.
  it("does not adopt the old count when the subject changes before loading starts", () => {
    const { rerender } = renderFolder();
    expect(screen.getByText("42 items")).toBeInTheDocument();
    // `loading` untouched, `total` untouched: exactly what the hook reports on
    // the first render after a navigation.
    rerender(<FolderBrowser driveName="main" folderPath="videos/empty" />);
    expect(screen.queryByText(/\d+ items/)).toBeNull();
  });

  // Two subjects with the same count. Without the subject term on the *write*
  // side, the adoption is skipped — `settled.total !== total` is false when
  // both are 42 — and the count then never returns for the second folder.
  it("re-adopts a count that happens to equal the previous one", () => {
    const { rerender } = renderFolder();
    expect(screen.getByText("42 items")).toBeInTheDocument();

    rerender(<FolderBrowser driveName="main" folderPath="videos/other" />);
    expect(screen.queryByText(/\d+ items/)).toBeNull();

    // The fetch for the new folder starts, then lands on the same number.
    listing.loading = true;
    rerender(<FolderBrowser driveName="main" folderPath="videos/other" />);
    listing.loading = false;
    listing.total = 42;
    rerender(<FolderBrowser driveName="main" folderPath="videos/other" />);
    expect(screen.getByText("42 items")).toBeInTheDocument();
  });

  // This route is the same for every folder in a drive, so React keeps the
  // state across a move.
  it("forgets the count when the folder changes", () => {
    const { rerender } = renderFolder();
    expect(screen.getByText("42 items")).toBeInTheDocument();
    listing.loading = true;
    listing.total = 0;
    rerender(<FolderBrowser driveName="main" folderPath="videos/empty" />);
    expect(screen.queryByText("42 items")).toBeNull();
    expect(screen.queryByText(/\d+ items/)).toBeNull();
  });

  it("forgets the count when the search query changes", () => {
    const { rerender } = renderFolder({ searchQuery: "cats" });
    expect(screen.getByText("42 items")).toBeInTheDocument();
    listing.loading = true;
    listing.total = 0;
    rerender(
      <FolderBrowser driveName="main" folderPath="videos" searchQuery="dogs" />,
    );
    expect(screen.queryByText(/\d+ items/)).toBeNull();
  });

  // Driven without touching `loading`: setting it first jumps the window
  // where the adoption happens.
  it.each([
    ["the drive", { driveName: "other" }],
    ["the view", { view: "favorites" }],
    ["the tag filter", { tagFilter: "cats" }],
  ])("forgets the count when %s changes", (_label, next) => {
    const { rerender } = renderFolder();
    expect(screen.getByText("42 items")).toBeInTheDocument();
    rerender(
      <FolderBrowser driveName="main" folderPath="videos" {...next} />,
    );
    expect(screen.queryByText(/\d+ items/)).toBeNull();
  });

  // Not driven by a rerender: the prop only seeds internal state, and the
  // value that matters afterwards is the one the toolbar sets.
  it("forgets the count when the reader picks a type filter", () => {
    renderFolder();
    expect(screen.getByText("42 items")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Video" }));
    expect(screen.queryByText(/\d+ items/)).toBeNull();
  });

  // Not in the key, deliberately: these reorder the same set, so the count is
  // still true and hiding it would be a flicker with nothing behind it.
  it.each([
    ["sort", { sort: "file_size" as const }],
    ["order", { order: "asc" as const }],
  ])("keeps the count when only %s changes", (_label, next) => {
    const { rerender } = renderFolder();
    listing.loading = true;
    listing.total = 0;
    rerender(
      <FolderBrowser driveName="main" folderPath="videos" {...next} />,
    );
    expect(screen.getByText("42 items")).toBeInTheDocument();
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

  it("passes the drive and folder it was given", () => {
    renderFolder();
    const trail = screen.getByLabelText("Breadcrumb");
    expect(trail.getAttribute("data-drive")).toBe("main");
    expect(trail.getAttribute("data-folder")).toBe("videos");
  });

  it("withholds the drop handlers when nothing is being dragged", () => {
    renderFolder();
    const trail = screen.getByLabelText("Breadcrumb");
    expect(trail.getAttribute("data-drop-props")).toBe("no");
    expect(trail.getAttribute("data-drop-target")).toBe("no");
  });
});

describe("what the header hands its children", () => {


  // Non-default values throughout: an assertion written with a default is
  // true before the code runs.
  it("gives the save-search button the query, filter and smart folder", () => {
    renderFolder({ searchQuery: "cats", typeFilter: "video", smartFolderId: "sf1" });
    const props = JSON.parse(
      screen.getByRole("button", { name: "Save search" }).getAttribute("data-save-props")!,
    );
    expect(props.query).toBe("cats");
    expect(props.drive).toBe("main");
    expect(props.typeFilter).toBe("video");
    expect(props.smartFolderId).toBe("sf1");
  });

  it("gives the addon slot its query, drive, filter and select handler", () => {
    renderFolder({ searchQuery: "cats", typeFilter: "video" });
    const slot = screen.getByTestId("slot-search-modes");
    expect(slot.getAttribute("data-layout")).toBe("stack");
    const props = JSON.parse(slot.getAttribute("data-slot-props")!);
    expect(slot.getAttribute("data-slot-prop-keys")).toBe(
      "drive,filter,onSelect,query",
    );
    expect(props.query).toBe("cats");
    expect(props.drive).toBe("main");
    expect(props.filter).toBe("video");
    expect(props.onSelect).toBe("fn");
  });
});

describe("the trail's drop target", () => {

  const dropProps = () => {
    const trail = screen.getByLabelText("Breadcrumb");
    return {
      handlers: trail.getAttribute("data-drop-props"),
      target: trail.getAttribute("data-drop-target"),
    };
  };

  it("is withheld while nothing is being dragged", () => {
    renderFolder();
    expect(dropProps()).toEqual({ handlers: "no", target: "no" });
  });

  it("is offered once a drag starts inside this browser", () => {
    renderFolder();
    fireEvent.click(screen.getByTestId("drag-source"));
    expect(dropProps()).toEqual({ handlers: "yes", target: "yes" });
  });

  it("is offered once a drag starts elsewhere in the app", () => {
    dragging.internal = true;
    renderFolder();
    expect(dropProps()).toEqual({ handlers: "yes", target: "yes" });
  });

  const OFFERED_BY_SCREEN: [string, () => React.ReactElement][] = [
    ["a folder", () => <FolderBrowser driveName="main" folderPath="videos" />],
    ["a nested folder", () => <FolderBrowser driveName="main" folderPath="videos/clips" />],
  ];

  it.each(OFFERED_BY_SCREEN)("%s offers the trail while a drag is in flight", (_name, screen_) => {
    dragging.internal = true;
    render(screen_());
    expect(dropProps()).toEqual({ handlers: "yes", target: "yes" });
  });

  // The root names itself in a heading instead of a trail, so there is no
  // trail on it to drop onto. Dropping *to* the root is offered by the drive
  // segment of a folder's trail, which the rows above cover.
  it("is absent at the Library root even mid-drag", () => {
    dragging.internal = true;
    render(<FolderBrowser driveName="main" folderPath="" />);
    expect(screen.queryByLabelText("Breadcrumb")).toBeNull();
  });
});
