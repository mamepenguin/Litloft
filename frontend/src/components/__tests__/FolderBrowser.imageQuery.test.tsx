/**
 * SPEC-CORE-046 step 2: FolderBrowser hands the page's onImageQuery to its
 * UploadZone (the drop) and to SearchQueryHeader (the image button and paste).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clipboard, imageFile } from "@/__tests__/helpers/imageQuery";

import { FolderBrowser } from "../FolderBrowser";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ name: "main" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/drive/main/search",
}));

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));
vi.mock("@/components/Breadcrumb", () => ({
  Breadcrumb: () => <nav aria-label="Breadcrumb">trail</nav>,
}));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
const drop = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/components/search/ImageQueryDropTarget", () => ({
  ImageQueryDropTarget: (props: Record<string, unknown>) => {
    drop.props.push(props);
    return null;
  },
}));
vi.mock("@/components/AddButton", () => ({ AddButton: () => <button>Add</button> }));

const saveButton = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    saveButton.props = props;
    return <>{children}</>;
  },
  SmartFolderMenuItems: () => null,
}));

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) => <div data-testid={`slot-${id}`} />,
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => ({ fileId: null }) }));
vi.mock("@/hooks/useTreeVisible", () => ({
  useTreeVisible: () => ({ visible: false, beside: false, toggle: vi.fn(), yielded: false }),
}));
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title", order: "asc", setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "grid", setViewMode: vi.fn() }),
}));
vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));
vi.mock("@/hooks/useIsInternalDragging", () => ({ useIsInternalDragging: () => false }));
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

vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [],
    folders: [],
    total: 42,
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
    continuationState: "hidden",
    onShowMore: vi.fn(),
    continuationSentinelRef: { current: null },
    continuationDrawnIds: new Set<string>(),
    updateContinuationFile: vi.fn(),
    removeContinuationFiles: vi.fn(),
  }),
}));

const getDriveTags = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveTags: (...args: unknown[]) => getDriveTags(...args),
}));

const BUTTON = "Search by image";
const field = () => screen.getByRole("textbox", { name: "Search query" });

function renderSearch(onImageQuery?: (file: File) => void) {
  return render(
    <FolderBrowser
      driveName="main"
      searchQuery="cats"
      typeFilter={null}
      smartFolderId={null}
      onImageQuery={onImageQuery}
    />,
  );
}

beforeEach(() => {
  router.push.mockClear();
  getDriveTags.mockReset();
  getDriveTags.mockResolvedValue([]);
  drop.props = [];
});

describe("SPEC-CORE-046 step 2 with onImageQuery", () => {
  it("passes it to the page's own drop target", () => {
    const onImageQuery = vi.fn();
    renderSearch(onImageQuery);

    expect(drop.props.at(-1)?.onImageQuery).toBe(onImageQuery);
  });

  it("renders the image button in the field's header, opening an image picker whose file goes to onImageQuery", () => {
    const onImageQuery = vi.fn();
    renderSearch(onImageQuery);
    const picker = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement | null;
    expect(picker).not.toBeNull();
    const click = vi.spyOn(picker!, "click");

    fireEvent.click(screen.getByRole("button", { name: BUTTON }));
    expect(click).toHaveBeenCalled();
    const file = imageFile();
    fireEvent.change(picker!, { target: { files: [file] } });

    expect(onImageQuery).toHaveBeenCalledWith(file);
  });

  it("hands a pasted image with no text to onImageQuery and inserts nothing", () => {
    const onImageQuery = vi.fn();
    renderSearch(onImageQuery);
    const file = imageFile();

    const allowed = fireEvent.paste(field(), { clipboardData: clipboard([file]) });

    expect(allowed).toBe(false);
    expect(onImageQuery).toHaveBeenCalledWith(file);
  });

  it("leaves a paste with text to today's handling, where an image-only paste is taken", () => {
    const onImageQuery = vi.fn();
    renderSearch(onImageQuery);

    const textAllowed = fireEvent.paste(field(), { clipboardData: clipboard([imageFile()], "words") });
    const imageAllowed = fireEvent.paste(field(), { clipboardData: clipboard([imageFile()]) });

    expect(textAllowed).toBe(true);
    expect(imageAllowed).toBe(false);
    expect(onImageQuery).toHaveBeenCalledTimes(1);
  });
});

describe("SPEC-CORE-046 step 2 without onImageQuery", () => {
  it("renders no image button and passes the zone no onImageQuery, where with it the button shows", () => {
    const view = renderSearch();
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
    expect(drop.props.at(-1)?.onImageQuery).toBeUndefined();
    view.unmount();

    renderSearch(vi.fn());
    expect(screen.getByRole("button", { name: BUTTON })).toBeInTheDocument();
  });
});
