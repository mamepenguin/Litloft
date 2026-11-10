/**
 * SPEC-CORE-068: Discover's provider shelves. `video-discover-recommended`
 * supplies Recommended and each `video-discover-shelves` entry adds a shelf;
 * the core narrows every provider's ids through `restrict` before drawing.
 *
 * The addon modules are stubbed under their real ids because the slot loader
 * resolves `@/addons/<name>/slots.ts` by globbing the linked directory, so a
 * virtual addon name has no module id to mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { writeAppPrefs } from "@/lib/appPrefs";
import { ApiStatusError } from "@/lib/api";
import { AddonSlot } from "@/components/AddonSlot";
import { VideoApp } from "../VideoApp";

// jsdom lays nothing out, so a shelf would hold the unmeasured minimum of cards.
// A wide grid lets every shelf draw all it keeps, so the tests see the shelf's list.
vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

const DRIVE = "my drive";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const addonsLinked = ["intelligence", "media_import", "knowledge"].every((name) => {
  const dir = resolve(SRC, "addons", name);
  return existsSync(dir) && readdirSync(dir).length > 0;
});

type Entry = {
  id: string;
  label: string;
  priority: number;
  addonName: string;
  href?: string;
  i18n_key?: string;
};
type Restrict = (ids: string[]) => Promise<string[]>;
type ProviderArgs = { drive: string; limit: number; restrict: Restrict };
type Provider = (args: ProviderArgs) => Promise<string[]>;
type Params = Record<string, unknown>;

const { catalogue, intel, media } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "my drive" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intel: {} as Record<string, unknown>,
  media: {} as Record<string, unknown>,
}));

/** A fresh copy on every call, so only a content comparison sees "no change". */
function freshSlots(): Record<string, Entry[]> {
  return Object.fromEntries(
    Object.entries(catalogue.slots).map(([slot, entries]) => [slot, entries.map((e) => ({ ...e }))]),
  );
}

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => {
    const slots = freshSlots();
    return {
      addons: {},
      catalogueDrive: catalogue.catalogueDrive,
      slots,
      loading: catalogue.loading,
      getSlotEntries: (id: string) => slots[id] ?? [],
      hasSlot: (id: string) => (slots[id] ?? []).length > 0,
    };
  },
  useAddonStatus: () => ({ features: {} }),
}));

vi.mock("@/addons/intelligence/slots.ts", async () => {
  const { createElement } = await import("react");
  return {
    slotComponents: { "stub-section": () => createElement("div", null, "Stub section") },
    slotProviders: intel,
  };
});
vi.mock("@/addons/media_import/slots.ts", () => ({ slotComponents: {}, slotProviders: media }));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/my%20drive/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();
const getSmartFolders = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
}));

function item(id: string, title: string) {
  return {
    id,
    filename: `${title}.mp4`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: 120,
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

const title = (id: string) => `Vid ${id}`;

/** Ids the server will not match, as if they failed the target or the watch filter. */
let unmatched = new Set<string>();

/** Answers in the reverse of the order it was asked, so only a client that re-orders keeps the provider's order. */
function restrictAnswer(p: Params) {
  const ids = (p.ids as string[]).filter((id) => !unmatched.has(id));
  const items = ids.map((id) => item(id, title(id))).reverse();
  return {
    by: "all",
    total_shelves: 1,
    base: "",
    shelves: [{ key: "all", label: "", count: items.length, items }],
  };
}

function defaultShelves(_d: string, p: Params) {
  if (p.ids !== undefined) return restrictAnswer(p);
  if (p.by === "watch" && p.key === "continue") {
    return {
      by: "watch",
      total_shelves: 1,
      base: "",
      shelves: [{ key: "continue", label: "", count: 1, items: [item("c1", "Resume me")] }],
    };
  }
  return { by: p.by, total_shelves: 0, base: "", shelves: [] };
}

function defaultFiles(p: Params) {
  const name = p.sort === "random" ? "Random pick" : "Newest one";
  return { data: [item("n1", name)], meta: { total: 42, page: 1, limit: 12 } };
}

const restrictCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.ids !== undefined);

const smartFolder = (id: string, name: string, query: string, extra: Params = {}) => ({
  id,
  drive: DRIVE,
  name,
  query,
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
  ...extra,
});

const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };
const SHELF_A: Entry = {
  id: "shelf-a",
  label: "Shelf Alpha",
  priority: 10,
  addonName: "media_import",
  href: "addons/media_import",
};
const SHELF_B: Entry = { id: "shelf-b", label: "Shelf Beta", priority: 20, addonName: "media_import" };

function declare(slots: { recommended?: Entry[]; shelves?: Entry[] }) {
  catalogue.slots = {
    ...(slots.recommended ? { "video-discover-recommended": slots.recommended } : {}),
    ...(slots.shelves ? { "video-discover-shelves": slots.shelves } : {}),
  };
}

function restricting(ids: string[]) {
  return vi.fn<Provider>(async ({ restrict }) => restrict(ids));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderApp() {
  return render(<VideoApp drive={DRIVE} />);
}

/** Each listed heading's video titles, by document position between it and the next listed heading present. */
function shelfTitles(headings: string[]): Record<string, string[]> {
  const present = headings
    .map((h) => ({ h, el: screen.queryByText(h) }))
    .filter((x): x is { h: string; el: HTMLElement } => x.el !== null);
  const cards = screen.queryAllByText(/^(Vid |Resume me$|Newest one$)/);
  const out: Record<string, string[]> = {};
  present.forEach(({ h, el }, i) => {
    const next = present[i + 1]?.el;
    out[h] = cards
      .filter((c) => el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)
      .filter((c) => !next || c.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)
      .map((c) => c.textContent ?? "");
  });
  return out;
}

function precedes(a: HTMLElement, b: HTMLElement) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function seeAllHrefs() {
  return screen.queryAllByRole("link", { name: /See all/ }).map((a) => a.getAttribute("href"));
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  unmatched = new Set();
  catalogue.loading = false;
  catalogue.catalogueDrive = DRIVE;
  catalogue.slots = {};
  for (const k of Object.keys(intel)) delete intel[k];
  for (const k of Object.keys(media)) delete media[k];
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async (_d, p) => defaultFiles(p));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

describe("SPEC-CORE-068 Recommended from the video-discover-recommended provider", () => {
  it.runIf(addonsLinked)("SPEC-CORE-068 I4 draws the provider's restricted items in the provider's order", async () => {
    intel.pickup = restricting(["r3", "r1", "r2"]);
    declare({ recommended: [PICKUP] });
    renderApp();

    await screen.findByText(title("r3"));
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(shelfTitles(["Continue", "Recommended", "New"]).Recommended).toEqual([
      title("r3"),
      title("r1"),
      title("r2"),
    ]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 calls the provider with the drive, a limit of 12 and a restrict", async () => {
    const pickup = restricting(["r1"]);
    intel.pickup = pickup;
    declare({ recommended: [PICKUP] });
    renderApp();

    await screen.findByText(title("r1"));
    expect(pickup).toHaveBeenCalledTimes(1);
    const args = pickup.mock.calls[0][0];
    expect(args.drive).toBe(DRIVE);
    expect(args.limit).toBe(12);
    expect(typeof args.restrict).toBe("function");
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I3 Recommended's restrict asks for unwatched videos under the target, 60 per shelf", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-trips", "Trips", "tag:Trip")]);
    writeAppPrefs(DRIVE, { target: "sf-trips" });
    intel.pickup = restricting(["r1", "r2"]);
    declare({ recommended: [PICKUP] });
    renderApp();

    await screen.findByText(title("r1"));
    const calls = restrictCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const p of calls) {
      expect(p).toMatchObject({ by: "all", key: "all", per_shelf: 60, type: ["video"], watch: "unwatched" });
      expect([p.tag].flat()).toContain("Trip");
    }
    expect(calls.flatMap((p) => p.ids as string[])).toEqual(["r1", "r2"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I4 drops duplicates and keeps the first 12", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `r${i}`);
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      const accepted = await restrict(ids);
      return [accepted[0], accepted[0], accepted[1], ...accepted];
    });
    declare({ recommended: [PICKUP] });
    renderApp();

    await screen.findByText(title("r0"));
    expect(shelfTitles(["Continue", "Recommended", "New"]).Recommended).toEqual(
      ids.slice(0, 12).map(title),
    );
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I3 drops ids that its restrict did not return", async () => {
    unmatched = new Set(["r2"]);
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["r1", "r2"]);
      return ["r2", "zz", "r1"];
    });
    declare({ recommended: [PICKUP] });
    renderApp();

    await screen.findByText(title("r1"));
    expect(shelfTitles(["Continue", "Recommended", "New"]).Recommended).toEqual([title("r1")]);
    expect(screen.queryByText(title("r2"))).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 accepts the ids of every restrict call the provider makes", async () => {
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      const first = await restrict(["r1"]);
      const second = await restrict(["r2"]);
      return [...second, ...first];
    });
    declare({ recommended: [PICKUP] });
    renderApp();

    await screen.findByText(title("r1"));
    expect(shelfTitles(["Continue", "Recommended", "New"]).Recommended).toEqual([title("r2"), title("r1")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I4 uses the first entry by priority whose module exports a function", async () => {
    const pickup = restricting(["r1"]);
    const later = restricting(["l1"]);
    intel.pickup = pickup;
    media.later = later;
    declare({
      recommended: [
        { id: "later", label: "Later", priority: 20, addonName: "media_import" },
        { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" },
        { id: "no-function", label: "No function", priority: 7, addonName: "intelligence" },
        { id: "no-providers", label: "No providers", priority: 5, addonName: "knowledge" },
        { id: "no-module", label: "No module", priority: 1, addonName: "nope" },
      ],
    });
    renderApp();

    await screen.findByText(title("r1"));
    await settle();
    expect(pickup).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    expect(screen.queryByText(title("l1"))).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I4 never tries a later entry when the chosen one rejects", async () => {
    const pickup = vi.fn<Provider>(async () => {
      throw new Error("boom");
    });
    const later = restricting(["l1"]);
    intel.pickup = pickup;
    media.later = later;
    media["shelf-a"] = restricting(["a1"]);
    declare({
      recommended: [PICKUP, { id: "later", label: "Later", priority: 20, addonName: "media_import" }],
      shelves: [SHELF_A],
    });
    renderApp();

    await waitFor(() => expect(pickup).toHaveBeenCalled());
    await screen.findByText(title("a1"));
    await settle();
    expect(later).not.toHaveBeenCalled();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.getByText("Resume me")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I4 sends no random request and draws no Recommended when the provider yields nothing", async () => {
    const pickup = vi.fn<Provider>(async () => []);
    intel.pickup = pickup;
    declare({ recommended: [PICKUP] });
    renderApp();

    await waitFor(() => expect(pickup).toHaveBeenCalled());
    await screen.findByText("Newest one");
    await settle();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(getShelves.mock.calls.some(([, p]) => (p as Params).key === "unwatched")).toBe(false);
    expect(getShelves.mock.calls.some(([, p]) => (p as Params).sort === "random")).toBe(false);
    expect(getDriveFiles.mock.calls.some(([, p]) => (p as Params).sort === "random")).toBe(false);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I4 never calls the Recommended provider without a profile, while addon shelves still run", async () => {
    nickname = null;
    const pickup = restricting(["r1"]);
    intel.pickup = pickup;
    media["shelf-a"] = restricting(["a1"]);
    declare({ recommended: [PICKUP], shelves: [SHELF_A] });
    renderApp();

    await screen.findByText(title("a1"));
    await settle();
    expect(pickup).not.toHaveBeenCalled();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(restrictCalls().every((p) => p.watch === undefined)).toBe(true);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 runs the Recommended provider once a profile is set", async () => {
    nickname = null;
    const pickup = restricting(["r1"]);
    intel.pickup = pickup;
    declare({ recommended: [PICKUP] });
    const view = renderApp();
    await screen.findByText("Newest one");
    expect(pickup).not.toHaveBeenCalled();

    nickname = "alice";
    view.rerender(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText(title("r1"))).toBeInTheDocument();
  });
});

describe("SPEC-CORE-068 addon shelves from video-discover-shelves", () => {
  it.runIf(addonsLinked)("SPEC-CORE-068 I7 draws Continue, Recommended, addon shelves by priority, then New", async () => {
    intel.pickup = restricting(["r1"]);
    media["shelf-a"] = restricting(["a1"]);
    media["shelf-b"] = restricting(["b1"]);
    declare({
      recommended: [PICKUP],
      shelves: [
        { ...SHELF_A, priority: 30 },
        { ...SHELF_B, priority: 15 },
      ],
    });
    renderApp();

    await screen.findByText(title("r1"));
    await screen.findByText(title("a1"));
    await screen.findByText(title("b1"));
    const order = ["Continue", "Recommended", "Shelf Beta", "Shelf Alpha", "New"].map((h) =>
      screen.getByText(h),
    );
    for (let i = 0; i + 1 < order.length; i++) {
      expect(precedes(order[i], order[i + 1])).toBe(true);
    }
    const shelves = shelfTitles(["Continue", "Recommended", "Shelf Beta", "Shelf Alpha", "New"]);
    expect(shelves["Shelf Beta"]).toEqual([title("b1")]);
    expect(shelves["Shelf Alpha"]).toEqual([title("a1")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I7 titles a shelf with its translated i18n_key, else its label", async () => {
    media["shelf-a"] = restricting(["a1"]);
    media["shelf-b"] = restricting(["b1"]);
    declare({
      shelves: [{ ...SHELF_A, label: "Untranslated", i18n_key: "mediaImport.watch.lane.regular" }, SHELF_B],
    });
    renderApp();

    await screen.findByText(title("a1"));
    await screen.findByText(title("b1"));
    expect(screen.getByText("Regular sources")).toBeInTheDocument();
    expect(screen.queryByText("Untranslated")).not.toBeInTheDocument();
    expect(screen.getByText("Shelf Beta")).toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I7 links See all exactly when the entry declares href, with the drive encoded", async () => {
    intel.pickup = restricting(["r1"]);
    media["shelf-a"] = restricting(["a1"]);
    media["shelf-b"] = restricting(["b1"]);
    declare({ recommended: [PICKUP], shelves: [SHELF_A, SHELF_B] });
    renderApp();

    await screen.findByText(title("r1"));
    await screen.findByText(title("a1"));
    await screen.findByText(title("b1"));
    const hrefs = seeAllHrefs();
    expect(hrefs).toContain(`/drive/${encodeURIComponent(DRIVE)}/addons/media_import`);
    expect(hrefs.filter((h) => h?.includes("/addons/"))).toHaveLength(1);
    expect(hrefs.some((h) => h?.includes("unwatched"))).toBe(false);
    expect(screen.queryByRole("link", { name: "See all: Recommended" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See all: Shelf Beta" })).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I3 an addon shelf's restrict adds no watch condition, only the target", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-trips", "Trips", "tag:Trip")]);
    writeAppPrefs(DRIVE, { target: "sf-trips" });
    media["shelf-a"] = restricting(["a1"]);
    declare({ shelves: [SHELF_A] });
    renderApp();

    await screen.findByText(title("a1"));
    const calls = restrictCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const p of calls) {
      expect(p).toMatchObject({ by: "all", key: "all", per_shelf: 60, type: ["video"] });
      expect(p.watch).toBeUndefined();
      expect([p.tag].flat()).toContain("Trip");
    }
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I3 an id accepted for one shelf never counts for another", async () => {
    media["shelf-a"] = restricting(["x"]);
    media["shelf-b"] = vi.fn<Provider>(async ({ restrict }) => {
      const own = await restrict(["b1"]);
      return ["x", ...own];
    });
    declare({ shelves: [SHELF_A, SHELF_B] });
    renderApp();

    await screen.findByText(title("x"));
    await screen.findByText(title("b1"));
    const shelves = shelfTitles(["Continue", "Shelf Alpha", "Shelf Beta", "New"]);
    expect(shelves["Shelf Alpha"]).toEqual([title("x")]);
    expect(shelves["Shelf Beta"]).toEqual([title("b1")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I5 a missing function, a rejection or a failed restrict hides that shelf alone", async () => {
    media["shelf-a"] = restricting(["a1"]);
    media["shelf-c"] = vi.fn<Provider>(async () => {
      throw new Error("boom");
    });
    media["shelf-d"] = restricting(["d1"]);
    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (p.ids !== undefined && (p.ids as string[]).includes("d1")) throw new Error("restrict failed");
      return defaultShelves(d, p);
    });
    declare({
      shelves: [
        SHELF_A,
        { ...SHELF_B, id: "shelf-missing", label: "Missing" },
        { id: "shelf-c", label: "Rejecting", priority: 30, addonName: "media_import" },
        { id: "shelf-d", label: "Failing restrict", priority: 40, addonName: "media_import" },
        { id: "shelf-e", label: "No module", priority: 50, addonName: "nope" },
      ],
    });
    renderApp();

    await screen.findByText(title("a1"));
    await waitFor(() => expect(media["shelf-c"]).toHaveBeenCalled());
    await waitFor(() => expect(media["shelf-d"]).toHaveBeenCalled());
    await settle();
    expect(screen.getByText("Shelf Alpha")).toBeInTheDocument();
    for (const hidden of ["Missing", "Rejecting", "Failing restrict", "No module"]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
    expect(screen.getByText("Resume me")).toBeInTheDocument();
    expect(screen.getByText("Newest one")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I5 draws nothing for a shelf while its provider is pending, then draws it", async () => {
    const pending = deferred<string[]>();
    media["shelf-a"] = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["a1"]);
      return pending.promise;
    });
    declare({ shelves: [SHELF_A] });
    renderApp();

    await waitFor(() => expect(media["shelf-a"]).toHaveBeenCalled());
    await screen.findByText("Newest one");
    await settle();
    expect(screen.queryByText("Shelf Alpha")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();

    await act(async () => pending.resolve(["a1"]));

    expect(await screen.findByText("Shelf Alpha")).toBeInTheDocument();
    expect(screen.getByText(title("a1"))).toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 the empty state counts Continue and New only and does not wait for a provider", async () => {
    const shelfA = vi.fn<Provider>(() => new Promise<string[]>(() => {}));
    media["shelf-a"] = shelfA;
    declare({ shelves: [SHELF_A] });
    getShelves.mockImplementation(async (d: string, p: Params) =>
      p.key === "continue"
        ? { by: "watch", total_shelves: 1, base: "", shelves: [{ key: "continue", label: "", count: 0, items: [] }] }
        : defaultShelves(d, p),
    );
    getDriveFiles.mockImplementation(async () => ({ data: [], meta: { total: 0, page: 1, limit: 12 } }));
    renderApp();

    expect(await screen.findByText("No files")).toBeInTheDocument();
    await waitFor(() => expect(shelfA).toHaveBeenCalled());
    expect(screen.getByText("No files")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-068 restrict", () => {
  it.runIf(addonsLinked).each([
    [0, 0],
    [1, 1],
    [60, 1],
    [61, 2],
    [121, 3],
  ])(
    "SPEC-CORE-068 I14 restrict of %i ids sends at least %i requests of at most 60 ids and answers in the order given",
    async (n, fewest) => {
      const ids = Array.from({ length: n }, (_, i) => `k${String(i).padStart(3, "0")}`).reverse();
      let answered: string[] | undefined;
      media["shelf-a"] = vi.fn<Provider>(async ({ restrict }) => {
        answered = await restrict(ids);
        return answered;
      });
      declare({ shelves: [SHELF_A] });
      renderApp();

      await waitFor(() => expect(answered).toBeDefined());
      const sizes = restrictCalls().map((p) => (p.ids as string[]).length);
      expect(sizes.every((size) => size >= 1 && size <= 60)).toBe(true);
      if (n === 0) expect(sizes).toEqual([]);
      if (n === 60) expect(sizes).toEqual([60]);
      expect(sizes.length).toBeGreaterThanOrEqual(fewest);
      expect(restrictCalls().flatMap((p) => p.ids as string[]).sort()).toEqual([...ids].sort());
      expect(answered).toEqual(ids);
    },
  );

  it.runIf(addonsLinked)("SPEC-CORE-068 I14 restrict keeps only the matched ids, in the order given", async () => {
    unmatched = new Set(["k2", "k4"]);
    let answered: string[] | undefined;
    media["shelf-a"] = vi.fn<Provider>(async ({ restrict }) => {
      answered = await restrict(["k5", "k4", "k3", "k2", "k1"]);
      return answered;
    });
    declare({ shelves: [SHELF_A] });
    renderApp();

    await waitFor(() => expect(answered).toBeDefined());
    expect(answered).toEqual(["k5", "k3", "k1"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I14 a viewer_required answer to restrict treats the viewer as rejected", async () => {
    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (p.ids !== undefined) {
        throw Object.assign(new ApiStatusError(400, "API error: 400"), { detail: "viewer_required" });
      }
      return defaultShelves(d, p);
    });
    const pickup = restricting(["r1"]);
    intel.pickup = pickup;
    declare({ recommended: [PICKUP] });
    renderApp();

    await waitFor(() => expect(pickup).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Resume me")).not.toBeInTheDocument());
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I14 a superseded restrict's viewer_required does not reject the viewer", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-trips", "Trips", "tag:Trip")]);
    const held = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (p.ids !== undefined && p.tag === undefined) return held.promise;
      return defaultShelves(d, p);
    });
    media["shelf-a"] = restricting(["a1"]);
    declare({ shelves: [SHELF_A] });
    renderApp();
    await screen.findByText("Resume me");
    await waitFor(() => expect(restrictCalls().length).toBe(1));

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByText("Trips"));
    expect(await screen.findByText(title("a1"))).toBeInTheDocument();

    await act(async () =>
      held.reject(Object.assign(new ApiStatusError(400, "API error: 400"), { detail: "viewer_required" })),
    );
    await settle();

    expect(screen.getByText("Resume me")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-068 when the providers run", () => {
  it.runIf(addonsLinked)("SPEC-CORE-068 I6 with no entry for either slot sends no Recommended or provider request", async () => {
    declare({});
    renderApp();

    await screen.findByText("Resume me");
    await screen.findByText("Newest one");
    await settle();
    expect(getShelves.mock.calls.some(([, p]) => (p as Params).key === "unwatched")).toBe(false);
    expect(getShelves.mock.calls.some(([, p]) => (p as Params).sort === "random")).toBe(false);
    expect(getDriveFiles.mock.calls.some(([, p]) => (p as Params).sort === "random")).toBe(false);
    expect(restrictCalls()).toHaveLength(0);
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I11 calls no provider until the catalogue has loaded", async () => {
    catalogue.loading = true;
    const shelfA = restricting(["a1"]);
    media["shelf-a"] = shelfA;
    declare({ shelves: [SHELF_A] });
    const view = renderApp();
    await screen.findByText("Newest one");
    await settle();
    expect(shelfA).not.toHaveBeenCalled();

    catalogue.loading = false;
    view.rerender(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText(title("a1"))).toBeInTheDocument();
    expect(shelfA).toHaveBeenCalledTimes(1);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I11 never uses a catalogue fetched for another drive", async () => {
    catalogue.catalogueDrive = "other";
    const shelfA = restricting(["a1"]);
    media["shelf-a"] = shelfA;
    declare({ shelves: [SHELF_A] });
    const view = renderApp();
    await screen.findByText("Newest one");
    await settle();
    expect(shelfA).not.toHaveBeenCalled();
    expect(screen.queryByText("Shelf Alpha")).not.toBeInTheDocument();

    catalogue.catalogueDrive = DRIVE;
    view.rerender(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText(title("a1"))).toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I13 calls no provider before Discover is shown, and keeps the result across a face switch", async () => {
    writeAppPrefs(DRIVE, { face: "library" });
    const shelfA = restricting(["a1"]);
    media["shelf-a"] = shelfA;
    declare({ shelves: [SHELF_A] });
    renderApp();
    await screen.findByRole("tab", { name: "Library" });
    await settle();
    expect(shelfA).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    expect(await screen.findByText(title("a1"))).toBeInTheDocument();
    expect(shelfA).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    await settle();
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));

    expect(await screen.findByText(title("a1"))).toBeInTheDocument();
    expect(shelfA).toHaveBeenCalledTimes(1);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I13 calls no provider while the target is empty", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-pics", "Pictures", "", { file_type: "image" })]);
    const shelfA = restricting(["a1"]);
    media["shelf-a"] = shelfA;
    declare({ shelves: [SHELF_A] });
    renderApp();
    expect(await screen.findByText(title("a1"))).toBeInTheDocument();
    expect(shelfA).toHaveBeenCalledTimes(1);

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByText("Pictures"));

    await waitFor(() => expect(screen.queryByText(title("a1"))).not.toBeInTheDocument());
    await settle();
    expect(shelfA).toHaveBeenCalledTimes(1);
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I11 hides a shelf while it re-runs for a new target and never draws the old answer", async () => {
    const old = deferred<string[]>();
    const fresh = deferred<string[]>();
    let call = 0;
    media["shelf-a"] = vi.fn<Provider>(async ({ restrict }) => {
      call += 1;
      if (call === 1) {
        await restrict(["a1"]);
        return ["a1"];
      }
      if (call === 2) {
        await restrict(["stale"]);
        return old.promise;
      }
      await restrict(["new1"]);
      return fresh.promise;
    });
    getSmartFolders.mockResolvedValue([
      smartFolder("sf-trips", "Trips", "tag:Trip"),
      smartFolder("sf-cats", "Cats", "tag:Cat"),
    ]);
    declare({ shelves: [SHELF_A] });
    renderApp();
    expect(await screen.findByText(title("a1"))).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByText("Trips"));
    await waitFor(() => expect(call).toBe(2));
    await waitFor(() => expect(screen.queryByText(title("a1"))).not.toBeInTheDocument());
    expect(screen.queryByText("Shelf Alpha")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByText("Cats"));
    await waitFor(() => expect(call).toBe(3));

    await act(async () => old.resolve(["stale"]));
    await settle();
    expect(screen.queryByText(title("stale"))).not.toBeInTheDocument();
    expect(screen.queryByText("Shelf Alpha")).not.toBeInTheDocument();

    await act(async () => fresh.resolve(["new1"]));
    expect(await screen.findByText(title("new1"))).toBeInTheDocument();
    expect(screen.queryByText(title("stale"))).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 re-runs when an entry's content changes, not when the same entries are re-created", async () => {
    const shelfA = restricting(["a1"]);
    media["shelf-a"] = shelfA;
    declare({ shelves: [SHELF_A] });
    const view = renderApp();
    expect(await screen.findByText(title("a1"))).toBeInTheDocument();

    for (let i = 0; i < 3; i++) view.rerender(<VideoApp drive={DRIVE} />);
    await settle();
    expect(shelfA).toHaveBeenCalledTimes(1);

    declare({ shelves: [{ ...SHELF_A, label: "Shelf Alpha renamed" }] });
    view.rerender(<VideoApp drive={DRIVE} />);
    await settle();
    expect(shelfA).toHaveBeenCalledTimes(1);

    declare({ shelves: [{ ...SHELF_A, href: "addons/media_import/elsewhere" }] });
    view.rerender(<VideoApp drive={DRIVE} />);
    await waitFor(() => expect(shelfA).toHaveBeenCalledTimes(2));
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I11 on a drive switch draws nothing of the previous drive and waits for the new catalogue", async () => {
    const shelfA = vi.fn<Provider>(async ({ drive, restrict }) => restrict([drive === DRIVE ? "a1" : "b1"]));
    media["shelf-a"] = shelfA;
    declare({ shelves: [SHELF_A] });
    const view = renderApp();
    expect(await screen.findByText(title("a1"))).toBeInTheDocument();

    view.rerender(<VideoApp drive="second" />);
    await waitFor(() => expect(screen.queryByText(title("a1"))).not.toBeInTheDocument());
    await settle();
    expect(shelfA.mock.calls.some(([args]) => args.drive === "second")).toBe(false);

    catalogue.catalogueDrive = "second";
    view.rerender(<VideoApp drive="second" />);

    await waitFor(() => expect(shelfA.mock.calls.some(([args]) => args.drive === "second")).toBe(true));
    expect(await screen.findByText(title("b1"))).toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-068 I10 a provider resolves from a module an AddonSlot already loaded, and the slot still renders", async () => {
    intel.pickup = restricting(["r1"]);
    catalogue.slots = {
      "test-sections": [{ id: "stub-section", label: "Stub", priority: 10, addonName: "intelligence" }],
      "video-discover-recommended": [PICKUP],
    };
    render(
      <>
        <AddonSlot id="test-sections" />
        <VideoApp drive={DRIVE} />
      </>,
    );

    expect(await screen.findByText("Stub section")).toBeInTheDocument();
    expect(await screen.findByText(title("r1"))).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });
});
