/**
 * SPEC-CORE-172 on the search page: the new conditions reach the listing and
 * the meaning filter, an impossible combination requests nothing, and a `-in:`
 * name is classified with the `in:` names and refused when only a Smart
 * Collection carries it.
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
    if (isListing(call) && call.url.searchParams.get("exclude_folder") === "Work") {
      return pagedListing(many("k", 10_001), call);
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


const REFUSED = "A Smart Collection cannot be excluded";

const isPage = (c: WireCall) => (isListing(c) || isFilesQuery(c) || isMeaning(c)) && !isEvaluation(c);

function filterOf(call: WireCall): Record<string, unknown> | null {
  const fromUrl = call.url.searchParams.get("filter");
  if (fromUrl) return JSON.parse(fromUrl) as Record<string, unknown>;
  const body = call.body as { filter?: unknown } | null;
  if (body && typeof body.filter === "string") return JSON.parse(body.filter) as Record<string, unknown>;
  if (body && body.filter && typeof body.filter === "object") return body.filter as Record<string, unknown>;
  return null;
}

const pageListing = () => wire.calls.find((c) => (isListing(c) || isFilesQuery(c)) && !isEvaluation(c));
const pageMeaning = () => wire.calls.find((c) => isMeaning(c) && !isEvaluation(c) && filterOf(c) !== null);

describe("SPEC-CORE-172 sending 3-4, I11: the listing and the filter carry the new conditions", () => {
  it("sends every new condition to the listing and inside the meaning filter", async () => {
    server.addonOn = true;
    renderSearch({
      searchQuery: '京都 -tag:2023 -type:pdf -path:"Work/old" -is:favorite -is:liked has:tag -has:collection',
    });

    await waitFor(() => expect(pageListing()).toBeDefined());
    await waitFor(() => expect(pageMeaning()).toBeDefined());

    const listing = pageListing()!;
    expect(paramsOf(listing, "search")).toEqual(["京都"]);
    expect(paramsOf(listing, "exclude_tag")).toEqual(["2023"]);
    expect(paramsOf(listing, "exclude_type")).toEqual(["pdf"]);
    expect(paramsOf(listing, "exclude_folder")).toEqual(["Work/old"]);
    expect(paramsOf(listing, "favorite")).toEqual(["false"]);
    expect(paramsOf(listing, "liked")).toEqual(["false"]);
    expect(paramsOf(listing, "has_tag")).toEqual(["true"]);
    expect(paramsOf(listing, "has_collection")).toEqual(["false"]);

    expect(filterOf(pageMeaning()!)).toEqual({
      exclude_tags: ["2023"],
      exclude_kinds: ["pdf"],
      exclude_folders: ["Work/old"],
      favorite: false,
      liked: false,
      has_tag: true,
      has_collection: false,
    });
  });

  it("an operator-only query of exclusions lists every file that passes them", async () => {
    renderSearch({ searchQuery: "-path:Old" });

    await waitFor(() => expect(pageListing()).toBeDefined());

    const listing = pageListing()!;
    expect(paramsOf(listing, "exclude_folder")).toEqual(["Old"]);
    expect(paramsOf(listing, "search")).toEqual([]);
    await waitFor(() => expect(drawnIds()).toEqual(["g1"]));
  });

  it("sends only the new parameters that are set", async () => {
    renderSearch({ searchQuery: "京都 tag:会議 -tag:x" });

    await waitFor(() => expect(pageListing()).toBeDefined());

    const listing = pageListing()!;
    expect(paramsOf(listing, "tag")).toEqual(["会議"]);
    expect(paramsOf(listing, "exclude_tag")).toEqual(["x"]);
    for (const key of ["exclude_type", "exclude_folder", "exclude_collection", "has_tag", "has_collection", "favorite", "liked"]) {
      expect(paramsOf(listing, key)).toEqual([]);
    }
  });
});

describe("SPEC-CORE-172 the impossible combination, I7", () => {
  it.each([
    ["a tag in both polarities", "京都 tag:Trip -tag:trip", null],
    ["-has:tag with a tag", "京都 tag:x -has:tag", null],
    ["-has:tag with has:tag", "京都 has:tag -has:tag", null],
    ["favorite in both polarities", "京都 is:favorite -is:favorite", null],
    ["liked in both polarities", "京都 is:liked -is:liked", null],
    ["has:collection and -has:collection", "京都 has:collection -has:collection", null],
    ["a kind excluded by itself", "京都 type:video -type:video", null],
    ["a kind held by an excluded kind", "京都 type:pdf type:text -type:document", null],
    ["the page's fixed kind excluded", "京都 -type:image", "image"],
    ["a folder inside an excluded folder", "京都 path:A/b -path:A", null],
    ["every folder excluded", "京都 path:A path:B -path:A -path:B/c -path:B", null],
    ["a collection in both polarities", "京都 in:Trip -in:trip", null],
  ] as const)("%s requests nothing and loads no list", async (_name, query, typeFilter) => {
    server.addonOn = true;
    renderSearch({ searchQuery: query, typeFilter: typeFilter as FileKind | null });

    await settle();
    await settle();

    expect(wire.calls.filter(isPage)).toEqual([]);
    expect(listsOf("collections")).toEqual([]);
    expect(listsOf("smart-folders")).toEqual([]);
    expect(screen.queryByTestId("rows")).toBeNull();
    expect(screen.getByRole("group", { name: "Filters" })).toBeInTheDocument();
  });

  it.each([
    ["in:x -has:collection", 'in:"Trip" -has:collection', [["collection", "Trip"], ["has_collection", "false"]]],
    ["type:document -type:pdf", "type:document -type:pdf", [["type", "document"], ["exclude_type", "pdf"]]],
    ["path:A -path:A/b", "path:A -path:A/b", [["folder", "A"], ["exclude_folder", "A/b"]]],
  ] as const)("%s is requested", async (_name, query, expected) => {
    renderSearch({ searchQuery: query });

    await waitFor(() => expect(pageListing()).toBeDefined());

    const listing = pageListing()!;
    for (const [key, value] of expected) {
      expect(paramsOf(listing, key)).toContain(value);
    }
  });
});

describe("SPEC-CORE-172 sending 1, I9/I18: -in: names", () => {
  it("a regular collection's name is classified, then sent as an excluded collection", async () => {
    server.addonOn = true;
    renderSearch({ searchQuery: '京都 -in:"trip"' });

    await waitFor(() => expect(pageListing()).toBeDefined());
    await waitFor(() => expect(pageMeaning()).toBeDefined());

    const listing = pageListing()!;
    expect(listsOf("collections").length).toBeGreaterThan(0);
    expect(wire.calls.indexOf(listsOf("collections")[0])).toBeLessThan(wire.calls.indexOf(listing));
    expect(paramsOf(listing, "exclude_collection").map((n) => n.toLowerCase())).toEqual(["trip"]);
    expect(paramsOf(listing, "collection")).toEqual([]);
    expect((filterOf(pageMeaning()!)?.exclude_collections as string[]).map((n) => n.toLowerCase())).toEqual([
      "trip",
    ]);
  });

  it("a name nothing carries is sent as an excluded collection after both lists load", async () => {
    renderSearch({ searchQuery: '-in:"Nowhere"' });

    await waitFor(() => expect(pageListing()).toBeDefined());

    expect(listsOf("smart-folders").length).toBeGreaterThan(0);
    expect(paramsOf(pageListing()!, "exclude_collection")).toEqual(["Nowhere"]);
    expect(evaluations()).toEqual([]);
  });

  it("sends nothing while the collection list loads", async () => {
    server.collections = () => never();
    renderSearch({ searchQuery: '-in:"Trip"' });

    await waitFor(() => expect(listsOf("collections").length).toBeGreaterThan(0));
    await settle();

    expect(wire.calls.filter(isPage)).toEqual([]);
  });

  it("a failed list load shows the failed block, as for in:", async () => {
    server.collections = () => json({ detail: "boom" }, 500);
    renderSearch({ searchQuery: '-in:"Trip"' });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(COULD_NOT_LOAD);
    expect(wire.calls.filter(isPage)).toEqual([]);
  });

  it.each([['-in:"Weekly"'], ["cats -in:weekly"], ['in:"Daily" -in:"Weekly"']])(
    "%s is refused: the notice without retry, no results and no request",
    async (query) => {
      server.addonOn = true;
      renderSearch({ searchQuery: query });

      expect(await screen.findByText(REFUSED)).toBeInTheDocument();
      await settle();

      expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId("rows")).toBeNull();
      expect(wire.calls.filter(isPage)).toEqual([]);
      expect(evaluations()).toEqual([]);
      expect(listsOf("collections").length).toBeGreaterThan(0);
    },
  );

  it("the refused state is left by a change of the -in: names", async () => {
    const page = renderSearch({ searchQuery: '-in:"Weekly"' });
    expect(await screen.findByText(REFUSED)).toBeInTheDocument();

    page.rerenderPage({ searchQuery: '-in:"Trip"' });

    await waitFor(() => expect(pageListing()).toBeDefined());
    expect(screen.queryByText(REFUSED)).not.toBeInTheDocument();
    expect(paramsOf(pageListing()!, "exclude_collection")).toEqual(["Trip"]);
  });

  it("adding a -in: name classifies again and re-evaluates the in: Smart Collection", async () => {
    const page = renderSearch({ searchQuery: 'in:"Weekly"' });
    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));
    const before = evaluations().length;

    page.rerenderPage({ searchQuery: 'in:"Weekly" -in:"Trip"' });

    await waitFor(() => expect(evaluations().length).toBeGreaterThan(before));
    await waitFor(() =>
      expect(wire.calls.filter(isFilesQuery).some((c) => paramsOf(c, "exclude_collection").includes("Trip"))).toBe(
        true,
      ),
    );
  });

  it("an exclusion narrows an in: Smart Collection's members on the POST route", async () => {
    renderSearch({
      searchQuery: 'in:"Weekly" -tag:x -type:pdf -path:Old -in:"Trip" -is:favorite has:tag -has:collection',
    });

    await waitFor(() => expect(wire.calls.some(isFilesQuery)).toBe(true));

    const post = wire.calls.find(isFilesQuery)!;
    expect(idSet(post)).toEqual(ids(server.members.dogs));
    expect(paramsOf(post, "exclude_tag")).toEqual(["x"]);
    expect(paramsOf(post, "exclude_type")).toEqual(["pdf"]);
    expect(paramsOf(post, "exclude_folder")).toEqual(["Old"]);
    expect(paramsOf(post, "exclude_collection")).toEqual(["Trip"]);
    expect(paramsOf(post, "favorite")).toEqual(["false"]);
    expect(paramsOf(post, "has_tag")).toEqual(["true"]);
    expect(paramsOf(post, "has_collection")).toEqual(["false"]);
  });

  it("a query with a -in: name skips the search cache", async () => {
    renderSearch({ searchQuery: '京都 -in:"Trip"' });

    await waitFor(() => expect(pageListing()).toBeDefined());
    await settle();

    const touched = [...cache.read.mock.calls, ...cache.write.mock.calls].filter((args) =>
      JSON.stringify(args).includes("-in:"),
    );
    expect(touched).toEqual([]);
  });
});

describe("SPEC-CORE-172 sending 4, I11: Show more by similarity carries the filter", () => {
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

  it("sends the same new keys as the meaning search", async () => {
    viewPrefs.sort = "relevance";
    server.addonOn = true;
    server.meaningSearch = (call) =>
      call.url.pathname.endsWith("/search/images")
        ? json({ available: true, results: [clip("more")] })
        : json({ available: true, results: [clip("hit")] });
    renderSearch({ searchQuery: "cat -tag:2023 -has:collection" });

    await waitFor(() => expect(offer()).not.toBeNull());
    fireEvent.click(offer()!);
    await waitFor(() => expect(imageCalls().length).toBeGreaterThan(0));

    expect(filterOf(imageCalls()[0])).toMatchObject({ exclude_tags: ["2023"], has_collection: false });
    expect(filterOf(pageMeaning()!)).toMatchObject({ exclude_tags: ["2023"], has_collection: false });
  });
});

describe("SPEC-CORE-172 sending 9 the in: resolution stops early without free text", () => {
  const bigReads = () =>
    wire.calls.filter((c) => isListing(c) && c.url.searchParams.get("exclude_folder") === "Work");

  it("a Smart Collection of exclusions alone over 10,000 reads one page and is too large", async () => {
    server.smartFolders = [smartFolder("sf-big", "Big", "-path:Work")];
    renderSearch({ searchQuery: 'in:"Big"' });

    expect(await screen.findByText(TOO_LARGE, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(bigReads()).toHaveLength(1);
    expect(paramsOf(bigReads()[0], "search")).toEqual([]);
    expect(wire.calls.filter(isFilesQuery)).toEqual([]);
  });

  it("with free text every page is read", async () => {
    server.smartFolders = [smartFolder("sf-big", "Big", "cats -path:Work")];
    renderSearch({ searchQuery: 'in:"Big"' });

    expect(await screen.findByText(TOO_LARGE, {}, { timeout: 20_000 })).toBeInTheDocument();
    expect(bigReads().length).toBeGreaterThan(1);
    for (const call of bigReads()) expect(paramsOf(call, "search")).toEqual(["cats"]);
  }, 30_000);
});
