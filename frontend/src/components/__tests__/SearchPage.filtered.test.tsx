import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAddonsCache } from "@/lib/addons";
import type { SemanticHit } from "@/lib/searchMerge";
import type { FileItem, FileKind } from "@/types";

import { FolderBrowser } from "../FolderBrowser";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/folder/FolderToolbar", () => ({
  FolderToolbar: () => <div data-testid="toolbar" />,
}));

const rowsOf = (files: FileItem[]) => files.map((file) => file.id).join(",");

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => (
    <div data-testid="rows" data-ids={rowsOf(files)} />
  ),
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => (
    <div data-testid="rows" data-ids={rowsOf(files)} />
  ),
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
  usePinnedFolders: () => ({ pinnedPaths: new Set<string>(), handleTogglePin: vi.fn() }),
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

const searchCache = vi.hoisted(() => ({ hit: null as unknown }));
vi.mock("@/lib/searchCache", () => ({
  readSearchCache: () => searchCache.hit,
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
  drive: "photos",
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
});

const clipHit = (id: string): SemanticHit => ({
  file_id: id,
  drive: "photos",
  filename: `${id}.jpg`,
  file_type: "image",
  score: 0.9,
  match_types: ["clip_thumbnail"],
  segments: [{ time_range: null, matches: [{ type: "clip_thumbnail", score: 0.9 }] }],
  file: file(id),
});

interface RecordedCall {
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
}

const server = {
  semantic: [] as SemanticHit[],
  images: [] as SemanticHit[],
  calls: [] as RecordedCall[],
  filesHandler: null as null | (() => Promise<Response>),
  searchHandler: null as null | (() => Promise<Response>),
  imagesHandler: null as null | (() => Promise<Response>),
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = new URL(String(input), "http://localhost");
  server.calls.push({
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: {},
  });

  if (url.pathname === "/api/addons/status") {
    return json({
      addons: { intelligence: { label: "Intelligence", icon: "sparkles" } },
      slots: {},
    });
  }
  if (url.pathname === "/api/drives/photos/files") {
    if (server.filesHandler) return server.filesHandler();
    const page = Number(url.searchParams.get("page") ?? "1");
    const items = page === 1 ? [file("f1"), file("f2")] : [];
    return json({ data: items, meta: { total: 2, page, limit: 30 } });
  }
  if (url.pathname === "/api/addons/intelligence/search") {
    if (server.searchHandler) return server.searchHandler();
    return json({ available: true, results: server.semantic });
  }
  if (url.pathname === "/api/addons/intelligence/search/images") {
    if (server.imagesHandler) return server.imagesHandler();
    return json({ available: true, results: server.images });
  }
  return json({}, 404);
});

function resetServer() {
  server.semantic = [];
  server.images = [];
  server.calls = [];
  server.filesHandler = null;
  server.searchHandler = null;
  server.imagesHandler = null;
  searchCache.hit = null;
  invalidateAddonsCache();
  vi.stubGlobal("fetch", fetchMock);
}

interface PageProps {
  searchQuery?: string;
  includeSceneClip?: boolean;
  typeFilter?: FileKind | null;
}

function tree(props: PageProps) {
  return (
    <FolderBrowser
      driveName="photos"
      searchQuery={props.searchQuery ?? "cats tag:会議"}
      includeSceneClip={props.includeSceneClip}
      typeFilter={props.typeFilter ?? null}
    />
  );
}

function renderSearch(props: PageProps = {}) {
  const view = render(tree(props));
  return { ...view, rerenderPage: (next: PageProps) => view.rerender(tree(next)) };
}

const grid = () => screen.queryByTestId("rows");
const drawnIds = () => grid()?.getAttribute("data-ids")?.split(",").filter(Boolean) ?? [];
const offerButton = () => screen.queryByRole("button", { name: "Show more by similarity" });
const searchCalls = () =>
  server.calls.filter((call) => call.path === "/api/addons/intelligence/search");
const imagesCalls = () =>
  server.calls.filter((call) => call.path === "/api/addons/intelligence/search/images");
const listingCalls = () =>
  server.calls.filter((call) => call.path === "/api/drives/photos/files");

async function settle() {
  await waitFor(() => expect(grid()).not.toBeNull());
}

function deferredSearch() {
  let release: ((body: unknown) => void) | null = null;
  const pending = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  server.searchHandler = () => pending.then((body) => json(body));
  return {
    answer: async (body: unknown) => {
      server.searchHandler = null;
      await act(async () => release?.(body));
    },
  };
}

function deferredImages() {
  let release: (response: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  server.imagesHandler = () => pending;
  return {
    answer: async (body: unknown) => {
      await act(async () => release(json(body)));
    },
  };
}

beforeEach(() => {
  resetServer();
  router.push.mockClear();
  router.replace.mockClear();
});

describe("SPEC-CORE-039 I6 the results page's filtered meaning search", () => {
  it("sends q as the text and the filter as one JSON parameter", async () => {
    renderSearch({ searchQuery: "tag:会議 type:pdf 予算の見直し" });
    await settle();

    await waitFor(() => expect(searchCalls()).toHaveLength(1));

    const call = searchCalls()[0];
    expect(call.query.q).toBe("予算の見直し");
    expect(JSON.parse(call.query.filter)).toEqual({
      tags: ["会議"],
      kinds: ["pdf"],
    });
    expect(call.query.type).toBeUndefined();
    expect(call.query.include_scene_clip).toBeUndefined();
    expect(call.query.mode).toBeUndefined();
  });

  it("folds the toolbar's type into the filter's kinds", async () => {
    renderSearch({ searchQuery: "tag:会議 予算", typeFilter: "video" });
    await settle();

    await waitFor(() => expect(searchCalls()).toHaveLength(1));

    expect(JSON.parse(searchCalls()[0].query.filter)).toEqual({
      tags: ["会議"],
      kinds: ["video"],
    });
  });

  it("sends the listing the operators and the text, not the whole query", async () => {
    renderSearch({ searchQuery: "tag:会議 type:pdf 予算" });
    await settle();

    const call = listingCalls()[0];
    expect(call.query.search).toBe("予算");
    expect(call.query.tag).toBe("会議");
    expect(call.query.type).toBe("pdf");
  });

  it("never sends include_scene_clip with a filter", async () => {
    renderSearch({ searchQuery: "cats tag:会議", includeSceneClip: true });
    await settle();

    await waitFor(() => expect(searchCalls()).toHaveLength(1));

    expect(searchCalls()[0].query.include_scene_clip).toBeUndefined();
    expect(searchCalls()[0].query.filter).toBeDefined();
  });

  const silent: Array<[string, PageProps]> = [
    ["an operator-only query", { searchQuery: "tag:会議" }],
    ["impossible kinds", { searchQuery: "type:video cats", typeFilter: "image" }],
  ];

  it.each(silent)("runs no meaning search for %s", async (_name, props) => {
    renderSearch(props);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(searchCalls()).toHaveLength(0);
  });

  it("requests nothing at all when the kinds are impossible", async () => {
    renderSearch({ searchQuery: "type:video cats", typeFilter: "image" });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(searchCalls()).toHaveLength(0);
    expect(listingCalls()).toHaveLength(0);
  });
});

describe("SPEC-CORE-039 I7 a changed query or filter drops the previous hits", () => {
  it("drops the previous query's hit before the new request", async () => {
    server.semantic = [clipHit("h1")];
    const { rerenderPage } = renderSearch({ searchQuery: "cats tag:a" });
    await settle();
    await waitFor(() => expect(drawnIds()).toContain("h1"));

    server.semantic = [];
    const pending = deferredSearch();
    rerenderPage({ searchQuery: "dogs tag:b" });
    await settle();

    expect(drawnIds()).not.toContain("h1");
    await pending.answer({ available: true, results: [] });
    expect(drawnIds()).not.toContain("h1");
  });

  it("ignores an answer that arrives after the filter changed", async () => {
    let release: ((response: Response) => void) | null = null;
    let request = 0;
    server.searchHandler = () => {
      request += 1;
      if (request === 1) {
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve(json({ available: true, results: [] }));
    };
    const { rerenderPage } = renderSearch({ searchQuery: "cats tag:a" });
    await waitFor(() => expect(searchCalls()).toHaveLength(1));

    rerenderPage({ searchQuery: "cats tag:b" });
    await act(async () => release?.(json({ available: true, results: [clipHit("stale")] })));

    await settle();
    expect(drawnIds()).not.toContain("stale");
  });

  it("never draws a continuation fetched for another filter", async () => {
    server.semantic = [clipHit("s1")];
    server.images = [clipHit("c1")];
    const { rerenderPage } = renderSearch({ searchQuery: "cats tag:a" });
    await settle();
    await waitFor(() => expect(drawnIds()).toContain("s1"));
    const above = drawnIds();
    const pending = deferredImages();

    fireEvent.click(await screen.findByRole("button", { name: "Show more by similarity" }));
    await waitFor(() => expect(imagesCalls()).toHaveLength(1));

    rerenderPage({ searchQuery: "cats tag:b" });
    await settle();
    await pending.answer({ available: true, results: [clipHit("c1")] });

    expect(drawnIds()).toEqual(above);
    expect(drawnIds()).not.toContain("c1");
  });
});

describe("SPEC-CORE-039 I19 Show more by similarity keeps the filter", () => {
  it("offers the button for a filtered query even with include_scene_clip in the URL", async () => {
    server.semantic = [clipHit("s1")];
    renderSearch({ searchQuery: "cats tag:会議", includeSceneClip: true });
    await settle();

    expect(await screen.findByRole("button", { name: "Show more by similarity" })).toBeInTheDocument();
  });

  it("sends the same filter and the text, and no type or scene flag", async () => {
    server.semantic = [clipHit("s1")];
    server.images = [clipHit("c1")];
    renderSearch({
      searchQuery: "tag:会議 type:pdf 予算",
      typeFilter: "document",
      includeSceneClip: true,
    });
    await settle();

    fireEvent.click(await screen.findByRole("button", { name: "Show more by similarity" }));
    await waitFor(() => expect(imagesCalls()).toHaveLength(1));

    const call = imagesCalls()[0];
    expect(call.query.q).toBe("予算");
    expect(JSON.parse(call.query.filter)).toEqual({
      tags: ["会議"],
      kinds: ["pdf"],
    });
    expect(call.query.type).toBeUndefined();
    expect(call.query.include_scene_clip).toBeUndefined();
  });

  it("hides the button when the semantic answer holds no clip thumbnail", async () => {
    server.semantic = [
      {
        ...clipHit("s1"),
        match_types: ["transcript"],
        segments: [],
      },
    ];
    renderSearch({ searchQuery: "cats tag:会議" });
    await settle();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(offerButton()).toBeNull();
  });
});
