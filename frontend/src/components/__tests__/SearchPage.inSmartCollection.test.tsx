/**
 * SPEC-CORE-116 on the search page: an `in:` name that equals only a Smart
 * Collection is resolved to its members and sent as `file_ids` through the POST
 * routes; the page waits for the resolution, shows its failure, and reuses it
 * until the `in:` key changes.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAddonsCache } from "@/lib/addons";
import type { SemanticHit } from "@/lib/searchMerge";
import type { FileItem, FileKind } from "@/types";
import {
  fileIdsOf,
  installWireFetch,
  json,
  never,
  pagedListing,
  paramsOf,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";

import { FolderBrowser } from "../FolderBrowser";

const DRIVE = "photos";

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
const viewPrefs = vi.hoisted(() => ({ sort: "title" as string }));
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: viewPrefs.sort, order: "asc", setSort: vi.fn() }),
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

const cache = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => cache.read(...args),
  writeSearchCache: (...args: unknown[]) => cache.write(...args),
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

const collection = (id: string, name: string) => ({
  id,
  name,
  description: null,
  drive: DRIVE,
  item_count: 1,
  first_file_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const COULD_NOT_LOAD = "Could not load the collection";
const TOO_LARGE = "The scope is too large (up to 10,000 files). Narrow it down.";
const POSTED = [file("p1"), file("p2")];

const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => file(`${prefix}${i}`));

/** The saved query of each Smart Collection is a word; its members are the listing for that word. */
const server = {
  addonOn: false,
  statusFails: false,
  collections: (): Response | Promise<Response> => json([collection("c1", "Trip")]),
  members: {
    dogs: [file("m1"), file("m2"), file("m3")],
    birds: [file("b1")],
  } as Record<string, FileItem[]>,
  smartFolders: [] as ReturnType<typeof smartFolder>[],
  evaluate: null as null | ((call: WireCall) => Response | Promise<Response>),
  meaningSearch: null as null | ((call: WireCall) => Response | Promise<Response>),
};
let wire: { calls: WireCall[] };

const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const isMeaning = (c: WireCall) => c.url.pathname.startsWith("/api/addons/intelligence/search");
const evaluationWord = (c: WireCall) => {
  const word = c.url.searchParams.get(isMeaning(c) ? "q" : "search");
  return word && word in server.members ? word : null;
};
const isEvaluation = (c: WireCall) => (isListing(c) || (isMeaning(c) && c.method === "GET")) && evaluationWord(c) !== null;
const evaluations = () => wire.calls.filter((c) => isListing(c) && evaluationWord(c) !== null);
const pageRequests = () =>
  wire.calls.filter((c) => (isListing(c) || isFilesQuery(c) || isMeaning(c)) && !isEvaluation(c));
const listsOf = (kind: "collections" | "smart-folders") =>
  wire.calls.filter((c) => c.url.pathname === `/api/drives/${DRIVE}/${kind}`);

function install() {
  wire = installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/addons/status") {
      if (server.statusFails) return json({ detail: "boom" }, 500);
      return json({
        addons: server.addonOn ? { intelligence: { label: "Intelligence", icon: "sparkles" } } : {},
        slots: {},
      });
    }
    if (path === `/api/drives/${DRIVE}/collections`) return server.collections();
    if (path === `/api/drives/${DRIVE}/smart-folders`) return json(server.smartFolders);
    const word = evaluationWord(call);
    if (isListing(call) && word) {
      if (server.evaluate) return server.evaluate(call);
      return pagedListing(server.members[word], call);
    }
    if (isListing(call)) return pagedListing([file("g1")], call);
    if (isFilesQuery(call)) return pagedListing(POSTED, call);
    if (isMeaning(call)) {
      if (server.meaningSearch) return server.meaningSearch(call);
      return json({ available: true, results: [], total: 0 });
    }
    return json({}, 404);
  });
}

beforeEach(() => {
  viewPrefs.sort = "title";
  server.addonOn = false;
  server.statusFails = false;
  server.collections = () => json([collection("c1", "Trip")]);
  server.members = { dogs: [file("m1"), file("m2"), file("m3")], birds: [file("b1")] };
  server.smartFolders = [
    smartFolder("sf-weekly", "Weekly", "dogs"),
    smartFolder("sf-daily", "Daily", "birds"),
    smartFolder("sf-trip", "Trip", "dogs"),
  ];
  server.evaluate = null;
  server.meaningSearch = null;
  cache.read.mockReset().mockReturnValue(null);
  cache.write.mockReset();
  router.push.mockClear();
  router.replace.mockClear();
  invalidateAddonsCache();
  install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface PageProps {
  searchQuery: string;
  typeFilter?: FileKind | null;
  show?: "passages";
}

function tree(props: PageProps) {
  return (
    <FolderBrowser
      driveName={DRIVE}
      searchQuery={props.searchQuery}
      typeFilter={props.typeFilter ?? null}
      show={props.show}
    />
  );
}

function renderSearch(props: PageProps) {
  const view = render(tree(props));
  return { ...view, rerenderPage: (next: PageProps) => view.rerender(tree(next)) };
}

const drawnIds = () => screen.queryByTestId("rows")?.getAttribute("data-ids")?.split(",").filter(Boolean) ?? [];
const idSet = (c: WireCall) => new Set(fileIdsOf(c));
const ids = (files: FileItem[]) => new Set(files.map((f) => f.id));
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

function expectNoSmartNameSent(name: string) {
  for (const c of wire.calls.filter((c) => !isEvaluation(c))) {
    for (const value of paramsOf(c, "collection")) expect(value.toLowerCase()).not.toBe(name.toLowerCase());
    const filter = c.url.searchParams.get("filter");
    if (filter) {
      const names = ((JSON.parse(filter) as { collections?: string[] }).collections ?? []).map((n) => n.toLowerCase());
      expect(names).not.toContain(name.toLowerCase());
    }
  }
}

describe("SPEC-CORE-116 steps 1-2, I4: in: naming a Smart Collection", () => {
  it.each([
    ['in:"Weekly"'],
    ["in:weekly"],
  ])("%s lists through POST files/query with the members as file_ids", async (query) => {
    renderSearch({ searchQuery: query });

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    const posts = wire.calls.filter(isFilesQuery);
    for (const call of posts) {
      expect(call.method).toBe("POST");
      expect(idSet(call)).toEqual(ids(server.members.dogs));
      expect(paramsOf(call, "collection")).toEqual([]);
    }
    expect(wire.calls.filter((c) => isListing(c) && !isEvaluation(c))).toEqual([]);
    expectNoSmartNameSent("Weekly");
    await waitFor(() => expect(drawnIds()).toEqual(POSTED.map((f) => f.id)));
  });

  it("a collection and a Smart Collection: the collection is sent by name, the Smart Collection as members", async () => {
    renderSearch({ searchQuery: 'in:"Trip" in:"Weekly"' });

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    const post = wire.calls.find(isFilesQuery)!;
    expect(paramsOf(post, "collection")).toEqual(["Trip"]);
    expect(idSet(post)).toEqual(ids(server.members.dogs));
    expect(evaluations().every((c) => c.url.searchParams.get("search") === "dogs")).toBe(true);
  });

  it("two Smart Collections send the union of their members", async () => {
    renderSearch({ searchQuery: 'in:"Weekly" in:"Daily"' });

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    expect(idSet(wire.calls.find(isFilesQuery)!)).toEqual(
      new Set([...ids(server.members.dogs), ...ids(server.members.birds)]),
    );
  });

  it("a name equal to a collection and a Smart Collection is the collection, and is never evaluated", async () => {
    renderSearch({ searchQuery: 'in:"trip"' });

    await waitFor(() => expect(listsOf("collections").length).toBeGreaterThan(0));
    await waitFor(() => expect(wire.calls.some((c) => isListing(c) && !isEvaluation(c))).toBe(true));

    const listing = wire.calls.find((c) => isListing(c) && !isEvaluation(c))!;
    expect(paramsOf(listing, "collection").map((n) => n.toLowerCase())).toEqual(["trip"]);
    expect(evaluations()).toEqual([]);
    expect(wire.calls.filter(isFilesQuery)).toEqual([]);
    expect(listsOf("smart-folders")).toEqual([]);
    expect(wire.calls.indexOf(listsOf("collections")[0])).toBeLessThan(wire.calls.indexOf(listing));
  });

  it("a name equal to neither kind is sent as a collection name after both lists load, without evaluation", async () => {
    renderSearch({ searchQuery: 'in:"Nowhere"' });

    await waitFor(() => expect(listsOf("smart-folders").length).toBeGreaterThan(0));
    await waitFor(() => expect(wire.calls.some((c) => isListing(c) && !isEvaluation(c))).toBe(true));

    const listing = wire.calls.find((c) => isListing(c) && !isEvaluation(c))!;
    expect(paramsOf(listing, "collection")).toEqual(["Nowhere"]);
    expect(evaluations()).toEqual([]);
    expect(wire.calls.filter(isFilesQuery)).toEqual([]);
    expect(wire.calls.indexOf(listsOf("smart-folders")[0])).toBeLessThan(wire.calls.indexOf(listing));
  });

  it("meaning search goes through the intelligence POST route with the same file_ids", async () => {
    server.addonOn = true;
    renderSearch({ searchQuery: 'cats in:"Weekly"' });

    await waitFor(() => expect(wire.calls.some((c) => isMeaning(c) && c.method === "POST")).toBe(true));
    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    const listingIds = idSet(wire.calls.find(isFilesQuery)!);
    const meaning = wire.calls.filter((c) => isMeaning(c) && !isEvaluation(c));
    expect(meaning.length).toBeGreaterThan(0);
    for (const call of meaning) {
      expect(call.method).toBe("POST");
      expect(idSet(call)).toEqual(listingIds);
    }
    expect(listingIds).toEqual(ids(server.members.dogs));
    expectNoSmartNameSent("Weekly");
  });

  it("meaning search answering 404 is not a failure: the members are the listing alone", async () => {
    server.addonOn = true;
    server.meaningSearch = (call) =>
      call.method === "GET" ? json({ detail: "Not Found" }, 404) : json({ available: true, results: [], total: 0 });
    renderSearch({ searchQuery: 'in:"Weekly"' });

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    expect(idSet(wire.calls.find(isFilesQuery)!)).toEqual(ids(server.members.dogs));
    expect(screen.queryByText(COULD_NOT_LOAD)).not.toBeInTheDocument();
  });

  it("10,000 members are sent", async () => {
    server.members.dogs = many("k", 10_000);
    renderSearch({ searchQuery: 'in:"Weekly"' });

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true), { timeout: 10_000 });

    expect(idSet(wire.calls.find(isFilesQuery)!).size).toBe(10_000);
    expect(screen.queryByText(TOO_LARGE)).not.toBeInTheDocument();
  });

  it("two Smart Collections sharing 6,000 members are 6,000, not 12,000", async () => {
    server.members.dogs = many("s", 6_000);
    server.members.birds = many("s", 6_000);
    renderSearch({ searchQuery: 'in:"Weekly" in:"Daily"' });

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true), { timeout: 10_000 });

    expect(idSet(wire.calls.find(isFilesQuery)!).size).toBe(6_000);
  });
});

describe("SPEC-CORE-116 step 3, I5: while resolving, failed and too large", () => {
  it("sends no listing or meaning-search request while the evaluation runs", async () => {
    server.addonOn = true;
    server.evaluate = () => never();
    renderSearch({ searchQuery: 'cats in:"Weekly"' });

    await waitFor(() => expect(evaluations().length).toBeGreaterThan(0));
    await settle();

    expect(pageRequests()).toEqual([]);
    expect(screen.queryByTestId("rows")).toBeNull();
  });

  it("sends nothing while the collection list loads", async () => {
    server.collections = () => never();
    renderSearch({ searchQuery: 'in:"Trip"' });

    await waitFor(() => expect(listsOf("collections").length).toBeGreaterThan(0));
    await settle();

    expect(pageRequests()).toEqual([]);
  });

  it.each([
    ["the evaluation's listing fails", () => (server.evaluate = () => json({ detail: "boom" }, 500)), false],
    ["the collection list fails", () => (server.collections = () => json({ detail: "boom" }, 500)), false],
    [
      "the evaluation's meaning search fails",
      () => (server.meaningSearch = (c: WireCall) => (c.method === "GET" ? json({ detail: "x" }, 502) : json({ available: true, results: [] }))),
      true,
    ],
    ["the addon status lookup fails", () => (server.statusFails = true), true],
  ])("%s: the failed block with retry, and no result list", async (_label, arrange, addonOn) => {
    server.addonOn = addonOn;
    arrange();
    renderSearch({ searchQuery: 'in:"Weekly"' });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(COULD_NOT_LOAD);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(pageRequests()).toEqual([]);
    expect(screen.queryByTestId("rows")).toBeNull();
  });

  it("the Passages view shows the same failed block", async () => {
    server.addonOn = true;
    server.evaluate = () => json({ detail: "boom" }, 500);
    renderSearch({ searchQuery: 'cats in:"Weekly"', show: "passages" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(COULD_NOT_LOAD);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(pageRequests()).toEqual([]);
  });

  it("the Passages view shows the too-large block without retry", async () => {
    server.addonOn = true;
    server.members.dogs = many("k", 10_001);
    renderSearch({ searchQuery: 'cats in:"Weekly"', show: "passages" });

    expect(await screen.findByText(TOO_LARGE, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(pageRequests()).toEqual([]);
  });

  it("retry resolves again, lists included, and then lists", async () => {
    server.collections = () => json({ detail: "boom" }, 500);
    renderSearch({ searchQuery: 'in:"Weekly"' });
    const retry = await screen.findByRole("button", { name: /retry/i });
    const collectionLoads = listsOf("collections").length;

    server.collections = () => json([collection("c1", "Trip")]);
    fireEvent.click(retry);

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    expect(listsOf("collections").length).toBeGreaterThan(collectionLoads);
    expect(idSet(wire.calls.find(isFilesQuery)!)).toEqual(ids(server.members.dogs));
    expect(screen.queryByText(COULD_NOT_LOAD)).not.toBeInTheDocument();
  });

  it.each([
    ["one Smart Collection over 10,000", 'in:"Weekly"', () => (server.members.dogs = many("k", 10_001))],
    [
      "a union over 10,000",
      'in:"Weekly" in:"Daily"',
      () => {
        server.members.dogs = many("d", 6_000);
        server.members.birds = many("b", 5_000);
      },
    ],
  ])("%s: the too-large block with no retry", async (_label, query, arrange) => {
    arrange();
    renderSearch({ searchQuery: query });

    expect(await screen.findByText(TOO_LARGE, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(pageRequests()).toEqual([]);
    expect(screen.queryByTestId("rows")).toBeNull();
  });
});

describe("SPEC-CORE-116 step 3, I4: a resolution is reused until the in: key changes", () => {
  it("a free-text or type change keeps the member set without evaluating again", async () => {
    const page = renderSearch({ searchQuery: 'in:"Weekly"' });
    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    const evaluated = evaluations().length;
    const collectionLoads = listsOf("collections").length;

    server.members.dogs = [file("changed")];
    page.rerenderPage({ searchQuery: 'cats in:"weekly"' });
    await waitFor(() =>
      expect(wire.calls.filter(isFilesQuery).some((c) => c.url.searchParams.get("search") === "cats")).toBe(true),
    );
    page.rerenderPage({ searchQuery: 'cats in:"weekly"', typeFilter: "image" });
    await waitFor(() => expect(wire.calls.filter(isFilesQuery).some((c) => paramsOf(c, "type").length > 0)).toBe(true));

    expect(evaluations().length).toBe(evaluated);
    expect(listsOf("collections").length).toBe(collectionLoads);
    for (const call of wire.calls.filter(isFilesQuery)) {
      expect(idSet(call)).toEqual(new Set(["m1", "m2", "m3"]));
    }
  });

  it("a change of the in: key resolves again", async () => {
    const page = renderSearch({ searchQuery: 'in:"Weekly"' });
    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    page.rerenderPage({ searchQuery: 'in:"Daily"' });

    await waitFor(() =>
      expect(wire.calls.filter(isFilesQuery).some((c) => idSet(c).has("b1"))).toBe(true),
    );
    const last = wire.calls.filter(isFilesQuery).at(-1)!;
    expect(idSet(last)).toEqual(ids(server.members.birds));
  });

  it("a key change while resolving discards the running resolution", async () => {
    let releaseWeekly: (r: Response) => void = () => {};
    server.evaluate = (call) => {
      if (call.url.searchParams.get("search") === "dogs") {
        return new Promise<Response>((resolve) => {
          releaseWeekly = () => resolve(pagedListing([file("m1"), file("m2"), file("m3")], call));
        });
      }
      return pagedListing(server.members.birds, call);
    };
    const page = renderSearch({ searchQuery: 'in:"Weekly"' });
    await waitFor(() => expect(evaluations().some((c) => c.url.searchParams.get("search") === "dogs")).toBe(true));

    page.rerenderPage({ searchQuery: 'in:"Daily"' });
    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    await act(async () => releaseWeekly(json({})));
    await settle();

    for (const call of wire.calls.filter(isFilesQuery)) {
      expect(idSet(call)).toEqual(ids(server.members.birds));
    }
  });
});

describe("SPEC-CORE-116 step 5, I5: a query with an in: name skips the search cache", () => {
  it.each([['in:"Weekly"'], ['in:"Trip"']])("%s is neither read from nor written to the cache", async (query) => {
    renderSearch({ searchQuery: query });

    await waitFor(() => expect(listsOf("collections").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByTestId("rows")).not.toBeNull());
    await settle();

    const touched = [...cache.read.mock.calls, ...cache.write.mock.calls].filter((args) =>
      JSON.stringify(args).includes("in:"),
    );
    expect(touched).toEqual([]);
  });
});

describe("SPEC-CORE-116 step 6, I10: ＋ 条件 → Collection on the search page lists both kinds", () => {
  const rows = () => screen.queryAllByRole("menuitem").map((row) => row.textContent?.trim() ?? "");
  const iconOf = (name: string) =>
    screen.getByRole("menuitem", { name }).querySelector("svg")?.getAttribute("class") ?? "";

  it("one collator-ordered list with each kind's icon; choosing a Smart Collection adds in:", async () => {
    server.collections = () => json([collection("c1", "b10"), collection("c2", "Alpha")]);
    server.smartFolders = [smartFolder("sf-1", "B2", "dogs"), smartFolder("sf-2", "alpha 2", "birds")];
    renderSearch({ searchQuery: "cats" });

    fireEvent.click(screen.getByRole("button", { name: /(\+|Add filter)/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Collection" }));

    await waitFor(() => expect(rows()).toEqual(["Alpha", "alpha 2", "B2", "b10"]));
    expect(iconOf("Alpha")).toContain("lucide-library");
    expect(iconOf("B2")).toContain("lucide-list-filter");

    router.push.mockClear();
    router.replace.mockClear();
    fireEvent.click(screen.getByRole("menuitem", { name: "B2" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    const target = String(router.push.mock.calls[0][0]);
    const q = new URL(target, "http://localhost").searchParams.get("q") ?? "";
    expect(q).toMatch(/^cats in:"?B2"?$/);
  });
});

describe("SPEC-CORE-116 step 2, I4/I5 and SPEC-CORE-035 I11: an in: resolution owns its image continuation", () => {
  const clip = (id: string): SemanticHit => ({
    file_id: id,
    drive: DRIVE,
    filename: `${id}.jpg`,
    file_type: "image",
    score: 0.9,
    match_types: ["clip_thumbnail"],
    segments: [{ time_range: null, matches: [{ type: "clip_thumbnail", score: 0.9 }] }],
    file: file(id),
  });
  const imageCalls = () => wire.calls.filter((c) => c.url.pathname.endsWith("/search/images"));
  const offer = () => screen.queryByRole("button", { name: "Show more by similarity" });

  /** The evaluation's own meaning search is a GET; the page's is the POST that carries the members. */
  function meaning(rows: (call: WireCall) => SemanticHit[]) {
    server.meaningSearch = (call) =>
      call.url.pathname.endsWith("/search/images")
        ? json({ available: true, results: rows(call) })
        : json({ available: true, results: call.method === "GET" ? [] : [clip("hit")] });
  }

  it("sends A's members with the continuation, and B neither keeps A's rows nor reuses A's answer", async () => {
    viewPrefs.sort = "relevance";
    server.addonOn = true;
    meaning((call) => ((fileIdsOf(call) ?? []).includes("m1") ? [clip("a-only")] : [clip("b-only")]));
    const page = renderSearch({ searchQuery: 'cat in:"Weekly"' });

    await waitFor(() => expect(offer()).not.toBeNull());
    fireEvent.click(offer()!);
    await waitFor(() => expect(drawnIds()).toContain("a-only"));
    expect(imageCalls()).toHaveLength(1);
    expect(idSet(imageCalls()[0])).toEqual(ids(server.members.dogs));

    page.rerenderPage({ searchQuery: 'cat in:"Daily"' });
    await waitFor(() => expect(wire.calls.filter(isFilesQuery).some((c) => idSet(c).has("b1"))).toBe(true));
    await settle();

    expect(drawnIds()).not.toContain("a-only");
    await waitFor(() => expect(offer()).not.toBeNull());
    fireEvent.click(offer()!);

    await waitFor(() => expect(drawnIds()).toContain("b-only"));
    expect(drawnIds()).not.toContain("a-only");
    expect(imageCalls()).toHaveLength(2);
    expect(idSet(imageCalls()[1])).toEqual(ids(server.members.birds));
  });

  it("removing one chip from a union does not keep the union's image rows", async () => {
    viewPrefs.sort = "relevance";
    server.addonOn = true;
    meaning((call) => ((fileIdsOf(call) ?? []).includes("b1") ? [clip("union-only")] : [clip("weekly-only")]));
    const page = renderSearch({ searchQuery: 'cat in:"Weekly" in:"Daily"' });

    await waitFor(() => expect(offer()).not.toBeNull());
    fireEvent.click(offer()!);
    await waitFor(() => expect(drawnIds()).toContain("union-only"));
    expect(new Set(fileIdsOf(imageCalls()[0]))).toEqual(
      new Set([...ids(server.members.dogs), ...ids(server.members.birds)]),
    );

    page.rerenderPage({ searchQuery: 'cat in:"Weekly"' });
    await waitFor(() =>
      expect(
        wire.calls.filter(isFilesQuery).some((c) => idSet(c).has("m1") && !idSet(c).has("b1")),
      ).toBe(true),
    );
    await settle();

    expect(drawnIds()).not.toContain("union-only");
    await waitFor(() => expect(offer()).not.toBeNull());
    fireEvent.click(offer()!);

    await waitFor(() => expect(drawnIds()).toContain("weekly-only"));
    expect(drawnIds()).not.toContain("union-only");
    expect(idSet(imageCalls()[1])).toEqual(ids(server.members.dogs));
  });
});
