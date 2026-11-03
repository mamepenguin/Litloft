import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAddonsCache } from "@/lib/addons";
import type { SemanticHit } from "@/lib/searchMerge";
import type { FileItem, FileKind } from "@/types";

import { FolderBrowser } from "../FolderBrowser";

const stableRouter = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => stableRouter }));

interface ToolbarProps {
  fileIds: string[];
  total: number;
  hasPlayableFiles: boolean;
  selectable: boolean;
  isSearch?: boolean;
  sort: string;
  order: string;
  onSortChange: (sort: string, order: string) => void;
  onTypeFilterChange: (type: string | null) => void;
  onTrustFilterChange?: (trust: string | null) => void;
  onToggleSelectable: () => void;
  onPlayAll: () => void;
}

const toolbar = vi.hoisted(() => ({ latest: null as unknown as ToolbarProps }));

vi.mock("@/components/folder/FolderToolbar", () => ({
  FolderToolbar: (props: ToolbarProps) => {
    toolbar.latest = props;
    return <div data-testid="toolbar" />;
  },
}));

interface GridProps {
  files: FileItem[];
  selectedIds?: ReadonlySet<string>;
  onFavoriteToggle?: (file: FileItem) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
}

const rowsOf = (files: FileItem[]) => files.map((f) => f.id).join(",");

vi.mock("@/components/FileGrid", async () => {
  const { FavoriteButton } = await import("@/components/FavoriteButton");
  return {
    FileGrid: ({ files, selectedIds, onFavoriteToggle, onMetaSelect, onShiftSelect }: GridProps) => (
      <div data-testid="rows" data-ids={rowsOf(files)}>
        {files.map((f) => (
          <div
            key={f.id}
            data-testid={`row-${f.id}`}
            data-favorite={String(!!f.is_favorite)}
            data-selected={String(selectedIds?.has(f.id) ?? false)}
          >
            <span>{f.title}</span>
            <button aria-label={`select ${f.id}`} onClick={() => onMetaSelect?.(f.id)} />
            <button aria-label={`shift ${f.id}`} onClick={() => onShiftSelect?.(f.id)} />
            {onFavoriteToggle && (
              <FavoriteButton
                fileId={f.id}
                isFavorite={!!f.is_favorite}
                onToggle={onFavoriteToggle}
                entityName={f.title}
              />
            )}
          </div>
        ))}
      </div>
    ),
  };
});

vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => (
    <div data-testid="rows" data-ids={rowsOf(files)} />
  ),
}));

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
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
  useTreeVisible: () => ({ visible: false, beside: false, toggle: vi.fn() }),
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

const searchCache = vi.hoisted(() => ({
  hit: null as null | { filenameMatches: FileItem[]; filenameTotal: number; semanticHits: SemanticHit[]; ts: number },
}));
vi.mock("@/lib/searchCache", () => ({
  readSearchCache: () => searchCache.hit,
  writeSearchCache: vi.fn(),
  clearSearchCache: vi.fn(),
  searchCacheKey: (k: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
    `${k.drive}::${k.query}::${k.type ?? "all"}::${k.includeSceneClip ? 1 : 0}`,
}));

const ws = vi.hoisted(() => ({ fire: () => {} }));
vi.mock("@/hooks/useWebSocketRefresh", () => ({
  useWebSocketRefresh: (_events: readonly string[], onMatch: () => void) => {
    ws.fire = onMatch;
  },
}));

const observer = vi.hoisted(() => ({ instances: [] as MockIntersectionObserver[] }));

class MockIntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  readonly targets = new Set<Element>();
  constructor(
    readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.root = (options?.root as Element | null) ?? null;
    this.rootMargin = options?.rootMargin ?? "";
    observer.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const file = (id: string, overrides: Partial<FileItem> = {}): FileItem => ({
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
  ...overrides,
});

const clipHit = (
  id: string,
  options: { score?: number; file?: FileItem | null } = {},
): SemanticHit => {
  const score = options.score ?? 0.9;
  return {
    file_id: id,
    drive: "photos",
    filename: `${id}.jpg`,
    file_type: "image",
    score,
    match_types: ["clip_thumbnail"],
    segments: [{ time_range: null, matches: [{ type: "clip_thumbnail", score }] }],
    file: options.file === undefined ? file(id) : options.file,
  };
};

const transcriptHit = (id: string): SemanticHit => ({
  file_id: id,
  drive: "photos",
  filename: `${id}.mp4`,
  file_type: "video",
  score: 0.5,
  match_types: ["transcript"],
  segments: [{ time_range: [0, 4], matches: [{ type: "transcript", score: 0.5, text: "penguin" }] }],
  file: file(id, { file_type: "video", filename: `${id}.mp4`, mime_type: "video/mp4" }),
});

const manyHits = (count: number) =>
  Array.from({ length: count }, (_, i) => clipHit(`cont-${i + 1}`));

interface RecordedCall {
  path: string;
  query: Record<string, string>;
  method: string;
  headers: Record<string, string>;
}

const server = {
  addons: {} as Record<string, unknown>,
  pages: new Map<number, { items: FileItem[]; total: number }>(),
  semantic: [] as SemanticHit[],
  semanticAvailable: true,
  images: [] as SemanticHit[],
  imagesAvailable: true,
  imagesStatus: 200,
  favorite: null as FileItem | null,
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

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, "http://localhost");
  server.calls.push({
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    method: init?.method ?? "GET",
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
  });

  if (url.pathname === "/api/addons/status") return json({ addons: server.addons, slots: {} });

  if (url.pathname === "/api/drives/photos/files") {
    if (server.filesHandler) return server.filesHandler();
    const page = Number(url.searchParams.get("page") ?? "1");
    const entry = server.pages.get(page) ?? { items: [], total: 0 };
    return json({ data: entry.items, meta: { total: entry.total, page, limit: 30 } });
  }

  if (url.pathname === "/api/addons/intelligence/search") {
    if (server.searchHandler) return server.searchHandler();
    return json({ available: server.semanticAvailable, results: server.semantic });
  }

  if (url.pathname === "/api/addons/intelligence/search/images") {
    if (server.imagesHandler) return server.imagesHandler();
    return json(
      { available: server.imagesAvailable, results: server.images },
      server.imagesStatus,
    );
  }

  const favorite = /^\/api\/files\/([^/]+)\/favorite$/.exec(url.pathname);
  if (favorite) {
    return json(server.favorite ?? file(favorite[1], { is_favorite: true }));
  }

  if (url.pathname === "/api/files/batch/delete") return json({ deleted: 1, errors: [] });

  return json({}, 404);
});

function resetServer() {
  server.addons = {
    intelligence: { label: "Intelligence", icon: "sparkles", type: "external_service" },
  };
  server.pages = new Map([[1, { items: [file("f1"), file("f2")], total: 2 }]]);
  server.semantic = [clipHit("s1")];
  server.semanticAvailable = true;
  server.images = [];
  server.imagesAvailable = true;
  server.imagesStatus = 200;
  server.favorite = null;
  server.calls = [];
  server.filesHandler = null;
  server.searchHandler = null;
  server.imagesHandler = null;
  searchCache.hit = null;
  observer.instances = [];
  stableRouter.push.mockClear();
  stableRouter.replace.mockClear();
  invalidateAddonsCache();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
}

interface PageProps {
  searchQuery?: string;
  includeSceneClip?: boolean;
  typeFilter?: FileKind | null;
}

function renderSearch(props: PageProps = {}) {
  const tree = (p: PageProps) => (
    <FolderBrowser
      driveName="photos"
      searchQuery={p.searchQuery ?? "penguin"}
      includeSceneClip={p.includeSceneClip}
      typeFilter={p.typeFilter ?? null}
    />
  );
  const view = render(tree(props));
  return { ...view, rerenderPage: (p: PageProps) => view.rerender(tree(p)) };
}

const grid = () => screen.queryByTestId("rows");
const drawnIds = () => grid()?.getAttribute("data-ids")?.split(",").filter(Boolean) ?? [];
const offerButton = () => screen.queryByRole("button", { name: "Show more by similarity" });
const endSpinner = (container: HTMLElement) => container.querySelector(".h-6.animate-spin");
const imagesCalls = () =>
  server.calls.filter((call) => call.path === "/api/addons/intelligence/search/images");
const searchCalls = () =>
  server.calls.filter((call) => call.path === "/api/addons/intelligence/search");

async function settle() {
  await waitFor(() => expect(grid()).not.toBeNull());
}

async function clickShowMore(container: HTMLElement) {
  fireEvent.click(await screen.findByRole("button", { name: "Show more by similarity" }));
  await waitFor(() => expect(imagesCalls()).toHaveLength(1));
  return container;
}

async function reveal() {
  act(() => {
    for (const instance of [...observer.instances]) {
      for (const target of instance.targets) {
        instance.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          instance as unknown as IntersectionObserver,
        );
      }
    }
  });
}

function deferredImages() {
  let release: (response: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  server.imagesHandler = () => pending;
  return {
    answer: async (body: unknown, status = 200) => {
      await act(async () => release(json(body, status)));
    },
  };
}

function deferredPage() {
  let release: ((body: unknown) => void) | null = null;
  const pending = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  server.filesHandler = () => pending.then((body) => json(body));
  return {
    answer: async (body: unknown) => {
      server.filesHandler = null;
      await act(async () => release?.(body));
    },
  };
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

beforeEach(() => {
  resetServer();
});

describe("SPEC-CORE-035 I7 the search page asks for the whole first list", () => {
  it("asks /search for limit=1000 with the drive header", async () => {
    renderSearch();
    await settle();

    const calls = searchCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].query.q).toBe("penguin");
    expect(calls[0].query.limit).toBe("1000");
    expect(calls[0].headers["x-lit-drive"]).toBe("photos");
  });

  it("sends no /search/images request before the button is clicked", async () => {
    renderSearch();
    await settle();

    expect(offerButton()).not.toBeNull();
    expect(imagesCalls()).toHaveLength(0);
  });

  it("offers the button after the last result when every condition holds", async () => {
    renderSearch();
    await settle();

    const button = await screen.findByRole("button", { name: "Show more by similarity" });
    const lastRow = screen.getByTestId("row-s1");
    expect(lastRow.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button).toBeEnabled();
  });
});

describe("SPEC-CORE-035 I7 the button is drawn only while every condition in section 9 holds", () => {
  const rows: Array<[string, () => void, PageProps]> = [
    [
      "the intelligence addon is not available for the drive",
      () => {
        server.addons = {};
      },
      {},
    ],
    ["the query has an operator", () => {}, { searchQuery: "penguin tag:bird" }],
    ["Scene search is on", () => {}, { includeSceneClip: true }],
    [
      "the semantic results hold no clip_thumbnail match",
      () => {
        server.semantic = [transcriptHit("t1")];
      },
      {},
    ],
  ];

  it.each(rows)("hides the button when %s", async (_name, violate, props) => {
    const base = renderSearch();
    await settle();
    expect(await screen.findByRole("button", { name: "Show more by similarity" })).toBeInTheDocument();
    base.unmount();

    resetServer();
    violate();
    invalidateAddonsCache();
    renderSearch(props);
    await settle();

    expect(offerButton()).toBeNull();
    expect(imagesCalls()).toHaveLength(0);
  });

  it("hides the button when the sort is not Relevance", async () => {
    renderSearch();
    await settle();
    expect(await screen.findByRole("button", { name: "Show more by similarity" })).toBeInTheDocument();

    act(() => toolbar.latest.onSortChange("created_at", "desc"));

    await waitFor(() => expect(offerButton()).toBeNull());
    expect(imagesCalls()).toHaveLength(0);
  });

  it("hides the button while filename pages remain and offers it once they are complete", async () => {
    server.pages = new Map([
      [1, { items: Array.from({ length: 30 }, (_, i) => file(`p${i + 1}`)), total: 60 }],
      [2, { items: Array.from({ length: 30 }, (_, i) => file(`p${i + 31}`)), total: 60 }],
    ]);
    renderSearch();
    await settle();

    expect(offerButton()).toBeNull();

    await reveal();

    await waitFor(() => expect(drawnIds()).toHaveLength(61));
    expect(await screen.findByRole("button", { name: "Show more by similarity" })).toBeInTheDocument();
  });

  it("does not count the header popup's cached hits as the semantic results having arrived", async () => {
    const base = renderSearch();
    await settle();
    expect(await screen.findByRole("button", { name: "Show more by similarity" })).toBeInTheDocument();
    base.unmount();

    resetServer();
    searchCache.hit = {
      filenameMatches: [file("f1")],
      filenameTotal: 1,
      semanticHits: [clipHit("cached")],
      ts: Date.now(),
    };
    const pending = deferredSearch();

    renderSearch();

    await waitFor(() => expect(searchCalls()).toHaveLength(1));
    expect(offerButton()).toBeNull();

    await pending.answer({ available: true, results: [clipHit("s2")] });

    expect(await screen.findByRole("button", { name: "Show more by similarity" })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-035 I8 appended rows are deduplicated and keep the endpoint's order", () => {
  it("appends each returned file once, in order, after every row above", async () => {
    server.images = [clipHit("s1"), clipHit("c1"), clipHit("c2"), clipHit("f2")];
    const { container } = renderSearch();
    await settle();
    const above = drawnIds();

    await clickShowMore(container);
    await waitFor(() => expect(drawnIds()).toHaveLength(5));

    const ids = drawnIds();
    expect(ids.slice(0, above.length)).toEqual(above);
    expect(ids.slice(above.length)).toEqual(["c1", "c2"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("appends nothing and removes the button when every returned file is already in the list", async () => {
    server.images = [clipHit("f2"), clipHit("s1")];
    const { container } = renderSearch();
    await settle();
    const above = drawnIds();

    await clickShowMore(container);

    await waitFor(() => expect(offerButton()).toBeNull());
    expect(drawnIds()).toEqual(above);
    expect(endSpinner(container)).toBeNull();
  });
});

describe("SPEC-CORE-035 I9 the rows above and the heading count are untouched", () => {
  it("leaves the rows above in place and never counts appended rows in the heading", async () => {
    server.images = manyHits(250);
    const { container } = renderSearch();
    await settle();
    const above = drawnIds();
    const heading = screen.getByText(`${above.length} items`);
    expect(heading).toBeInTheDocument();

    await clickShowMore(container);
    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 100));

    expect(drawnIds().slice(0, above.length)).toEqual(above);
    expect(screen.getByText(`${above.length} items`)).toBeInTheDocument();
    expect(screen.queryByText(`${above.length + 100} items`)).toBeNull();

    await reveal();
    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 200));
    expect(drawnIds().slice(0, above.length)).toEqual(above);
    expect(screen.getByText(`${above.length} items`)).toBeInTheDocument();

    await reveal();
    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 250));
    expect(drawnIds().slice(0, above.length)).toEqual(above);
    expect(screen.getByText(`${above.length} items`)).toBeInTheDocument();
  });
});

describe("SPEC-CORE-035 I10 the answer is revealed 100 rows at a time", () => {
  it("draws the first 100 without a scroll and at most 100 per reveal", async () => {
    server.images = manyHits(250);
    const { container } = renderSearch();
    await settle();
    const above = drawnIds();

    await clickShowMore(container);

    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 100));
    expect(offerButton()).toBeNull();
    expect(endSpinner(container)).not.toBeNull();

    await reveal();
    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 200));
    expect(drawnIds().slice(above.length)).toEqual(
      manyHits(200).map((hit) => hit.file_id),
    );

    await reveal();
    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 250));
    expect(offerButton()).toBeNull();
    expect(endSpinner(container)).toBeNull();
  });

  it("draws no appended row while the filename pages are reloading or remain", async () => {
    server.images = manyHits(150);
    const { container } = renderSearch();
    await settle();
    const above = drawnIds();
    await clickShowMore(container);
    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 100));

    const reload = deferredPage();
    act(() => ws.fire());
    await waitFor(() => expect(grid()).toBeNull());

    await reload.answer({
      data: Array.from({ length: 30 }, (_, i) => file(`p${i + 1}`)),
      meta: { total: 60, page: 1, limit: 30 },
    });
    await waitFor(() => expect(drawnIds()).toHaveLength(31));
    expect(drawnIds()).not.toContain("cont-1");
    expect(offerButton()).toBeNull();

    server.pages = new Map([
      [1, { items: Array.from({ length: 30 }, (_, i) => file(`p${i + 1}`)), total: 60 }],
      [2, { items: Array.from({ length: 30 }, (_, i) => file(`p${i + 31}`)), total: 60 }],
    ]);

    await reveal();
    await reveal();

    await waitFor(() => expect(drawnIds()).toHaveLength(31 + 30 + 100));
    expect(drawnIds()).not.toContain("cont-101");
  });
});

describe("SPEC-CORE-035 I11 a failed or stale answer", () => {
  const failures: Array<[string, () => void]> = [
    [
      "a 502 from the proxy",
      () => {
        server.imagesStatus = 502;
      },
    ],
    [
      "available: false",
      () => {
        server.imagesAvailable = false;
      },
    ],
  ];

  it.each(failures)("stores nothing on %s and sends one request on the next click", async (_name, fail) => {
    fail();
    server.images = [];
    const { container } = renderSearch();
    await settle();
    const above = drawnIds();

    await clickShowMore(container);

    await waitFor(() => expect(imagesCalls()).toHaveLength(1));
    expect(drawnIds()).toEqual(above);
    const button = await screen.findByRole("button", { name: "Show more by similarity" });
    expect(button).toBeEnabled();

    server.imagesStatus = 200;
    server.imagesAvailable = true;
    server.images = [clipHit("c1")];
    fireEvent.click(screen.getByRole("button", { name: "Show more by similarity" }));

    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 1));
    expect(imagesCalls()).toHaveLength(2);
  });

  it("drops an answer that arrives after the search key changed", async () => {
    const { rerenderPage } = renderSearch();
    await settle();
    const above = drawnIds();
    const pending = deferredImages();

    fireEvent.click(screen.getByRole("button", { name: "Show more by similarity" }));
    await waitFor(() => expect(imagesCalls()).toHaveLength(1));

    rerenderPage({ searchQuery: "orca" });
    await settle();

    await pending.answer({ available: true, results: [clipHit("stale-1"), clipHit("stale-2")] });

    await waitFor(() => expect(drawnIds()).toEqual(above));
    expect(imagesCalls()).toHaveLength(1);
  });

  const keyChanges: Array<[string, (page: (props: PageProps) => void) => void]> = [
    ["the query", (rerenderPage) => rerenderPage({ searchQuery: "orca" })],
    ["the type", () => act(() => toolbar.latest.onTypeFilterChange("image"))],
    ["the sort", () => act(() => toolbar.latest.onSortChange("created_at", "desc"))],
    ["Scene search", (rerenderPage) => rerenderPage({ includeSceneClip: true })],
  ];

  it.each(keyChanges)("removes every appended row when %s changes", async (_name, change) => {
    server.images = [clipHit("c1"), clipHit("c2")];
    const { container, rerenderPage } = renderSearch();
    await settle();
    const above = drawnIds();
    await clickShowMore(container);
    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 2));

    change(rerenderPage);

    await waitFor(() => expect(drawnIds()).toEqual(above));
    expect(drawnIds()).not.toContain("c1");
  });
});

describe("SPEC-CORE-035 I12 everything that reads the list sees drawn rows only", () => {
  async function drawnPage() {
    server.images = manyHits(150);
    const view = renderSearch();
    await settle();
    const above = drawnIds();
    await clickShowMore(view.container);
    await waitFor(() => expect(drawnIds()).toHaveLength(above.length + 100));
    return { ...view, above };
  }

  it("Select all takes every drawn row and no undrawn one", async () => {
    await drawnPage();

    fireEvent.click(screen.getByRole("button", { name: "select f1" }));
    await screen.findByText("1 selected");
    fireEvent.click(screen.getByText("Select all"));

    expect(await screen.findByText("103 selected")).toBeInTheDocument();
    expect(screen.getByTestId("row-cont-100").getAttribute("data-selected")).toBe("true");
    expect(screen.queryByTestId("row-cont-150")).toBeNull();
  });

  it("a shift-range reaches drawn appended rows", async () => {
    server.images = [clipHit("c1"), clipHit("c2"), clipHit("c3"), clipHit("c4"), clipHit("c5")];
    const { container } = renderSearch();
    await settle();
    await clickShowMore(container);
    await waitFor(() => expect(drawnIds()).toHaveLength(8));

    fireEvent.click(screen.getByRole("button", { name: "select f2" }));
    await screen.findByText("1 selected");
    fireEvent.click(screen.getByRole("button", { name: "shift c2" }));

    expect(await screen.findByText("4 selected")).toBeInTheDocument();
    for (const inside of ["f2", "s1", "c1", "c2"]) {
      expect(screen.getByTestId(`row-${inside}`).getAttribute("data-selected")).toBe("true");
    }
    for (const outside of ["f1", "c3", "c4", "c5"]) {
      expect(screen.getByTestId(`row-${outside}`).getAttribute("data-selected")).toBe("false");
    }
  });

  it("hands the drawn rows to the addon folder-actions fileIds", async () => {
    await drawnPage();
    const drawn = drawnIds();

    expect(toolbar.latest.fileIds).toEqual(drawn);
    expect(toolbar.latest.fileIds).not.toContain("cont-150");
  });

  it.each([
    ["a drawn row", "cont-7.", 1],
    ["an undrawn row", "cont-150.", 0],
  ])("the text filter matches %s only", async (_name, text, expected) => {
    await drawnPage();

    fireEvent.change(screen.getByPlaceholderText("Filter in this folder..."), {
      target: { value: text },
    });

    await waitFor(() => expect(drawnIds()).toHaveLength(expected));
  });
});

describe("SPEC-CORE-035 I13 a viewer's own action on a drawn row", () => {
  it("toggles favorite on the appended row at once", async () => {
    server.images = [clipHit("c1")];
    const { container } = renderSearch();
    await settle();
    await clickShowMore(container);
    await waitFor(() => expect(drawnIds()).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Add c1 to favorites" }));

    expect(await screen.findByRole("button", { name: "Remove c1 from favorites" })).toBeInTheDocument();
    expect(screen.getByTestId("row-c1").getAttribute("data-favorite")).toBe("true");
    expect(imagesCalls()).toHaveLength(1);
  });

  it("removes a trashed appended row from the page", async () => {
    server.images = [clipHit("c1"), clipHit("c2")];
    const { container } = renderSearch();
    await settle();
    await clickShowMore(container);
    await waitFor(() => expect(drawnIds()).toHaveLength(5));

    fireEvent.click(screen.getByRole("button", { name: "select c1" }));
    await screen.findByText("1 selected");
    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
    const confirm = await screen.findAllByRole("button", { name: "Move to Trash" });
    fireEvent.click(confirm[confirm.length - 1]);

    await waitFor(() => expect(drawnIds()).not.toContain("c1"));
    expect(drawnIds()).toContain("c2");
    expect(imagesCalls()).toHaveLength(1);
  });
});

describe("SPEC-CORE-035 I15 (r1) the search page's own trust filter value", () => {
  it("adds no trust control and draws an unverified appended row", async () => {
    server.images = [
      clipHit("c1"),
      clipHit("c2", { file: file("c2", { trust_tier: "unverified" }) }),
    ];
    const { container } = renderSearch();
    await settle();
    await clickShowMore(container);
    await waitFor(() => expect(drawnIds()).toHaveLength(5));

    expect(toolbar.latest.onTrustFilterChange).toBeUndefined();
    expect(drawnIds()).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(imagesCalls()).toHaveLength(1);
  });
});

describe("SPEC-CORE-035 section 1 step 3 the continuation request", () => {
  it("sends one request carrying the query, the drive and the toolbar type", async () => {
    server.images = [clipHit("c1")];
    renderSearch({ typeFilter: "image" });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Show more by similarity" }));
    await waitFor(() => expect(imagesCalls()).toHaveLength(1));

    const call = imagesCalls()[0];
    expect(call.query.q).toBe("penguin");
    expect(call.query.type).toBe("image");
    expect(call.headers["x-lit-drive"]).toBe("photos");

    await waitFor(() => expect(drawnIds()).toHaveLength(4));
    expect(offerButton()).toBeNull();
    expect(imagesCalls()).toHaveLength(1);
  });

  it("shows the button busy and ignores a second click while the answer is in flight", async () => {
    const pending = deferredImages();
    renderSearch();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Show more by similarity" }));
    await waitFor(() => expect(imagesCalls()).toHaveLength(1));

    const busy = screen.getByRole("button", { name: "Show more by similarity" });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);

    expect(imagesCalls()).toHaveLength(1);
    await pending.answer({ available: true, results: [clipHit("c1")] });
    await waitFor(() => expect(drawnIds()).toHaveLength(4));
  });
});

