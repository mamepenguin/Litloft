/**
 * SPEC-CORE-172 in the search window: the new conditions reach the listing and
 * the meaning filter, an impossible combination requests nothing, a `-in:` name
 * only a Smart Collection carries is refused, and `-tag:` / `has:` values are
 * suggested.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GlobalSearch } from "../GlobalSearch";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { GlobalSearchProvider } from "../search/GlobalSearchProvider";
import { invalidateAddonsCache } from "@/lib/addons";
import type { FileItem } from "@/types";
import {
  fileIdsOf,
  installWireFetch,
  json,
  pagedListing,
  paramsOf,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";

const DRIVE = "main";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => DRIVE,
  useSetOverrideDrive: () => () => {},
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getWatchHistory: () => Promise.resolve([]),
  getFolderTree: () => Promise.resolve([]),
  getDriveTags: () => Promise.resolve(tagState.current),
  getPins: () => Promise.resolve([]),
  getDriveSummary: () => Promise.resolve({ missing_count: 0 }),
  getAuthStatus: () => Promise.resolve({ is_admin: false }),
}));

const tagState = vi.hoisted(() => ({ current: [] as { name: string; count: number }[] }));

const cache = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => cache.read(...args),
  writeSearchCache: (...args: unknown[]) => cache.write(...args),
  clearSearchCache: vi.fn(),
  searchCacheKey: (key: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
    `${key.drive}::${key.query}::${key.type ?? "all"}::${key.includeSceneClip ? 1 : 0}`,
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => <span data-testid={`icon-${fileType}`} />,
}));

Element.prototype.scrollIntoView = vi.fn();

function file(id: string): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.md`,
    title: id,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
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
  };
}

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
const MEMBERS = [file("m1"), file("m2")];

const server = {
  evaluate: null as null | ((call: WireCall) => Response | Promise<Response>),
  /** The saved query of each Smart Collection is a word; its members are that word's listing. */
  members: { dogs: MEMBERS, birds: [file("b1")] } as Record<string, FileItem[]>,
  addonOn: false,
  collections: (): Response | Promise<Response> => json([collection("c1", "Trip")]),
};
let wire: { calls: WireCall[] };

const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const evaluationWord = (c: WireCall) => {
  const word = c.url.searchParams.get("search") ?? "";
  return word in server.members ? word : null;
};
const isEvaluation = (c: WireCall) => isListing(c) && evaluationWord(c) !== null;
const evaluations = () => wire.calls.filter(isEvaluation);
/**
 * Asked once per drive for the module's lifetime, so only the first case of
 * the file to open the window sends it; it is not a request of the query.
 */
const IMAGE_AVAILABILITY = "/api/addons/intelligence/search/by-image/available";
const windowRequests = () =>
  wire.calls.filter(
    (c) =>
      (isListing(c) && !isEvaluation(c)) ||
      isFilesQuery(c) ||
      (c.url.pathname.startsWith("/api/addons/intelligence") &&
        c.url.pathname !== IMAGE_AVAILABILITY),
  );

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  server.evaluate = null;
  server.members = { dogs: MEMBERS, birds: [file("b1")] };
  server.addonOn = false;
  server.collections = () => json([collection("c1", "Trip")]);
  tagState.current = [];
  cache.read.mockReset().mockReturnValue(null);
  cache.write.mockReset();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  wire = installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/addons/status") {
      return json({
        addons: server.addonOn ? { intelligence: { label: "Intelligence", icon: "sparkles" } } : {},
        slots: {},
      });
    }
    if (path === `/api/drives/${DRIVE}/collections`) return server.collections();
    if (path === `/api/drives/${DRIVE}/smart-folders`) {
      return json([
        smartFolder("sf-weekly", "Weekly", "dogs"),
        smartFolder("sf-daily", "Daily", "birds"),
      ]);
    }
    const word = evaluationWord(call);
    if (isListing(call) && word) {
      return server.evaluate ? server.evaluate(call) : pagedListing(server.members[word], call);
    }
    if (isListing(call)) return pagedListing([file("g1")], call);
    if (isFilesQuery(call)) {
      const members = fileIdsOf(call);
      const data = members === null ? [file("p1")] : members.map((id) => file(id));
      return json({ data, meta: { total: data.length, page: 1, limit: 8 } });
    }
    if (path === "/api/addons/intelligence/search") {
      return json({ available: true, results: [] });
    }
    return json([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function shell() {
  return render(
    <ShortcutsProvider>
      <GlobalSearchProvider>
        <GlobalSearch />
      </GlobalSearchProvider>
    </ShortcutsProvider>,
  );
}

const input = () => screen.getAllByRole("textbox")[0];

function typeQuery(value: string) {
  fireEvent.change(input(), { target: { value } });
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });


const REFUSED = "A Smart Collection cannot be excluded";

const isMeaning = (c: WireCall) => c.url.pathname === "/api/addons/intelligence/search";
const windowListing = () => wire.calls.find((c) => (isListing(c) && !isEvaluation(c)) || isFilesQuery(c));
function filterOf(call: WireCall): Record<string, unknown> | null {
  const fromUrl = call.url.searchParams.get("filter");
  if (fromUrl) return JSON.parse(fromUrl) as Record<string, unknown>;
  const body = call.body as { filter?: unknown } | null;
  if (body && typeof body.filter === "string") return JSON.parse(body.filter) as Record<string, unknown>;
  if (body && body.filter && typeof body.filter === "object") return body.filter as Record<string, unknown>;
  return null;
}
const windowMeaning = () => wire.calls.find((c) => isMeaning(c) && filterOf(c) !== null);

function openWindow(query: string) {
  shell();
  fireEvent.click(screen.getByLabelText("Search"));
  typeQuery(query);
}

describe("SPEC-CORE-172 sending 3-4, I11: the window sends the new conditions", () => {
  it("to the listing and inside the meaning filter", async () => {
    server.addonOn = true;
    openWindow("京都 -tag:2023 -type:pdf -path:Work -is:favorite has:tag");

    await waitFor(() => expect(windowListing()).toBeDefined());
    await waitFor(() => expect(windowMeaning()).toBeDefined());

    const listing = windowListing()!;
    expect(paramsOf(listing, "exclude_tag")).toEqual(["2023"]);
    expect(paramsOf(listing, "exclude_type")).toEqual(["pdf"]);
    expect(paramsOf(listing, "exclude_folder")).toEqual(["Work"]);
    expect(paramsOf(listing, "favorite")).toEqual(["false"]);
    expect(paramsOf(listing, "has_tag")).toEqual(["true"]);
    expect(filterOf(windowMeaning()!)).toEqual({
      exclude_tags: ["2023"],
      exclude_kinds: ["pdf"],
      exclude_folders: ["Work"],
      favorite: false,
      has_tag: true,
    });
  });

  it("a regular collection's -in: name is sent as an excluded collection", async () => {
    openWindow('京都 -in:"Trip"');

    await waitFor(() => expect(windowListing()).toBeDefined());

    expect(paramsOf(windowListing()!, "exclude_collection")).toEqual(["Trip"]);
  });
});

describe("SPEC-CORE-172 I1: the window still loads its Go to rows when it opens", () => {
  it("an empty window asks for the drive's collections before anything is typed", async () => {
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    await settle();

    expect(wire.calls.filter((c) => c.url.pathname.endsWith("/collections"))).toHaveLength(1);
  });
});

describe("SPEC-CORE-172 I7: an impossible combination requests nothing in the window", () => {
  it.each([
    ["a tag in both polarities", "京都 tag:x -tag:X"],
    ["untagged with a tag", "京都 tag:x -has:tag"],
    ["a folder inside an excluded folder", "京都 path:A/b -path:A"],
    ["a collection in both polarities", '京都 in:"Trip" -in:"trip"'],
  ])("%s", async (_name, query) => {
    // The window's Go to rows load the drive's collections when it opens, before
    // any query; I1 keeps that. What the impossible query sends starts at typing.
    shell();
    fireEvent.click(screen.getByLabelText("Search"));
    await settle();
    wire.calls.length = 0;
    typeQuery(query);

    await settle();

    expect(windowRequests()).toEqual([]);
    expect(wire.calls.filter((c) => c.url.pathname.endsWith("/collections"))).toEqual([]);
    expect(screen.getByRole("group", { name: "Filters" })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-172 sending 1, I9: the window refuses a -in: Smart Collection", () => {
  it("shows the notice where no results would show, with no retry and no request", async () => {
    openWindow('cats -in:"Weekly"');

    expect(await screen.findByText(REFUSED)).toBeInTheDocument();
    await settle();

    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByText("No matching files found")).not.toBeInTheDocument();
    expect(windowRequests()).toEqual([]);
    expect(evaluations()).toEqual([]);
  });

  it("a failed collection list shows the failed message", async () => {
    server.collections = () => json({ detail: "boom" }, 500);
    openWindow('cats -in:"Trip"');

    expect(await screen.findByText(COULD_NOT_LOAD)).toBeInTheDocument();
    expect(windowRequests()).toEqual([]);
  });
});

const suggestionLabels = () =>
  Array.from(
    screen.queryByText("Suggestions")?.parentElement?.querySelectorAll("[data-search-item] > button:first-child") ?? [],
    (row) => row.textContent ?? "",
  );
const press = (key: string) => fireEvent.keyDown(input(), { key });

async function typeAndWait(query: string) {
  shell();
  fireEvent.click(screen.getByLabelText("Search"));
  await act(async () => {
    typeQuery(query);
  });
}

describe("SPEC-CORE-172 value suggestions, I15/I19", () => {
  beforeEach(() => {
    tagState.current = [
      { name: "旅館", count: 3 },
      { name: "旅行", count: 42 },
      { name: "料理", count: 7 },
    ];
  });

  it("-tag: suggests the drive's tags and completing keeps the -", async () => {
    await typeAndWait("京都 -tag:旅");

    await waitFor(() => expect(suggestionLabels()).toEqual(["旅行42", "旅館3"]));
    press("ArrowDown");
    press("Enter");

    expect((input() as HTMLInputElement).value).toBe("京都 -tag:旅行 ");
  });

  it.each([
    ["held positively", "tag:旅行 -tag:旅"],
    ["held negatively", "-tag:旅行 tag:旅"],
    ["held negatively in another case", "-TAG:旅行 -tag:旅"],
  ])("a tag %s is not suggested", async (_name, query) => {
    await typeAndWait(query);

    await waitFor(() => expect(suggestionLabels()).toEqual(["旅館3"]));
  });

  it("-type: suggests kinds and completing keeps the -", async () => {
    await typeAndWait("-type:pd");

    await waitFor(() => expect(suggestionLabels()).toHaveLength(1));
    press("ArrowDown");
    press("Enter");

    expect((input() as HTMLInputElement).value).toBe("-type:pdf ");
  });

  it.each([["has:"], ["-has:"]])("%s suggests tag and collection", async (query) => {
    await typeAndWait(query);

    await waitFor(() => expect(suggestionLabels()).toHaveLength(2));
  });

  it.each([
    ["has:tag -has:", "has:tag -has:collection "],
    ["-has:tag has:", "-has:tag has:collection "],
    ["has:collection -has:", "has:collection -has:tag "],
  ])("%s leaves out the value held in either polarity", async (query, completed) => {
    await typeAndWait(query);

    await waitFor(() => expect(suggestionLabels()).toHaveLength(1));
    press("ArrowDown");
    press("Enter");

    expect((input() as HTMLInputElement).value).toBe(completed);
  });
});
