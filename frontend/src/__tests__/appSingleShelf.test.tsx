import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { readTargetView, writeAppPrefs, writeTargetView, type AppId } from "@/lib/appPrefs";
import { resetLibraryFilters, writeLibraryFilters } from "@/components/appshell/libraryFilters";
import { invalidateAddonsCache } from "@/lib/addons";
import { installWireFetch, json, type WireCall } from "@/__tests__/helpers/wireFetch";
import enMessages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";

const DRIVE = "main";

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { pathname: "/drive/main/apps/video", search: new URLSearchParams() };
  const apply = (href: string) => {
    const url = new URL(href, `http://localhost${state.pathname}`);
    state.pathname = url.pathname;
    state.search = new URLSearchParams(url.search);
    for (const listener of [...listeners]) listener();
  };
  return {
    state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset(pathname: string, query: string) {
      state.pathname = pathname;
      state.search = new URLSearchParams(query);
    },
    go: apply,
    push: vi.fn(),
    replace: vi.fn(),
  };
});

vi.mock("next/navigation", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    usePathname: () => React.useSyncExternalStore(nav.subscribe, () => nav.state.pathname),
    useSearchParams: () => React.useSyncExternalStore(nav.subscribe, () => nav.state.search),
    useParams: () => ({ name: "main" }),
    useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
  };
});

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: "main",
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

configure({ asyncUtilTimeout: 3000 });

const VideoRoute = (await import("@/app/drive/[name]/apps/video/page")).default;
const ReadingRoute = (await import("@/app/drive/[name]/apps/reading/page")).default;

interface AppCase {
  id: AppId;
  Route: () => React.ReactNode;
  emptyText: string;
  /** The stored view that opens the Library on None. */
  noneView: { group?: string };
  groupings: [string, string][];
}

const APPS: AppCase[] = [
  {
    id: "video",
    Route: VideoRoute,
    emptyText: "No files",
    noneView: { group: "all" },
    groupings: [
      ["folder", "Folder"],
      ["tag", "Tag"],
      ["month", "Date Added"],
      ["duration", "Length"],
    ],
  },
  {
    id: "reading",
    Route: ReadingRoute,
    emptyText: "No books",
    noneView: {},
    groupings: [
      ["folder", "Folder"],
      ["tag", "Tag"],
      ["month", "Date Added"],
    ],
  },
];

// ---- the wire -------------------------------------------------------------------

const path = (c: WireCall) => c.url.pathname;
const isShelves = (c: WireCall) =>
  path(c) === `/api/drives/${DRIVE}/shelves` || path(c) === `/api/drives/${DRIVE}/shelves/query`;
const isListing = (c: WireCall) =>
  path(c) === `/api/drives/${DRIVE}/files` || path(c) === `/api/drives/${DRIVE}/files/query`;

/** Every value of `key`, from the query string and from a POST body alike. */
function vals(c: WireCall, key: string): string[] {
  const fromQuery = c.url.searchParams.getAll(key);
  const body = c.body as Record<string, unknown> | null;
  const raw = body && typeof body === "object" ? body[key] : undefined;
  const fromBody = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw.map(String) : [String(raw)];
  return [...fromQuery, ...fromBody];
}

const one = (c: WireCall, key: string) => vals(c, key)[0] ?? null;

/** Every parameter a call carries, keyed and sorted, whatever form it was sent in. */
function conds(c: WireCall): Record<string, string[]> {
  const keys = new Set<string>(c.url.searchParams.keys());
  const body = c.body as Record<string, unknown> | null;
  if (body && typeof body === "object") for (const k of Object.keys(body)) keys.add(k);
  return Object.fromEntries([...keys].sort().map((k) => [k, vals(c, k)]));
}

const isChips = (c: WireCall) => isShelves(c) && one(c, "by") === "folder" && one(c, "shelf_limit") === "24";
const isCount = (c: WireCall) =>
  (isListing(c) && one(c, "limit") === "1") ||
  (isShelves(c) && one(c, "by") === "all" && one(c, "per_shelf") === "1");
const isGrid = (c: WireCall) =>
  isShelves(c) &&
  one(c, "by") === "all" &&
  one(c, "key") === "all" &&
  one(c, "per_shelf") === "60" &&
  vals(c, "ids").length === 0;
const isGrouped = (c: WireCall) =>
  isShelves(c) && !isChips(c) && !isCount(c) && one(c, "by") !== "all" && one(c, "key") !== "continue";

let wire: { calls: WireCall[] };
const gridCalls = () => wire.calls.filter(isGrid);
const groupedCalls = () => wire.calls.filter(isGrouped);

// ---- the answers ----------------------------------------------------------------

type Answer = (call: WireCall) => Response | Promise<Response>;

function item(id: string, title: string, app: AppId) {
  return {
    id,
    filename: app === "video" ? `${title}.mp4` : `${title}.pdf`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: app === "video" ? "video" : "document",
    mime_type: app === "video" ? "video/mp4" : "application/pdf",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1,
    duration: app === "video" ? 120 : null,
    image_width: null,
    image_height: null,
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
  };
}

let app: AppCase;

interface ShelfSpec {
  key: string;
  label: string;
  count: number;
}

function shelvesAnswer(by: string, base: string, specs: ShelfSpec[]): Response {
  return json({
    by,
    base,
    total_shelves: specs.length,
    shelves: specs.map((s) => ({ ...s, items: [item(`s-${s.key || "root"}`, `Shelf card ${s.label || "root"}`, app.id)] })),
  });
}

/** The one shelf a grouping yields at Videos/Study. */
const SINGLE: Record<string, ShelfSpec> = {
  folder: { key: "Videos/Study/", label: "Study", count: 3 },
  tag: { key: "Trip", label: "Trip", count: 3 },
  month: { key: "2026-03", label: "2026-03", count: 3 },
  duration: { key: "long", label: "long", count: 3 },
};

const singleShelf: Answer = (call) => {
  const by = one(call, "by") ?? "";
  return shelvesAnswer(by, "Videos/Study", [SINGLE[by] ?? { key: "k", label: "Only", count: 3 }]);
};

const twoTagShelves: Answer = (call) =>
  shelvesAnswer(one(call, "by") ?? "tag", "", [
    { key: "Trip", label: "Trip", count: 2 },
    { key: "Kyoto", label: "Kyoto", count: 1 },
  ]);

const noShelves: Answer = (call) => shelvesAnswer(one(call, "by") ?? "tag", "", []);

/** The None grid's pages; the sort names the cards so a re-sorted grid is told apart. */
const defaultGrid: Answer = (call) => {
  const page = Number(one(call, "page") ?? "1");
  const prefix = one(call, "sort") === "file_size" ? "Sized" : "Grid";
  const titles = page === 1 ? [`${prefix} b`, `${prefix} a`, `${prefix} c`] : [`${prefix} page ${page}`];
  return json({
    by: "all",
    base: "",
    total_shelves: 1,
    shelves: [{ key: "all", label: "", count: 61, items: titles.map((t) => item(`g-${t}`, t, app.id)) }],
  });
};

function chipsFor(base: string): Answer {
  const children = base === "" ? ["Videos", "Music"] : [`${base}/Math`, `${base}/Art`];
  return () =>
    json({
      by: "folder",
      base,
      total_shelves: children.length,
      shelves: children.map((key) => ({
        key,
        label: key.split("/").at(-1),
        count: 1,
        items: [item(`c-${key}`, `Chip ${key}`, app.id)],
      })),
    });
}

const positionChips: Answer = (call) => {
  const folders = vals(call, "folder");
  return chipsFor(folders[0] ?? "")(call);
};

let groupedAnswer: Answer;
let gridAnswer: Answer;
let chipAnswer: Answer;
const released: (() => void)[] = [];

function held(answer: Answer): Answer {
  return (call) =>
    new Promise<Response>((resolve) => {
      released.push(() => resolve(answer(call)));
    });
}

async function releaseAll() {
  await act(async () => {
    for (const release of released.splice(0)) release();
  });
}

async function settle(ms = 100) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Answers by the order the calls arrive: the n-th call gets `answers[n]`, later ones the last. */
function inTurn(...answers: Answer[]): Answer {
  let n = 0;
  return (call) => answers[Math.min(n++, answers.length - 1)](call);
}

const failed: Answer = () => json({ detail: "boom" }, 500);

// ---- the page -------------------------------------------------------------------

class FakeObserver {
  static instances: FakeObserver[] = [];
  constructor(private callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  trigger() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
}

const appPath = (a: AppCase) => `/drive/${DRIVE}/apps/${a.id}`;
const STUDY = `folder=${encodeURIComponent("Videos/Study")}`;

function open(query: string) {
  nav.reset(appPath(app), query);
  const Route = app.Route;
  return render(<Route />);
}

function prepare(view: { group?: string; sort?: string }) {
  localStorage.clear();
  sessionStorage.clear();
  resetLibraryFilters(app.id, DRIVE);
  writeAppPrefs(DRIVE, { face: "library", target: "default" }, app.id);
  writeTargetView(app.id, DRIVE, "default", view);
}

const shelfHeadings = () => screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
const seeAllLinks = () => screen.queryAllByRole("link", { name: /See all/ });
const retryButton = () => screen.findByRole("button", { name: /retry|try again/i });
const groupButton = () => screen.getByRole("button", { name: /Group By/ });
const sortButton = () => screen.getByRole("button", { name: /Sort By/ });

/** A card's title, which a card may draw more than once. */
async function drawn(text: string) {
  expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
}

/** The titles, in the order the page draws them. */
function drawnOrder(titles: string[]): string[] {
  const nodes = titles.map((t) => [t, screen.getAllByText(t)[0]] as const);
  return [...nodes]
    .sort(([, a], [, b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(([t]) => t);
}

async function chooseSort(option: string) {
  await waitFor(() => expect(sortButton()).toBeInTheDocument());
  fireEvent.click(sortButton());
  fireEvent.click(await screen.findByRole("menuitemradio", { name: option }));
}

function hrefOf(el: Element): URL {
  return new URL(el.getAttribute("href") ?? "", `http://localhost${nav.state.pathname}`);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  invalidateAddonsCache();
  nav.push.mockReset().mockImplementation((href: string) => nav.go(href));
  nav.replace.mockReset().mockImplementation((href: string) => nav.go(href));
  released.length = 0;
  groupedAnswer = singleShelf;
  gridAnswer = defaultGrid;
  chipAnswer = positionChips;
  for (const id of ["video", "reading"] as const) resetLibraryFilters(id, DRIVE);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  wire = installWireFetch((call) => {
    if (path(call) === `/api/drives/${DRIVE}/smart-folders`) return json([]);
    if (path(call) === `/api/drives/${DRIVE}/collections`) return json([]);
    if (path(call) === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (path(call) === `/api/drives/${DRIVE}/home-shortcuts`)
      return call.method === "GET" ? json([]) : new Response(null, { status: 204 });
    if (path(call).includes("/tag-counts")) return json([{ name: "Trip", count: 3 }]);
    if (isListing(call)) return json({ data: [], meta: { total: 3, page: 1, limit: 1 } });
    if (isChips(call)) return chipAnswer(call);
    if (isCount(call)) return json({ by: "all", base: "", total_shelves: 1, shelves: [{ key: "all", label: "", count: 3, items: [] }] });
    if (isGrid(call)) return gridAnswer(call);
    if (isGrouped(call)) return groupedAnswer(call);
    return json({ by: one(call, "by"), base: "", total_shelves: 0, shelves: [] });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("SPEC-CORE-175 $id: a grouping that yields one shelf draws the None grid", (appCase) => {
  beforeEach(() => {
    app = appCase;
  });

  it.each(appCase.groupings)(
    "SPEC-CORE-175 I1 I7 under %s, one shelf draws the None grid's request and cards, with no shelf heading or See all",
    async (group) => {
      const filters = { tags: ["Trip"], state: "in_progress" as const, name: "kyoto" };

      prepare({ ...app.noneView, sort: "size" });
      writeLibraryFilters(app.id, DRIVE, filters);
      open(STUDY);
      await drawn("Sized b");
      await settle();
      const noneGrid = gridCalls();
      expect(noneGrid.length, "the None grid request").toBeGreaterThan(0);
      const noneOrder = drawnOrder(["Sized a", "Sized b", "Sized c"]);
      const noneHeadings = shelfHeadings();
      cleanup();
      wire.calls.length = 0;

      prepare({ group, sort: "size" });
      writeLibraryFilters(app.id, DRIVE, filters);
      groupedAnswer = held(singleShelf);
      open(STUDY);
      await waitFor(() => expect(groupedCalls().length).toBeGreaterThan(0));
      await settle();
      expect(gridCalls(), "no grid request before the shelves answer").toEqual([]);

      await releaseAll();
      await drawn("Sized b");
      await settle();

      expect(one(groupedCalls()[0], "by")).toBe(group);
      expect(gridCalls().map(conds)).toEqual(noneGrid.map(conds));
      expect(drawnOrder(["Sized a", "Sized b", "Sized c"])).toEqual(noneOrder);
      expect(screen.queryAllByText(`Shelf card ${SINGLE[group].label}`)).toEqual([]);
      expect(shelfHeadings()).toEqual(noneHeadings);
      expect(seeAllLinks()).toEqual([]);
    },
  );

  it("SPEC-CORE-175 I4 the grid keeps Group By on the grouping, stores no other view and leaves the URL alone", async () => {
    prepare({ group: "folder", sort: "size" });
    const stored = readTargetView(app.id, DRIVE, "default");
    open(STUDY);
    await drawn("Sized b");
    await settle();

    expect(groupButton()).toHaveTextContent("Folder");
    expect(readTargetView(app.id, DRIVE, "default")).toEqual(stored);
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.state.search.toString()).toBe(STUDY);
  });

  it("SPEC-CORE-175 the one-shelf grid pages 60 at a time as the viewer scrolls, without asking for shelves again", async () => {
    prepare({ group: "tag", sort: "size" });
    open(STUDY);
    await drawn("Sized b");
    await settle();
    const grouped = groupedCalls().length;

    await waitFor(() => expect(FakeObserver.instances.length).toBeGreaterThan(0));
    act(() => {
      for (const observer of FakeObserver.instances) observer.trigger();
    });

    await drawn("Sized page 2");
    expect(screen.getAllByText("Sized b").length).toBeGreaterThan(0);
    expect(gridCalls().map((c) => one(c, "page"))).toEqual(["1", "2"]);
    expect(gridCalls().every((c) => one(c, "per_shelf") === "60")).toBe(true);
    expect(groupedCalls()).toHaveLength(grouped);
  });

  it("SPEC-CORE-175 I7 I8 a failed shelves request sends no grid, and its retry re-sends the shelves and then draws the grid", async () => {
    prepare({ group: "tag", sort: "size" });
    groupedAnswer = inTurn(failed, singleShelf);
    open(STUDY);

    const retry = await retryButton();
    await settle();
    expect(groupedCalls()).toHaveLength(1);
    expect(gridCalls()).toEqual([]);

    fireEvent.click(retry);
    await drawn("Sized b");
    expect(groupedCalls()).toHaveLength(2);
    expect(gridCalls().length).toBeGreaterThan(0);
  });

  it("SPEC-CORE-175 I8 a failed grid request offers the grid's retry, which re-sends only the grid", async () => {
    prepare({ group: "tag", sort: "size" });
    gridAnswer = inTurn(failed, defaultGrid);
    open(STUDY);

    const retry = await retryButton();
    await settle();
    expect(gridCalls()).toHaveLength(1);
    const grouped = groupedCalls().length;

    fireEvent.click(retry);
    await drawn("Sized b");
    expect(gridCalls()).toHaveLength(2);
    expect(groupedCalls()).toHaveLength(grouped);
  });

  it("SPEC-CORE-175 I6 a late two-shelf answer for conditions the viewer left does not replace the grid", async () => {
    prepare({ group: "tag", sort: "title" });
    groupedAnswer = inTurn(held(twoTagShelves), singleShelf);
    open(STUDY);
    await waitFor(() => expect(groupedCalls()).toHaveLength(1));
    await settle();

    await chooseSort("Size");
    await drawn("Sized b");

    await releaseAll();
    await settle();

    expect(screen.getAllByText("Sized b").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { level: 2, name: "Kyoto" })).toBeNull();
    expect(seeAllLinks()).toEqual([]);
  });

  it("SPEC-CORE-175 a sort change while the grid is drawn shows the shelf skeleton, then the re-sorted grid", async () => {
    prepare({ group: "tag", sort: "title" });
    const { container } = open(STUDY);
    await drawn("Grid b");
    await settle();

    groupedAnswer = held(singleShelf);
    await chooseSort("Size");
    await waitFor(() => expect(groupedCalls().some((c) => one(c, "sort") === "file_size")).toBe(true));
    await settle();

    expect(gridCalls().some((c) => one(c, "sort") === "file_size")).toBe(false);
    expect(screen.queryAllByText("Grid b")).toEqual([]);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);

    await releaseAll();
    await drawn("Sized b");
    const sizedShelves = wire.calls.findIndex((c) => isGrouped(c) && one(c, "sort") === "file_size");
    const sizedGrid = wire.calls.findIndex((c) => isGrid(c) && one(c, "sort") === "file_size");
    expect(sizedGrid).toBeGreaterThan(sizedShelves);
  });

  it("SPEC-CORE-175 I2 I7 from the grid, conditions that yield two shelves draw the shelves and ask for no grid", async () => {
    prepare({ group: "tag", sort: "title" });
    groupedAnswer = (call) => (one(call, "sort") === "file_size" ? twoTagShelves(call) : singleShelf(call));
    open(STUDY);
    await drawn("Grid b");

    await chooseSort("Size");
    expect(await screen.findByRole("heading", { level: 2, name: "Trip" })).toBeInTheDocument();
    await settle();

    expect(screen.getByRole("heading", { level: 2, name: "Kyoto" })).toBeInTheDocument();
    expect(seeAllLinks()).toHaveLength(2);
    expect(screen.queryAllByText("Grid b")).toEqual([]);
    expect(gridCalls().some((c) => one(c, "sort") === "file_size")).toBe(false);
  });

  it("SPEC-CORE-175 I3 I7 from the grid, conditions that yield no shelf draw the empty state and ask for no grid", async () => {
    prepare({ group: "tag", sort: "title" });
    groupedAnswer = (call) => (one(call, "sort") === "file_size" ? noShelves(call) : singleShelf(call));
    open(STUDY);
    await drawn("Grid b");

    await chooseSort("Size");
    await drawn(app.emptyText);
    await settle();

    expect(screen.queryAllByText("Grid b")).toEqual([]);
    expect(gridCalls().some((c) => one(c, "sort") === "file_size")).toBe(false);
  });
});

describe.each(APPS)("SPEC-CORE-176 $id: the Folder grouping's This folder shelf", (appCase) => {
  beforeEach(() => {
    app = appCase;
    prepare({ group: "folder" });
  });

  const STUDY_SHELVES: Answer = () =>
    shelvesAnswer("folder", "Videos/Study", [
      { key: "Videos/Study/Math", label: "Math", count: 5 },
      { key: "Videos/Study/", label: "Study", count: 3 },
      { key: "Videos/Study/Art", label: "Art", count: 2 },
    ]);

  const ROOT_SHELVES: Answer = () =>
    shelvesAnswer("folder", "", [
      { key: "Videos", label: "Videos", count: 4 },
      { key: "", label: "", count: 2 },
    ]);

  const named = (names: string[]) => shelfHeadings().filter((h) => names.includes(h));

  it("SPEC-CORE-176 I5 the shelf of files directly in the breadcrumb's folder is This folder; the others keep their names and order", async () => {
    groupedAnswer = STUDY_SHELVES;
    open(STUDY);

    expect(await screen.findByRole("heading", { level: 2, name: "This folder" })).toBeInTheDocument();
    expect(named(["Math", "This folder", "Art", "Study"])).toEqual(["Math", "This folder", "Art"]);
  });

  it("SPEC-CORE-176 I5 at the drive root the shelf with the empty key is This folder, not the drive's name", async () => {
    groupedAnswer = ROOT_SHELVES;
    open("");

    expect(await screen.findByRole("heading", { level: 2, name: "This folder" })).toBeInTheDocument();
    expect(named(["Videos", "This folder", DRIVE])).toEqual(["Videos", "This folder"]);
  });

  it("SPEC-CORE-176 I5 the same shelf is This folder only once the breadcrumb ends at its folder", async () => {
    groupedAnswer = () =>
      shelvesAnswer("folder", "Videos", [
        { key: "Videos/", label: "Videos", count: 2 },
        { key: "Videos/Study", label: "Study", count: 1 },
      ]);
    open("");
    expect(await screen.findByRole("heading", { level: 2, name: "Study" })).toBeInTheDocument();
    await settle();
    expect(named(["Videos", "Study", "This folder"])).toEqual(["Videos", "Study"]);

    await act(async () => nav.go(`${appPath(app)}?folder=Videos`));
    expect(await screen.findByRole("heading", { level: 2, name: "This folder" })).toBeInTheDocument();
    expect(named(["Videos", "Study", "This folder"])).toEqual(["This folder", "Study"]);
  });

  it.each([
    ["the breadcrumb's folder", STUDY, "Study", "STUDY"],
    ["the drive root", "", DRIVE, "ROOT"],
  ])(
    "SPEC-CORE-176 I5 at %s, while the chips load the shelf keeps its old title, then becomes This folder",
    async (_where, query, oldTitle, which) => {
      groupedAnswer = which === "STUDY" ? STUDY_SHELVES : ROOT_SHELVES;
      chipAnswer = held(positionChips);
      open(query);

      expect(await screen.findByRole("heading", { level: 2, name: oldTitle })).toBeInTheDocument();
      await settle();
      expect(screen.queryByRole("heading", { level: 2, name: "This folder" })).toBeNull();

      await releaseAll();
      expect(await screen.findByRole("heading", { level: 2, name: "This folder" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2, name: oldTitle })).toBeNull();
    },
  );

  it("SPEC-CORE-176 I5 a failed chips request keeps the folder's name, and a retry that succeeds retitles the shelf", async () => {
    groupedAnswer = STUDY_SHELVES;
    chipAnswer = inTurn(failed, positionChips);
    open(STUDY);

    const retry = await retryButton();
    expect(await screen.findByRole("heading", { level: 2, name: "Study" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "This folder" })).toBeNull();

    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { level: 2, name: "This folder" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Study" })).toBeNull();
  });

  it("SPEC-CORE-176 I9 the This folder shelf's See all still opens the folder's own shelf", async () => {
    groupedAnswer = STUDY_SHELVES;
    open(STUDY);
    await screen.findByRole("heading", { level: 2, name: "This folder" });

    const keys = seeAllLinks().map((a) => hrefOf(a).searchParams.get("key"));
    expect(keys).toContain("Videos/Study/");
  });
});

describe("SPEC-CORE-176 the This folder title in both languages", () => {
  function pathsOf(tree: unknown, value: string, prefix: string[] = []): string[][] {
    if (typeof tree === "string") return tree === value ? [prefix] : [];
    if (typeof tree !== "object" || tree === null) return [];
    return Object.entries(tree).flatMap(([k, v]) => pathsOf(v, value, [...prefix, k]));
  }

  function at(tree: unknown, keys: string[]): unknown {
    return keys.reduce<unknown>((node, k) => (node as Record<string, unknown> | undefined)?.[k], tree);
  }

  it("SPEC-CORE-176 the key that reads This folder in English reads このフォルダ in Japanese", () => {
    const paths = pathsOf(enMessages, "This folder");
    expect(paths.length, "an English message that is exactly This folder").toBeGreaterThan(0);
    for (const keys of paths) expect(at(jaMessages, keys), keys.join(".")).toBe("このフォルダ");
  });
});
