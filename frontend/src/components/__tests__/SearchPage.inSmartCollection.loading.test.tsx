/**
 * SPEC-CORE-116 step 3, I5 on the search page: while an `in:` resolution runs,
 * and until the first listing page for it has settled, the page shows its
 * loading state — never a count and never the no-results view.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAddonsCache } from "@/lib/addons";
import type { FileItem } from "@/types";
import {
  installWireFetch,
  json,
  pagedListing,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";

import { FolderBrowser } from "../FolderBrowser";
import { useFolderFiles } from "../folder/useFolderFiles";

const DRIVE = "photos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const rowsOf = (files: FileItem[]) => files.map((file) => file.id).join(",");
vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => <div data-testid="rows" data-ids={rowsOf(files)} />,
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => <div data-testid="rows" data-ids={rowsOf(files)} />,
}));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) => <div data-testid={`slot-${id}`} />,
}));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/Breadcrumb", () => ({
  Breadcrumb: () => <nav aria-label="Breadcrumb">trail</nav>,
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
  useFolderSort: () => ({ sort: "created_at", order: "desc", setSort: vi.fn() }),
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
  usePinnedFolders: () => ({
    pinnedPaths: new Set<string>(),
    homePaths: new Set<string>(),
    handleTogglePin: vi.fn(),
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
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SmartFolderMenuItems: () => null,
  SmartFolderOverwriteButton: () => null,
}));

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: () => null,
  writeSearchCache: vi.fn(),
  clearSearchCache: vi.fn(),
  searchCacheKey: (key: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
    `${key.drive}::${key.query}::${key.type ?? "all"}::${key.includeSceneClip ? 1 : 0}`,
}));

vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));

const file = (id: string): FileItem => ({
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.jpg`,
  title: id,
  description: "",
  drive: DRIVE,
  folder_path: "",
  file_type: "image",
  mime_type: "image/jpeg",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  modified_at: null,
});

const smartFolder = (id: string, name: string, query: string) => ({
  id,
  drive: DRIVE,
  name,
  query,
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
});

const MEMBERS = [file("m1"), file("m2")];
let members = MEMBERS;
const COULD_NOT_LOAD = "Could not load the collection";
const TOO_LARGE = "The scope is too large (up to 10,000 files). Narrow it down.";
const NO_RESULTS = "No matching files found";
const anyCount = () => screen.queryByText(/^\d+ items$/);

const server = {
  collections: (): Response | Promise<Response> => json([]),
  /** Answers the page-1 POST while it is set; everything else answers at once. */
  heldPage: null as null | (() => Promise<Response>),
};
let wire: { calls: WireCall[] };

const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const isEvaluation = (c: WireCall) => isListing(c) && c.url.searchParams.get("search") === "dogs";

function install() {
  wire = installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (path === `/api/drives/${DRIVE}/collections`) return server.collections();
    if (path === `/api/drives/${DRIVE}/smart-folders`) {
      return json([smartFolder("sf-weekly", "Weekly", "dogs")]);
    }
    if (isEvaluation(call)) return pagedListing(members, call);
    if (isFilesQuery(call)) {
      if (server.heldPage) return server.heldPage();
      return pagedListing([file("p1"), file("p2")], call);
    }
    if (isListing(call)) return pagedListing([file("g1")], call);
    return json({}, 404);
  });
}

beforeEach(() => {
  server.collections = () => json([]);
  server.heldPage = null;
  members = MEMBERS;
  invalidateAddonsCache();
  install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

function deferredPage() {
  let release: ((body: unknown) => void) | null = null;
  const pending = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  server.heldPage = () => pending.then((body) => json(body));
  return {
    answer: async (files: FileItem[]) => {
      server.heldPage = null;
      await act(async () => release?.({ data: files, meta: { total: files.length, page: 1, limit: 30 } }));
    },
  };
}

function renderSearch(searchQuery: string) {
  return render(<FolderBrowser driveName={DRIVE} searchQuery={searchQuery} typeFilter={null} />);
}

describe("SPEC-CORE-116 step 3, I5: an in: query waits for its first listing page", () => {
  it("reports loading from the resolution landing until page 1 is read", async () => {
    deferredPage();
    const renders: Array<{ blocked: boolean; loading: boolean; files: number }> = [];
    renderHook(() => {
      const listing = useFolderFiles({
        driveName: DRIVE,
        searchQuery: 'in:"Weekly"',
        typeFilter: null,
        sort: "created_at",
        order: "desc",
        refreshKey: 0,
      });
      renders.push({
        blocked: listing.inNameBlocked,
        loading: listing.loading,
        files: listing.files.length,
      });
      return listing;
    });

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    await settle();

    const landed = renders.filter((state) => !state.blocked);
    expect(landed.length).toBeGreaterThan(0);
    expect(landed.map((state) => state.loading)).not.toContain(false);
    expect(landed.every((state) => state.files === 0)).toBe(true);
  });

  it("shows no count and no no-results view before page 1, then the count", async () => {
    const held = deferredPage();
    renderSearch('in:"Weekly"');

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    await settle();

    expect(anyCount()).toBeNull();
    expect(screen.queryByText(NO_RESULTS)).toBeNull();

    await held.answer([file("p1"), file("p2")]);

    expect(await screen.findByText("2 items")).toBeInTheDocument();
    expect(screen.queryByText(NO_RESULTS)).toBeNull();
  });

  it("shows no count again from 再試行 until its first page", async () => {
    server.collections = () => json({ detail: "boom" }, 500);
    renderSearch('in:"Weekly"');
    const retry = await screen.findByRole("button", { name: /retry/i });

    server.collections = () => json([]);
    const held = deferredPage();
    fireEvent.click(retry);

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    await settle();
    expect(anyCount()).toBeNull();
    expect(screen.queryByText(COULD_NOT_LOAD)).toBeNull();

    await held.answer([file("p1"), file("p2")]);
    expect(await screen.findByText("2 items")).toBeInTheDocument();
  });

  it.each([
    ["failed", COULD_NOT_LOAD, () => (server.collections = () => json({ detail: "boom" }, 500))],
    [
      "too large",
      TOO_LARGE,
      () => {
        members = Array.from({ length: 10_001 }, (_, i) => file(`k${i}`));
      },
    ],
  ])("%s: the block shows and the results bar holds no count", async (_label, message, arrange) => {
    arrange();
    renderSearch('in:"Weekly"');

    expect(await screen.findByText(message, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(anyCount()).toBeNull();
  });

  it("an earlier resolution's late first page does not put the page back into loading", async () => {
    server.collections = () => json([{ id: "c1", name: "Album", drive: DRIVE }]);
    const held = deferredPage();
    const { result, rerender } = renderHook(
      ({ searchQuery }: { searchQuery: string }) =>
        useFolderFiles({
          driveName: DRIVE,
          searchQuery,
          typeFilter: null,
          sort: "created_at",
          order: "desc",
          refreshKey: 0,
        }),
      { initialProps: { searchQuery: 'in:"Weekly"' } },
    );

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    rerender({ searchQuery: 'in:"Album"' });
    await waitFor(() => expect(result.current.files.map((f) => f.id)).toEqual(["g1"]));
    expect(result.current.loading).toBe(false);

    await held.answer([file("m1")]);

    expect(result.current.loading).toBe(false);
    expect(result.current.files.map((f) => f.id)).toEqual(["g1"]);
    expect(result.current.total).toBe(1);
  });
});
