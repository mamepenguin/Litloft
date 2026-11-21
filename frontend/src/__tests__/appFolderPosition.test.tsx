/**
 * SPEC-CORE-165 (Video) and SPEC-CORE-166 (Reading): the folder position in the
 * Library, driven through the route pages so the position reaches the app from
 * the URL. The router is a small history whose search params re-render the page
 * on push, replace and Back; every request is answered at `fetch`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { readTargetView, writeAppPrefs, writeTargetView, type AppId } from "@/lib/appPrefs";
import { readLibraryFilters, resetLibraryFilters, writeLibraryFilters } from "@/components/appshell/libraryFilters";
import { invalidateAddonsCache } from "@/lib/addons";
import { installWireFetch, json, paramsOf, type WireCall } from "@/__tests__/helpers/wireFetch";

const DRIVE = "main";

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    pathname: "/drive/main/apps/video",
    search: new URLSearchParams(),
    entries: [] as string[],
    index: -1,
  };
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
      state.entries = [`${pathname}?${query}`];
      state.index = 0;
    },
    go(href: string, mode: "push" | "replace") {
      const full = new URL(href, `http://localhost${state.pathname}`);
      const entry = `${full.pathname}${full.search}`;
      if (mode === "push") {
        state.entries = [...state.entries.slice(0, state.index + 1), entry];
        state.index += 1;
      } else {
        state.entries = state.entries.map((e, i) => (i === state.index ? entry : e));
      }
      apply(entry);
    },
    back() {
      state.index -= 1;
      apply(state.entries[state.index]);
    },
    forward() {
      state.index += 1;
      apply(state.entries[state.index]);
    },
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

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const VideoRoute = (await import("@/app/drive/[name]/apps/video/page")).default;
const ReadingRoute = (await import("@/app/drive/[name]/apps/reading/page")).default;
const VideoShelfRoute = (await import("@/app/drive/[name]/apps/video/shelf/page")).default;
const ReadingShelfRoute = (await import("@/app/drive/[name]/apps/reading/shelf/page")).default;

interface AppCase {
  spec: string;
  id: AppId;
  Route: () => React.ReactNode;
  ShelfRoute: () => React.ReactNode;
  emptyText: string;
  /** A further spec the chip tests verify: the one that revises Reading's earlier chip invariant. */
  chips?: string;
}

const APPS: AppCase[] = [
  { spec: "SPEC-CORE-165", id: "video", Route: VideoRoute, ShelfRoute: VideoShelfRoute, emptyText: "No files" },
  { spec: "SPEC-CORE-166", id: "reading", Route: ReadingRoute, ShelfRoute: ReadingShelfRoute, emptyText: "No books", chips: " SPEC-CORE-171" },
];

// ---- the drive's folders --------------------------------------------------------

/** Files directly in each folder. 19 files in all; at the drive's top `base` is "". */
const TREE: Record<string, number> = {
  Music: 1,
  Videos: 2,
  "Videos/Study": 1,
  "Videos/Study/Math": 5,
  "Videos/Study/Physics": 3,
  "Videos/Fun": 4,
  "Archive/2020/Jan": 1,
  "Archive/2020/Jan/Week1": 2,
};
const TOTAL = 19;

const inside = (folder: string, under: string) => under === "" || folder === under || folder.startsWith(`${under}/`);

function filesUnder(folders: string[]): [string, number][] {
  return Object.entries(TREE).filter(([folder]) => folders.length === 0 || folders.some((f) => inside(folder, f)));
}

function countUnder(folders: string[]): number {
  return filesUnder(folders).reduce((sum, [, n]) => sum + n, 0);
}

function baseOf(entries: [string, number][]): string {
  if (entries.length === 0) return "";
  const split = entries.map(([folder]) => folder.split("/"));
  const common: string[] = [];
  for (let i = 0; ; i++) {
    const seg = split[0][i];
    if (seg === undefined || split.some((s) => s[i] !== seg)) break;
    common.push(seg);
  }
  return common.join("/");
}

/** The folder classification: the base shelf, then one shelf per child of base, most files first. */
function folderShelves(folders: string[]) {
  const entries = filesUnder(folders);
  const base = baseOf(entries);
  const direct = entries.filter(([f]) => f === base).reduce((s, [, n]) => s + n, 0);
  const children = new Map<string, number>();
  for (const [folder, n] of entries) {
    if (folder === base) continue;
    const rest = base === "" ? folder : folder.slice(base.length + 1);
    const child = base === "" ? rest.split("/")[0] : `${base}/${rest.split("/")[0]}`;
    children.set(child, (children.get(child) ?? 0) + n);
  }
  const childShelves = [...children.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([key, count]) => ({ key, label: key.split("/").at(-1)!, count }));
  const baseShelf = direct > 0 ? [{ key: base === "" ? "" : `${base}/`, label: base.split("/").at(-1) ?? "", count: direct }] : [];
  return { base, shelves: [...baseShelf, ...childShelves] };
}

// ---- data -------------------------------------------------------------------------

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

function smartFolder(id: string, name: string, query: string, fileType: string | null = null) {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: fileType,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

const SMART_FOLDERS = [
  smartFolder("sf-trips", "Trips", "tag:Trip"),
  smartFolder("sf-videos", "Videos only", "path:Videos"),
  smartFolder("sf-math", "Math only", "path:Videos/Study/Math"),
  smartFolder("sf-pics", "Pictures", "", "image"),
];

// ---- the wire -------------------------------------------------------------------

const path = (c: WireCall) => c.url.pathname;
const isListing = (c: WireCall) =>
  path(c) === `/api/drives/${DRIVE}/files` || path(c) === `/api/drives/${DRIVE}/files/query`;
const isShelves = (c: WireCall) =>
  path(c) === `/api/drives/${DRIVE}/shelves` || path(c) === `/api/drives/${DRIVE}/shelves/query`;
const isTagCounts = (c: WireCall) => path(c).includes("/tag-counts");
const param = (c: WireCall, key: string) => c.url.searchParams.get(key);
/** Reading's and Video's chip loader asks 24 shelves at a time; Video's Folder grouping asks 12. */
const isChips = (c: WireCall) => isShelves(c) && param(c, "by") === "folder" && param(c, "shelf_limit") === "24";
/** The header's count: one listing item, or one by=all shelf with one item. */
const isCount = (c: WireCall) =>
  (isListing(c) && param(c, "limit") === "1") ||
  (isShelves(c) && param(c, "by") === "all" && param(c, "per_shelf") === "1");
const isLibrary = (c: WireCall) => (isShelves(c) || isListing(c) || isTagCounts(c)) && !isCount(c);

function foldersOf(call: WireCall): string[] {
  const body = call.body as { folder?: unknown } | null;
  const fromBody = body && Array.isArray(body.folder) ? (body.folder as string[]) : [];
  return [...paramsOf(call, "folder"), ...fromBody];
}

type Answer = (call: WireCall) => Response | Promise<Response>;

let app: AppCase;
let wire: { calls: WireCall[] };
let chipAnswer: Answer;
const released: (() => void)[] = [];

function defaultChipAnswer(call: WireCall): Response {
  const { base, shelves } = folderShelves(foldersOf(call));
  const offset = Number(param(call, "offset") ?? "0");
  const limit = Number(param(call, "shelf_limit") ?? "24");
  return json({
    by: "folder",
    base,
    total_shelves: shelves.length,
    shelves: shelves.slice(offset, offset + limit).map((s) => ({ ...s, items: [item(`c-${s.key}`, s.label, app.id)] })),
  });
}

function libraryShelvesAnswer(call: WireCall): Response {
  const folders = foldersOf(call);
  const total = countUnder(folders);
  const by = param(call, "by") ?? "all";
  if (by === "all") {
    const items = total === 0 || param(call, "per_shelf") === "1" ? [] : [item("all-1", "Listed shelf", app.id)];
    return json({ by, base: "", total_shelves: 1, shelves: [{ key: "all", label: "", count: total, items }] });
  }
  if (total === 0) return json({ by, base: "", total_shelves: 0, shelves: [] });
  if (by === "folder") {
    const { base, shelves } = folderShelves(folders);
    return json({
      by,
      base,
      total_shelves: shelves.length,
      shelves: shelves.map((s) => ({ ...s, items: [item(`f-${s.key}`, `Folder shelf ${s.label}`, app.id)] })),
    });
  }
  if (by === "tag") {
    return json({
      by,
      base: "",
      total_shelves: 1,
      shelves: [{ key: "Trip", label: "Trip", count: total, items: [item("t-1", "Tagged one", app.id)] }],
    });
  }
  return json({
    by,
    base: "",
    total_shelves: 1,
    shelves: [{ key: "k1", label: "Grouped", count: total, items: [item("g-1", "Grouped one", app.id)] }],
  });
}

/** An answer the test releases itself. */
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

const appPath = (a: AppCase) => `/drive/${DRIVE}/apps/${a.id}`;

function open(a: AppCase, query: string) {
  nav.reset(appPath(a), query);
  const Route = a.Route;
  return render(<Route />);
}

function openShelf(a: AppCase, query: string) {
  nav.reset(`${appPath(a)}/shelf`, query);
  const ShelfRoute = a.ShelfRoute;
  return render(<ShelfRoute />);
}

const q = (folder: string) => `folder=${encodeURIComponent(folder)}`;

// ---- what the page draws ----------------------------------------------------------

const crumbs = () => screen.queryByLabelText("Folder position");

/** The crumbs hold exactly these links, found by accessible name. */
function expectCrumbLinks(names: string[]) {
  const row = crumbs();
  expect(row, "the crumbs").not.toBeNull();
  expect(within(row!).queryAllByRole("link")).toHaveLength(names.length);
  for (const name of names) expect(within(row!).getByRole("link", { name })).toBeInTheDocument();
}

function hrefOf(el: Element): URL {
  return new URL(el.getAttribute("href") ?? "", `http://localhost${nav.state.pathname}`);
}

/** Links to the Library itself that carry a folder and are not crumbs: the chips. */
function chipLinks(): HTMLElement[] {
  const row = crumbs();
  return screen
    .queryAllByRole("link")
    .filter((a) => !(row && row.contains(a)))
    .filter((a) => {
      const url = hrefOf(a);
      return url.pathname === appPath(app) && url.searchParams.has("folder");
    });
}

const chipFolders = () => chipLinks().map((a) => hrefOf(a).searchParams.get("folder"));

function chipLink(folder: string): HTMLElement {
  const found = chipLinks().find((a) => hrefOf(a).searchParams.get("folder") === folder);
  expect(found, `a chip linking to ${folder}`).toBeDefined();
  return found!;
}

function crumbLink(name: string): HTMLElement {
  const row = crumbs();
  expect(row, "the crumbs").not.toBeNull();
  return within(row!).getByRole("link", { name });
}

/** The URL the last router.push went to. */
function lastPush(): URL {
  expect(nav.push).toHaveBeenCalled();
  return new URL(String(nav.push.mock.calls.at(-1)![0]), `http://localhost${appPath(app)}`);
}

function lastReplace(): URL {
  expect(nav.replace).toHaveBeenCalled();
  return new URL(String(nav.replace.mock.calls.at(-1)![0]), `http://localhost${nav.state.pathname}`);
}

function scrolledToTop(spy: ReturnType<typeof vi.fn>): boolean {
  return spy.mock.calls.some((args) => {
    const [a, b] = args as [unknown, unknown];
    if (typeof a === "object" && a !== null) return (a as { top?: number }).top === 0;
    return b === 0;
  });
}

async function waitForChips() {
  await waitFor(() => expect(wire.calls.some(isChips), "a chip request (by=folder, shelf_limit=24)").toBe(true));
  await settle();
}

function headerText(): string {
  return screen.getByText(DRIVE).parentElement?.textContent ?? "";
}

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  invalidateAddonsCache();
  nav.push.mockReset().mockImplementation((href: string) => nav.go(href, "push"));
  nav.replace.mockReset().mockImplementation((href: string) => nav.go(href, "replace"));
  toast.error.mockReset();
  released.length = 0;
  chipAnswer = defaultChipAnswer;
  for (const id of ["video", "reading"] as const) resetLibraryFilters(id, DRIVE);
  scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
  wire = installWireFetch((call) => {
    if (path(call) === `/api/drives/${DRIVE}/smart-folders`) return json(SMART_FOLDERS);
    if (path(call) === `/api/drives/${DRIVE}/collections`) return json([]);
    if (path(call) === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (path(call) === `/api/drives/${DRIVE}/home-shortcuts`)
      return call.method === "GET" ? json([]) : new Response(null, { status: 204 });
    if (isTagCounts(call)) return json([{ name: "Trip", count: 1 }]);
    if (isListing(call)) {
      const total = countUnder(foldersOf(call));
      return json({ data: total ? [item("l-1", "Listed", app.id)] : [], meta: { total, page: 1, limit: 12 } });
    }
    if (isChips(call)) return chipAnswer(call);
    if (isShelves(call)) return libraryShelvesAnswer(call);
    return json([]);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("$spec $id: the folder position", (appCase) => {
  const S = appCase.spec;
  const C = `${S}${appCase.chips ?? ""}`;

  beforeEach(() => {
    app = appCase;
    writeAppPrefs(DRIVE, { face: "library", target: "default" }, app.id);
  });

  describe("the top of the target", () => {
    it(`${C} D5 asks for the chips with no folder, draws no crumbs, and draws a chip link per child folder with its count`, async () => {
      open(app, "");
      await waitForChips();

      const chipCalls = wire.calls.filter(isChips);
      expect(foldersOf(chipCalls[0])).toEqual([]);
      expect(param(chipCalls[0], "offset") ?? "0").toBe("0");
      expect(crumbs()).toBeNull();
      await waitFor(() => expect(chipFolders()).toEqual(["Videos", "Archive", "Music"]));
      expect(screen.queryByRole("button", { name: "All" })).toBeNull();
      const videos = chipLink("Videos");
      expect(videos.textContent).toContain("Videos");
      expect(videos.textContent).toContain("15");
    });
  });

  describe("the top of a folder-limited target", () => {
    it(`${S} D5 draws the crumbs from base with no link at all, and the chips under base`, async () => {
      writeAppPrefs(DRIVE, { target: "sf-videos" }, app.id);
      open(app, "");
      await waitForChips();

      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Videos");
      expectCrumbLinks([]);
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study", "Videos/Fun"]));
    });
  });

  describe("D1 the order of the rows", () => {
    it(`${S} D1 draws the tabs, then the crumbs, then the chips, then the Tag control`, async () => {
      open(app, q("Videos/Study"));
      await waitForChips();

      const tab = screen.getByRole("tab", { name: "Library" });
      const row = crumbs();
      expect(row, "the crumbs").not.toBeNull();
      const chip = chipLink("Videos/Study/Math");
      const tag = screen.getByRole("button", { name: /^Tag/ });
      const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(follows(tab, row!)).toBe(true);
      expect(follows(row!, chip)).toBe(true);
      expect(follows(chip, tag)).toBe(true);
    });
  });

  describe("choosing a chip", () => {
    it(`${C} I4 pushes one history entry with the folder, scrolls to the top, and asks again under it`, async () => {
      open(app, "");
      await waitForChips();
      const before = wire.calls.length;

      fireEvent.click(chipLink("Videos"));

      expect(nav.push).toHaveBeenCalledTimes(1);
      expect(nav.replace).not.toHaveBeenCalled();
      expect(lastPush().pathname).toBe(appPath(app));
      expect(lastPush().searchParams.getAll("folder")).toEqual(["Videos"]);
      expect(scrolledToTop(scrollTo)).toBe(true);

      await waitFor(() => expect(wire.calls.slice(before).some(isChips)).toBe(true));
      await settle();
      const after = wire.calls.slice(before);
      for (const call of after.filter(isChips)) expect(foldersOf(call)).toEqual(["Videos"]);
      for (const call of after.filter(isLibrary)) expect(foldersOf(call)).toEqual(["Videos"]);
      expect(after.filter(isLibrary).filter((c) => !isChips(c)).length).toBeGreaterThan(0);
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study", "Videos/Fun"]));
    });

    it(`${S} I4 Back restores the previous position with its shelves, and Forward returns`, async () => {
      open(app, "");
      await waitForChips();
      fireEvent.click(chipLink("Videos"));
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study", "Videos/Fun"]));
      await settle();

      const beforeBack = wire.calls.length;
      await act(async () => nav.back());
      await waitFor(() => expect(chipFolders()).toEqual(["Videos", "Archive", "Music"]));
      await settle();
      const back = wire.calls.slice(beforeBack).filter(isLibrary).filter((c) => !isChips(c));
      expect(back.length).toBeGreaterThan(0);
      for (const call of back) expect(foldersOf(call)).toEqual([]);
      expect(crumbs()).toBeNull();
      expect(scrollTo).toHaveBeenCalledTimes(1);

      await act(async () => nav.forward());
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study", "Videos/Fun"]));
    });

    it(`${S} I7 I9 moving the position changes no saved grouping, sort or filter and stores nothing`, async () => {
      writeTargetView(app.id, DRIVE, "default", { group: "tag", sort: "size" });
      writeLibraryFilters(app.id, DRIVE, { tags: ["Trip"], state: "in_progress", name: "kyoto" });
      open(app, "");
      await waitForChips();
      const view = readTargetView(app.id, DRIVE, "default");
      const local = JSON.stringify({ ...localStorage });
      const session = JSON.stringify({ ...sessionStorage });

      fireEvent.click(chipLink("Videos"));
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study", "Videos/Fun"]));
      await settle();

      expect(readTargetView(app.id, DRIVE, "default")).toEqual(view);
      expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ tags: ["Trip"], state: "in_progress", name: "kyoto" });
      expect(JSON.stringify({ ...localStorage })).toBe(local);
      expect(JSON.stringify({ ...sessionStorage })).toBe(session);
      const grouped = wire.calls.filter(isLibrary).filter((c) => foldersOf(c).includes("Videos") && !isChips(c));
      expect(grouped.length).toBeGreaterThan(0);
      for (const call of grouped.filter(isShelves)) expect(paramsOf(call, "tag")).toContain("Trip");
    });
  });

  describe("the crumbs", () => {
    it(`${S} I8 links every strict ancestor and Top, and draws the position's own segment as plain text`, async () => {
      open(app, q("Videos/Study/Math"));
      await waitForChips();

      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Videos");
      expect(crumbs()!.textContent).toContain("Study");
      expect(crumbs()!.textContent).toContain("Math");
      expectCrumbLinks(["Top", "Videos", "Study"]);
      expect(hrefOf(crumbLink("Study")).searchParams.getAll("folder")).toEqual(["Videos/Study"]);
      expect(hrefOf(crumbLink("Videos")).searchParams.getAll("folder")).toEqual(["Videos"]);
      expect(hrefOf(crumbLink("Top")).searchParams.has("folder")).toBe(false);
    });

    it(`${S} I4 an ancestor crumb pushes its folder and scrolls to the top`, async () => {
      open(app, q("Videos/Study/Math"));
      await waitForChips();

      fireEvent.click(crumbLink("Videos"));

      expect(nav.push).toHaveBeenCalledTimes(1);
      expect(lastPush().searchParams.getAll("folder")).toEqual(["Videos"]);
      expect(scrolledToTop(scrollTo)).toBe(true);
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study", "Videos/Fun"]));
    });

    it(`${S} I4 the Top crumb pushes the URL without folder`, async () => {
      open(app, q("Videos/Study"));
      await waitForChips();

      fireEvent.click(crumbLink("Top"));

      expect(nav.push).toHaveBeenCalledTimes(1);
      expect(lastPush().pathname).toBe(appPath(app));
      expect(lastPush().searchParams.has("folder")).toBe(false);
      await waitFor(() => expect(crumbs()).toBeNull());
      await waitFor(() => expect(chipFolders()).toEqual(["Videos", "Archive", "Music"]));
    });

    it(`${S} I8 draws from a deeper base, every segment from the position down plain, and the chips one level below base`, async () => {
      open(app, q("Archive"));
      await waitForChips();

      expect(crumbs()).not.toBeNull();
      const text = crumbs()!.textContent ?? "";
      expect(text.indexOf("Archive")).toBeGreaterThanOrEqual(0);
      expect(text.indexOf("2020")).toBeGreaterThan(text.indexOf("Archive"));
      expect(text.indexOf("Jan")).toBeGreaterThan(text.indexOf("2020"));
      expectCrumbLinks(["Top"]);
      await waitFor(() => expect(chipFolders()).toEqual(["Archive/2020/Jan/Week1"]));
    });

    it(`${S} I8 a segment above a folder-limited target's folder is plain, because it shows the same as the top`, async () => {
      writeAppPrefs(DRIVE, { target: "sf-videos" }, app.id);
      open(app, q("Videos/Study/Math"));
      await waitForChips();

      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Videos");
      expectCrumbLinks(["Top", "Study"]);
    });

    it(`${S} I8 under a target narrower than the position, no segment is a link but Top`, async () => {
      writeAppPrefs(DRIVE, { target: "sf-math" }, app.id);
      open(app, q("Videos/Study"));
      await waitForChips();

      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Math");
      expectCrumbLinks(["Top"]);
      for (const call of wire.calls.filter(isLibrary)) expect(foldersOf(call)).toEqual(["Videos/Study/Math"]);
    });

    it(`${S} D6 a folder with no child folder draws the crumbs and no chip`, async () => {
      open(app, q("Videos/Fun"));
      await waitForChips();

      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Fun");
      expect(chipFolders()).toEqual([]);
      expect(screen.queryByText(app.emptyText)).toBeNull();
    });
  });

  describe("I1 every Library request is narrowed into the target", () => {
    it(`${S} I1 at a position under the default target, every request and the chip request carry the position`, async () => {
      open(app, q("Videos/Study"));
      await waitForChips();
      const tag = screen.queryByRole("button", { name: /^Tag/ });
      if (tag) fireEvent.click(tag);
      await settle();

      const library = wire.calls.filter(isLibrary);
      expect(library.filter(isChips).length).toBeGreaterThan(0);
      expect(library.filter((c) => !isChips(c)).length).toBeGreaterThan(0);
      for (const call of library) expect(foldersOf(call)).toEqual(["Videos/Study"]);
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study/Math", "Videos/Study/Physics"]));
    });

    it(`${C} I1 under a folder-limited target, the position replaces the target's folder it lies inside`, async () => {
      writeAppPrefs(DRIVE, { target: "sf-videos" }, app.id);
      open(app, q("Videos/Study"));
      await waitForChips();

      const library = wire.calls.filter(isLibrary);
      expect(library.length).toBeGreaterThan(0);
      for (const call of library) expect(foldersOf(call)).toEqual(["Videos/Study"]);
      expect(crumbs()).not.toBeNull();
    });

    it(`${S} I1 a See all link carries the narrowed folders and the position as from_folder`, async () => {
      writeAppPrefs(DRIVE, { target: "sf-math" }, app.id);
      writeTargetView(app.id, DRIVE, "sf-math", { group: "tag" });
      open(app, q("Videos/Study"));

      const link = await screen.findByRole("link", { name: "See all: Trip" });
      const url = hrefOf(link);
      expect(url.searchParams.getAll("folder")).toEqual(["Videos/Study/Math"]);
      expect(url.searchParams.get("from_folder")).toBe("Videos/Study");
    });

    it(`${S} I1 a See all link under the default target carries the position itself`, async () => {
      writeTargetView(app.id, DRIVE, "default", { group: "tag" });
      open(app, q("Videos/Study"));

      const link = await screen.findByRole("link", { name: "See all: Trip" });
      const url = hrefOf(link);
      expect(url.searchParams.getAll("folder")).toEqual(["Videos/Study"]);
      expect(url.searchParams.get("from_folder")).toBe("Videos/Study");
    });
  });

  describe("I6 the chips ignore the filters", () => {
    it(`${S} I6 sends no tag, state or name with the chip request and draws the same chips and crumbs`, async () => {
      open(app, q("Videos"));
      await waitForChips();
      const plainChips = chipFolders();
      const plainCrumbs = crumbs()?.textContent;
      cleanup();
      wire.calls.length = 0;

      writeLibraryFilters(app.id, DRIVE, { tags: ["Trip"], state: "in_progress", name: "kyoto" });
      open(app, q("Videos"));
      await waitForChips();

      for (const call of wire.calls.filter(isChips)) {
        expect(paramsOf(call, "tag")).toEqual([]);
        expect(paramsOf(call, "watch")).toEqual([]);
        expect(paramsOf(call, "search")).toEqual([]);
      }
      expect(plainChips).toEqual(["Videos/Study", "Videos/Fun"]);
      await waitFor(() => expect(chipFolders()).toEqual(plainChips));
      expect(crumbs()?.textContent).toBe(plainCrumbs);
    });
  });

  describe("the chip request's life", () => {
    it(`${S} while the first chip page is in flight, the crumbs come from the position and no chip is drawn`, async () => {
      chipAnswer = held(defaultChipAnswer);
      open(app, q("Videos/Study"));
      await waitFor(() => expect(wire.calls.some(isChips)).toBe(true));
      await settle();

      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Study");
      expect(chipFolders()).toEqual([]);

      await releaseAll();
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study/Math", "Videos/Study/Physics"]));
    });

    it(`${S} I14 a chip answer for an earlier position is never drawn under a later one`, async () => {
      chipAnswer = (call) =>
        foldersOf(call).includes("Videos/Study") ? held(defaultChipAnswer)(call) : defaultChipAnswer(call);
      open(app, q("Videos/Study"));
      await waitFor(() => expect(wire.calls.some(isChips)).toBe(true));
      await settle();

      await act(async () => nav.go(`${appPath(app)}?${q("Videos")}`, "push"));
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study", "Videos/Fun"]));
      await releaseAll();
      await settle();

      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study", "Videos/Fun"]));
      expect(chipFolders()).not.toContain("Videos/Study/Math");
      expect(crumbs()!.textContent).not.toContain("Study");
    });

    it(`${S} asks 24 at a time up to 120 chips`, async () => {
      const many = Array.from({ length: 200 }, (_, i) => ({
        key: `Many/F${String(i).padStart(3, "0")}`,
        label: `F${String(i).padStart(3, "0")}`,
        count: 1,
      }));
      chipAnswer = (call) => {
        const offset = Number(param(call, "offset") ?? "0");
        return json({
          by: "folder",
          base: "Many",
          total_shelves: many.length,
          shelves: many.slice(offset, offset + 24).map((s) => ({ ...s, items: [item(`m-${s.key}`, s.label, app.id)] })),
        });
      };
      open(app, q("Many"));
      await waitFor(() => expect(chipLinks().length).toBe(120));
      await settle();

      const offsets = wire.calls.filter(isChips).map((c) => Number(param(c, "offset") ?? "0"));
      expect(offsets).toEqual([0, 24, 48, 72, 96]);
      for (const call of wire.calls.filter(isChips)) expect(param(call, "shelf_limit")).toBe("24");
    });

    it(`${S} keeps the first page's base when a later chip page fails`, async () => {
      chipAnswer = (call) => {
        const offset = Number(param(call, "offset") ?? "0");
        if (offset > 0) return json({ detail: "boom" }, 500);
        return json({
          by: "folder",
          base: "Deep/One",
          total_shelves: 48,
          shelves: Array.from({ length: 24 }, (_, i) => ({
            key: `Deep/One/C${i}`,
            label: `C${i}`,
            count: 1,
            items: [item(`d-${i}`, `C${i}`, app.id)],
          })),
        });
      };
      open(app, q("Deep"));
      await screen.findByRole("button", { name: /retry/i });

      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("One");
      expect(chipLinks()).toHaveLength(24);
    });

    it(`${S} I11 a failed chip request offers Retry, draws the crumbs from the position, and still draws the shelves`, async () => {
      chipAnswer = () => json({ detail: "boom" }, 500);
      open(app, q("Videos/Study"));

      expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Study");
      expect(chipFolders()).toEqual([]);
      const listed = wire.calls.filter(isLibrary).filter((c) => !isChips(c));
      expect(listed.length).toBeGreaterThan(0);
      for (const call of listed) expect(foldersOf(call)).toEqual(["Videos/Study"]);
    });
  });

  describe("empty positions", () => {
    it(`${S} I2 a position outside a folder-limited target sends nothing and shows the empty state with the crumbs`, async () => {
      writeAppPrefs(DRIVE, { target: "sf-videos" }, app.id);
      open(app, q("Music"));
      await waitFor(() => expect(wire.calls.some((c) => path(c).endsWith("/smart-folders"))).toBe(true));
      await settle(200);
      const tag = screen.queryByRole("button", { name: /^Tag/ });
      if (tag) fireEvent.click(tag);
      await settle();

      expect(await screen.findByText(app.emptyText)).toBeInTheDocument();
      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Music");
      expect(chipFolders()).toEqual([]);
      expect(wire.calls.filter(isLibrary)).toEqual([]);
    });

    it(`${S} D7 a position with no files under the target is asked for and shows the empty state with the crumbs`, async () => {
      open(app, q("Videos/Gone"));
      await waitForChips();

      expect(await screen.findByText(app.emptyText)).toBeInTheDocument();
      expect(crumbs()).not.toBeNull();
      expect(crumbs()!.textContent).toContain("Gone");
      expectCrumbLinks(["Top", "Videos"]);
      for (const call of wire.calls.filter(isLibrary)) expect(foldersOf(call)).toEqual(["Videos/Gone"]);
    });
  });

  describe("I10 a folder value the backend would reject", () => {
    it.each([
      ["an empty segment", "Videos//Study"],
      ["a dot segment", "Videos/./Study"],
      ["a lone dot", "."],
      ["a dot-dot segment", "Videos/../Music"],
      ["a lone dot-dot", ".."],
      ["a NUL", "Videos/\u0000Study"],
    ])(`${S} I10 %s is removed with replace and no request carries it`, async (_, value) => {
      open(app, q(value));
      await waitForChips();

      expect(nav.push).not.toHaveBeenCalled();
      expect(lastReplace().pathname).toBe(appPath(app));
      expect(lastReplace().searchParams.has("folder")).toBe(false);
      for (const call of wire.calls) expect(foldersOf(call)).not.toContain(value);
      for (const call of wire.calls.filter(isLibrary)) expect(foldersOf(call)).toEqual([]);
      expect(crumbs()).toBeNull();
      await waitFor(() => expect(chipFolders()).toEqual(["Videos", "Archive", "Music"]));
    });
  });

  describe("I5 the position against the target", () => {
    it(`${S} I5 another target chosen removes folder with replace and adds no history entry`, async () => {
      open(app, q("Videos/Study"));
      await waitForChips();
      expect(crumbs()).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Target/ }));
      fireEvent.click(await screen.findByRole("menuitemradio", { name: /Trips/ }));
      await settle();

      expect(nav.push).not.toHaveBeenCalled();
      expect(lastReplace().pathname).toBe(appPath(app));
      expect(lastReplace().searchParams.has("folder")).toBe(false);
      expect(crumbs()).toBeNull();
    });

    it(`${S} I5 the target already in force chosen again keeps the position`, async () => {
      writeAppPrefs(DRIVE, { target: "sf-videos" }, app.id);
      open(app, q("Videos/Study"));
      await waitForChips();
      expect(crumbs()).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Target/ }));
      fireEvent.click(await screen.findByRole("menuitemradio", { name: /Videos only/ }));
      await settle();

      expect(nav.push).not.toHaveBeenCalled();
      expect(nav.replace).not.toHaveBeenCalled();
      expect(nav.state.search.get("folder")).toBe("Videos/Study");
      expect(crumbs()).not.toBeNull();
    });

    it(`${S} a saved target that no longer exists falls back to the default and the URL's position applies to it`, async () => {
      writeAppPrefs(DRIVE, { target: "sf-gone" }, app.id);
      open(app, q("Videos/Study"));
      await waitForChips();

      expect(crumbs()).not.toBeNull();
      for (const call of nav.replace.mock.calls) {
        expect(new URL(String(call[0]), "http://localhost/").searchParams.get("folder")).toBe("Videos/Study");
      }
      expect(nav.state.search.get("folder")).toBe("Videos/Study");
      for (const call of wire.calls.filter(isLibrary)) expect(foldersOf(call)).toEqual(["Videos/Study"]);
    });

    it(`${S} a Home shortcut's target removes target and folder in one replace and opens at the top`, async () => {
      open(app, `target=sf-videos&${q("Videos/Study")}`);
      await waitForChips();

      expect(nav.push).not.toHaveBeenCalled();
      expect(nav.replace).toHaveBeenCalledTimes(1);
      expect(lastReplace().searchParams.has("target")).toBe(false);
      expect(lastReplace().searchParams.has("folder")).toBe(false);
      expect(nav.state.search.toString()).toBe("");
      await settle();
      const chipCalls = wire.calls.filter(isChips);
      expect(foldersOf(chipCalls.at(-1)!)).toEqual(["Videos"]);
    });

    it(`${S} I5 I9 reloading keeps the position, and opening without folder is the top`, async () => {
      open(app, q("Videos/Study"));
      await waitForChips();
      expect(crumbs()).not.toBeNull();
      cleanup();
      wire.calls.length = 0;

      open(app, q("Videos/Study"));
      await waitForChips();
      expect(crumbs()).not.toBeNull();
      for (const call of wire.calls.filter(isLibrary)) expect(foldersOf(call)).toEqual(["Videos/Study"]);
      cleanup();
      wire.calls.length = 0;

      open(app, "");
      await waitForChips();
      expect(crumbs()).toBeNull();
      for (const call of wire.calls.filter(isLibrary)) expect(foldersOf(call)).toEqual([]);
      for (const store of [localStorage, sessionStorage]) {
        expect(JSON.stringify({ ...store })).not.toContain("Videos/Study");
      }
    });
  });

  describe("I3 Discover ignores the position", () => {
    it(`${S} I3 Discover's requests carry no folder, and the Library tab shows the position the URL still holds`, async () => {
      writeAppPrefs(DRIVE, { face: "discover" }, app.id);
      open(app, q("Videos/Study"));
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle(200);

      expect(crumbs()).toBeNull();
      for (const call of wire.calls) {
        expect(foldersOf(call)).toEqual([]);
        expect(call.url.href).not.toContain("Study");
      }

      fireEvent.click(screen.getByRole("tab", { name: "Library" }));
      await waitForChips();

      expect(nav.replace).not.toHaveBeenCalled();
      expect(nav.state.search.get("folder")).toBe("Videos/Study");
      expect(crumbs()).not.toBeNull();
    });
  });

  describe("D10 I15 the header's count", () => {
    it(`${S} I15 stays the target's total at a position`, async () => {
      open(app, "");
      await waitForChips();
      await waitFor(() => expect(headerText()).toContain(`${DRIVE} · ${TOTAL}`));

      fireEvent.click(chipLink("Videos"));
      await waitFor(() => expect(crumbs()).not.toBeNull());
      await settle();

      expect(headerText()).toContain(`${DRIVE} · ${TOTAL}`);
      for (const call of wire.calls.filter(isCount)) expect(foldersOf(call)).toEqual([]);
    });
  });

  describe("the See all page", () => {
    it(`${S} I13 the link back to the Library opens at from_folder, and at the top without it; no crumbs or chips are drawn`, async () => {
      const back = () =>
        screen.queryAllByRole("link").filter((a) => hrefOf(a).pathname === appPath(app));

      openShelf(app, `by=tag&key=Trip&from=library&${q("Videos/Study")}&from_folder=${encodeURIComponent("Videos/Study")}`);
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();
      expect(back().length).toBeGreaterThan(0);
      for (const link of back()) expect(hrefOf(link).searchParams.get("folder")).toBe("Videos/Study");
      expect(crumbs()).toBeNull();
      cleanup();

      openShelf(app, `by=tag&key=Trip&from=library&${q("Videos/Study")}`);
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();
      expect(back().length).toBeGreaterThan(0);
      for (const link of back()) expect(hrefOf(link).searchParams.has("folder")).toBe(false);
    });

    it(`${S} I12 I13 a target chosen on the See all page drops folder and from_folder, and the link back opens at the top`, async () => {
      openShelf(app, `by=tag&key=Trip&from=library&${q("Videos/Study")}&from_folder=${encodeURIComponent("Videos/Study")}`);
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      const before = wire.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /Target/ }));
      fireEvent.click(await screen.findByRole("menuitemradio", { name: /Trips/ }));
      await settle();

      const later = wire.calls.slice(before).filter((c) => isShelves(c) || isListing(c));
      expect(later.length).toBeGreaterThan(0);
      for (const call of later) expect(foldersOf(call)).toEqual([]);
      const url = lastReplace();
      expect(url.searchParams.has("folder")).toBe(false);
      expect(url.searchParams.has("from_folder")).toBe(false);
      expect(url.searchParams.get("key")).toBe("Trip");
      const back = screen.queryAllByRole("link").filter((a) => hrefOf(a).pathname === appPath(app));
      expect(back.length).toBeGreaterThan(0);
      for (const link of back) expect(hrefOf(link).searchParams.has("folder")).toBe(false);
    });
  });
});

describe("SPEC-CORE-165 Video only", () => {
  const video = APPS[0];

  beforeEach(() => {
    app = video;
    writeAppPrefs(DRIVE, { face: "library", target: "default" }, "video");
  });

  it.each(["folder", "tag", "month", "duration", "all"])(
    "SPEC-CORE-165 D8 draws the crumbs and chips under the %s grouping",
    async (group) => {
      writeTargetView("video", DRIVE, "default", { group });
      open(video, q("Videos/Study"));
      await waitForChips();

      const grouped = wire.calls.filter((c) => isLibrary(c) && !isChips(c) && param(c, "by") === group);
      expect(grouped.length, `a Library request by=${group}`).toBeGreaterThan(0);
      expect(crumbs()).not.toBeNull();
      await waitFor(() => expect(chipFolders()).toEqual(["Videos/Study/Math", "Videos/Study/Physics"]));
    },
  );

  it("SPEC-CORE-165 at the top a See all link carries no folder", async () => {
    writeTargetView("video", DRIVE, "default", { group: "tag" });
    open(video, "");
    await waitForChips();

    await waitFor(() => expect(chipFolders()).toEqual(["Videos", "Archive", "Music"]));
    const url = hrefOf(await screen.findByRole("link", { name: "See all: Trip" }));
    expect(url.searchParams.has("folder")).toBe(false);
    expect(url.searchParams.has("from_folder")).toBe(false);
  });

  it("SPEC-CORE-165 I12 Video's See all page applies the URL's folder to every request", async () => {
    openShelf(video, `by=tag&key=Trip&from=library&${q("Videos/Study")}`);
    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    const sent = wire.calls.filter((c) => (isShelves(c) || isListing(c)) && !isCount(c));
    expect(sent.length).toBeGreaterThan(0);
    for (const call of sent) expect(foldersOf(call)).toEqual(["Videos/Study"]);
  });
});
