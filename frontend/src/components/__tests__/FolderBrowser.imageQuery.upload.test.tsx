/**
 * SPEC-CORE-046 step 2 / I8: the search page's UploadZone exists only for the
 * one-image drop, so its upload path is off; folder pages keep it on.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FolderBrowser } from "../FolderBrowser";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ name: "main" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/drive/main/search",
}));

const content = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("@/components/folder/FolderContent", async () => {
  const { useEffect } = await import("react");
  return {
    FolderContent: () => {
      useEffect(() => {
        content.mounts += 1;
      }, []);
      return <div data-testid="folder-content" />;
    },
  };
});
vi.mock("@/components/Breadcrumb", () => ({
  Breadcrumb: () => <nav aria-label="Breadcrumb">trail</nav>,
}));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
const zone = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: (props: { children?: React.ReactNode } & Record<string, unknown>) => {
    zone.props.push(props);
    return <>{props.children}</>;
  },
}));
vi.mock("@/components/AddButton", () => ({ AddButton: () => <button>Add</button> }));

const saveButton = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderSaveButton: (props: Record<string, unknown>) => {
    saveButton.props = props;
    return <button>Save search</button>;
  },
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
  useTreeVisible: () => ({ visible: false, beside: false, toggle: vi.fn() }),
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
  zone.props = [];
});

describe("SPEC-CORE-046 I8: the search page takes no upload", () => {
  it("passes the search page's zone acceptUpload={false}", () => {
    renderSearch(vi.fn());

    expect(zone.props.at(-1)?.acceptUpload).toBe(false);
  });

  it("keeps the results subtree mounted when availability resolves", () => {
    content.mounts = 0;
    const view = render(<FolderBrowser driveName="main" searchQuery="cats" />);
    expect(content.mounts).toBe(1);

    view.rerender(
      <FolderBrowser driveName="main" searchQuery="cats" onImageQuery={vi.fn()} />,
    );

    expect(content.mounts).toBe(1);
  });

  it("keeps uploads on a folder page", () => {
    render(<FolderBrowser driveName="main" folderPath="" />);

    expect(zone.props.at(-1)?.acceptUpload).toBeUndefined();
  });
});
