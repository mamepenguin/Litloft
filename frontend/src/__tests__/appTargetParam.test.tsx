/**
 * SPEC-CORE-154: Video and Reading opened on `?target=<id>` (I4, I5, I6, I7) and
 * the Home row in their Target menus (I12). Driven through the route pages, so
 * the parameter reaches the app the way a Home tile's link delivers it; every
 * request is answered at `fetch`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { readAppTarget, writeAppPrefs, writeTargetView, type AppId } from "@/lib/appPrefs";
import { readLibraryFilters, resetLibraryFilters, writeLibraryFilters } from "@/components/appshell/libraryFilters";
import { invalidateAddonsCache } from "@/lib/addons";
import { installWireFetch, json, paramsOf, type WireCall } from "@/__tests__/helpers/wireFetch";

const DRIVE = "main";

const nav = vi.hoisted(() => ({
  search: new URLSearchParams(),
  pathname: "/drive/main/apps/video",
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
  useParams: () => ({ name: "main" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
}));

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
  id: AppId;
  Route: () => React.ReactNode;
  ShelfRoute: () => React.ReactNode;
  defaultName: RegExp;
}

const APPS: AppCase[] = [
  { id: "video", Route: VideoRoute, ShelfRoute: VideoShelfRoute, defaultName: /All videos/ },
  { id: "reading", Route: ReadingRoute, ShelfRoute: ReadingShelfRoute, defaultName: /All books/ },
];

// ---- data -------------------------------------------------------------------

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

function smartFolder(id: string, name: string, query: string) {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

function collection(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    drive: DRIVE,
    item_count: 2,
    first_file_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const SMART_FOLDERS = [
  smartFolder("sf-trips", "Trips", "tag:Trip"),
  smartFolder("sf-long", "Long ones", "duration:>1h"),
];
const COLLECTIONS = [collection("c-trip", "Trip box"), collection("c-other", "Other box")];

// ---- the wire -----------------------------------------------------------------

const path = (c: WireCall) => c.url.pathname;
const isListing = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/files` || path(c) === `/api/drives/${DRIVE}/files/query`;
const isShelves = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/shelves` || path(c) === `/api/drives/${DRIVE}/shelves/query`;
const isTagCounts = (c: WireCall) => path(c).includes("/tag-counts");
const isSmartFolders = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/smart-folders`;
const isCollections = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/collections`;
const isShortcuts = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/home-shortcuts`;
/** Every request that carries a Target: listings, counts, shelves and tag counts. */
const underTarget = (c: WireCall) => isListing(c) || isShelves(c) || isTagCounts(c);

type Answer = () => Response | Promise<Response>;

let app: AppCase;
let smartFolders: Answer;
let collections: Answer;
let wire: { calls: WireCall[] };
const released: (() => void)[] = [];

/** An answer the test releases itself. */
function held(answer: Answer): Answer {
  return () =>
    new Promise<Response>((resolve) => {
      released.push(() => resolve(answer()));
    });
}

function shelvesAnswer(call: WireCall) {
  const by = call.url.searchParams.get("by") ?? "all";
  const key = call.url.searchParams.get("key") ?? "all";
  return json({
    by,
    base: "",
    total_shelves: 1,
    shelves: [{ key, label: key, count: 1, items: [item(`s-${by}-${key}`, `Shelf ${by} ${key}`, app.id)] }],
  });
}

function open(app: AppCase, query: string) {
  nav.pathname = `/drive/${DRIVE}/apps/${app.id}`;
  nav.search = new URLSearchParams(query);
  const Route = app.Route;
  return render(<Route />);
}

async function settle(ms = 100) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function releaseAll() {
  await act(async () => {
    for (const release of released.splice(0)) release();
  });
}

const targetButton = () => screen.getByRole("button", { name: /Target/ });

/** The URL the last `router.replace` went to. */
function lastReplace(): URL {
  expect(nav.replace).toHaveBeenCalled();
  return new URL(String(nav.replace.mock.calls.at(-1)![0]), `http://localhost${nav.pathname}`);
}

function expectTargetRemovedByReplace() {
  const url = lastReplace();
  expect(url.pathname).toBe(nav.pathname);
  expect(url.searchParams.has("target")).toBe(false);
  expect(nav.push).not.toHaveBeenCalled();
}

function storage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    out[key] = localStorage.getItem(key)!;
  }
  return out;
}

const targetKey = (id: AppId) => `litloft.${id}App.target.${DRIVE}`;
const viewKey = (id: AppId) => `litloft.${id}App.view.${DRIVE}`;

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.replace.mockImplementation((href: string) => {
    nav.search = new URL(href, `http://localhost${nav.pathname}`).searchParams;
  });
  toast.error.mockReset();
  released.length = 0;
  smartFolders = () => json(SMART_FOLDERS);
  collections = () => json(COLLECTIONS);
  for (const id of ["video", "reading"] as const) resetLibraryFilters(id, DRIVE);
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
    if (isSmartFolders(call)) return smartFolders();
    if (isCollections(call)) return collections();
    if (path(call) === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isShortcuts(call)) return call.method === "GET" ? json([]) : new Response(null, { status: 204 });
    if (isTagCounts(call)) return json([]);
    if (isListing(call)) return json({ data: [item("d1", "Listed", app.id)], meta: { total: 42, page: 1, limit: 12 } });
    if (isShelves(call)) return shelvesAnswer(call);
    return json([]);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("SPEC-CORE-154 $id opened with ?target=", (appCase) => {
  beforeEach(() => {
    app = appCase;
  });

  describe("I4 I5 a Target that resolves", () => {
    it("SPEC-CORE-154 I4 I5 holds every request until the collection list resolves the id, then applies and saves it", async () => {
      collections = held(collections);
      open(app, "target=collection%3Ac-trip");

      await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
      await settle();
      expect(wire.calls.filter(underTarget)).toEqual([]);

      await releaseAll();
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      expect(readAppTarget(DRIVE, app.id)).toBe("collection:c-trip");
      const sent = wire.calls.filter(underTarget);
      expect(sent.length).toBeGreaterThan(0);
      for (const call of sent) expect(paramsOf(call, "collection")).toEqual(["Trip box"]);
      expect(targetButton()).toHaveTextContent("Trip box");
      expectTargetRemovedByReplace();
    });

    it("SPEC-CORE-154 I4 I5 holds every request until the Smart Folder list resolves the id, then applies and saves it", async () => {
      writeAppPrefs(DRIVE, { target: "collection:c-other" }, app.id);
      smartFolders = held(smartFolders);
      open(app, "target=sf-trips");

      await waitFor(() => expect(wire.calls.some(isSmartFolders)).toBe(true));
      await settle();
      expect(wire.calls.filter(underTarget)).toEqual([]);

      await releaseAll();
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      expect(readAppTarget(DRIVE, app.id)).toBe("sf-trips");
      const sent = wire.calls.filter(underTarget);
      expect(sent.length).toBeGreaterThan(0);
      for (const call of sent) {
        expect(paramsOf(call, "tag")).toContain("Trip");
        expect(paramsOf(call, "collection")).toEqual([]);
      }
      expect(targetButton()).toHaveTextContent("Trips");
      expectTargetRemovedByReplace();
    });

    it("SPEC-CORE-154 I4 shows no listing or shelf, not the default Target's content, while pending", async () => {
      collections = held(collections);
      open(app, "target=collection%3Ac-trip");
      await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
      await settle();

      expect(wire.calls.filter(underTarget)).toEqual([]);
      expect(screen.queryByText("Listed")).toBeNull();
      expect(screen.queryByText(/^Shelf /)).toBeNull();
    });

    it("SPEC-CORE-154 I5 writes the Target key and no other key, and puts the Target's saved view in force", async () => {
      writeAppPrefs(DRIVE, { face: "library" }, app.id);
      writeTargetView(app.id, DRIVE, "collection:c-trip", { group: "month" });
      const before = storage();
      collections = held(collections);
      open(app, "target=collection%3Ac-trip");
      await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
      await settle();
      expect(wire.calls.filter(underTarget)).toEqual([]);

      await releaseAll();
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      const after = storage();
      const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
      expect(changed).toEqual([targetKey(app.id)]);
      expect(after[viewKey(app.id)]).toBe(before[viewKey(app.id)]);
      const grouped = wire.calls.filter(isShelves).filter((c) => c.url.searchParams.get("by") === "month");
      expect(grouped.length).toBeGreaterThan(0);
      for (const call of grouped) expect(paramsOf(call, "collection")).toEqual(["Trip box"]);
    });
  });

  describe("I4 I5 I6 a Target that does not resolve", () => {
    it.each([
      ["an id not in the Smart Folder list", "target=sf-gone", "sf-gone", null],
      ["an id not in the collection list", "target=collection%3Agone", "gone", null],
      ["a collection whose list failed to load", "target=collection%3Ac-trip", "c-trip", "collections-fail"],
      ["an unusable Smart Collection", "target=sf-long", "sf-long", null],
      ["default", "target=default", null, null],
      ["an empty value", "target=", null, null],
    ])("SPEC-CORE-154 I4 I5 I6 ignores %s: keeps and uses the saved Target, writes nothing, removes target", async (_, query, leaked, how) => {
      writeAppPrefs(DRIVE, { target: "sf-trips" }, app.id);
      if (how === "collections-fail") collections = () => json({ detail: "boom" }, 500);
      const before = storage();
      open(app, query);

      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      expect(storage()).toEqual(before);
      expect(readAppTarget(DRIVE, app.id)).toBe("sf-trips");
      for (const call of wire.calls.filter(underTarget)) expect(paramsOf(call, "tag")).toContain("Trip");
      expect(targetButton()).toHaveTextContent("Trips");
      expectTargetRemovedByReplace();
      expect(toast.error).not.toHaveBeenCalled();
      if (leaked) {
        for (const call of wire.calls) {
          expect(call.url.href).not.toContain(leaked);
          expect(JSON.stringify(call.body ?? "")).not.toContain(leaked);
        }
      }
    });

    it("SPEC-CORE-154 I4 an ignored id with nothing saved runs the default Target only after the list answered", async () => {
      collections = held(collections);
      open(app, "target=collection%3Agone");
      await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
      await settle();
      expect(wire.calls.filter(underTarget)).toEqual([]);

      await releaseAll();
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      expect(readAppTarget(DRIVE, app.id)).toBe("default");
      for (const call of wire.calls.filter(underTarget)) expect(paramsOf(call, "collection")).toEqual([]);
      expect(targetButton()).toHaveTextContent(app.defaultName);
      expectTargetRemovedByReplace();
    });
  });

  describe("I6 a pending id is dropped", () => {
    it("SPEC-CORE-154 I6 a Target chosen in the menu while pending wins, and the pending id is never written", async () => {
      collections = held(collections);
      open(app, "target=collection%3Ac-trip");
      await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
      await settle();
      expect(wire.calls.filter(underTarget)).toEqual([]);

      fireEvent.click(targetButton());
      fireEvent.click(await screen.findByRole("menuitemradio", { name: "Trips" }));
      await releaseAll();
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      expect(readAppTarget(DRIVE, app.id)).toBe("sf-trips");
      for (const call of wire.calls.filter(underTarget)) expect(paramsOf(call, "collection")).toEqual([]);
      expect(targetButton()).toHaveTextContent("Trips");
    });

    it("SPEC-CORE-154 I6 leaving the page while pending drops the id unwritten", async () => {
      collections = held(collections);
      const view = open(app, "target=collection%3Ac-trip");
      await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
      await settle();
      expect(wire.calls.filter(underTarget)).toEqual([]);

      view.unmount();
      await releaseAll();
      await settle();

      expect(readAppTarget(DRIVE, app.id)).toBe("default");
    });
  });

  describe("I7 the Library filters", () => {
    it("SPEC-CORE-154 I7 applying a Target other than the saved one resets tag and state to all", async () => {
      writeAppPrefs(DRIVE, { target: "sf-trips", face: "library" }, app.id);
      writeLibraryFilters(app.id, DRIVE, { tags: ["Cats"], state: "in_progress" });
      open(app, "target=collection%3Ac-trip");

      await waitFor(() => expect(readAppTarget(DRIVE, app.id)).toBe("collection:c-trip"));
      await settle();

      expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ tags: [], state: "all" });
      expectTargetRemovedByReplace();
    });

    it("SPEC-CORE-154 I7 applying the Target already saved leaves the filters as they were", async () => {
      writeAppPrefs(DRIVE, { target: "collection:c-trip", face: "library" }, app.id);
      writeLibraryFilters(app.id, DRIVE, { tags: ["Cats"], state: "in_progress" });
      open(app, "target=collection%3Ac-trip");

      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ tags: ["Cats"], state: "in_progress" });
      expect(readAppTarget(DRIVE, app.id)).toBe("collection:c-trip");
      expectTargetRemovedByReplace();
    });
  });

  describe("I12 the Home row carries the app's own entry key", () => {
    it("SPEC-CORE-154 I12 Put on Home from the app's root page sends the app's key", async () => {
      writeAppPrefs(DRIVE, { target: "sf-trips" }, app.id);
      open(app, "");
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));

      fireEvent.click(targetButton());
      fireEvent.click(await screen.findByRole("menuitem", { name: "Put on Home" }));

      await waitFor(() => expect(wire.calls.filter((c) => isShortcuts(c) && c.method === "PUT")).toHaveLength(1));
      expect(wire.calls.find((c) => isShortcuts(c) && c.method === "PUT")!.body).toEqual({
        kind: "app_target",
        app: app.id,
        id: "sf-trips",
        on_home: true,
      });
    });

    it("SPEC-CORE-154 I4 I12 the See all page ignores ?target= and its menu carries the app's key", async () => {
      writeAppPrefs(DRIVE, { target: "sf-trips" }, app.id);
      nav.pathname = `/drive/${DRIVE}/apps/${app.id}/shelf`;
      nav.search = new URLSearchParams("by=folder&key=Movies&target=collection%3Ac-trip");
      const ShelfRoute = app.ShelfRoute;
      render(<ShelfRoute />);
      await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
      await settle();

      expect(readAppTarget(DRIVE, app.id)).toBe("sf-trips");
      for (const call of nav.replace.mock.calls) {
        expect(new URL(String(call[0]), "http://localhost/").searchParams.get("target")).toBe("collection:c-trip");
      }
      for (const call of wire.calls.filter(underTarget)) expect(paramsOf(call, "collection")).toEqual([]);

      fireEvent.click(targetButton());
      fireEvent.click(await screen.findByRole("menuitem", { name: "Put on Home" }));
      await waitFor(() => expect(wire.calls.filter((c) => isShortcuts(c) && c.method === "PUT")).toHaveLength(1));
      expect(wire.calls.find((c) => isShortcuts(c) && c.method === "PUT")!.body).toMatchObject({
        kind: "app_target",
        app: app.id,
        id: "sf-trips",
      });
    });
  });
});
