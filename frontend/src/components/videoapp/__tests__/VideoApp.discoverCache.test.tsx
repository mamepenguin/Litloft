/**
 * SPEC-CORE-077: each provider's last ids are kept for the tab's life and rebuilt with one
 * restrict on the next visit, without waiting for the provider.
 *
 * Every case uses a drive of its own, so the tab-lifetime store cannot carry an entry from
 * one case into another.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { ApiStatusError } from "@/lib/api";
import { writeAppPrefs } from "@/lib/appPrefs";
import { VideoApp } from "../VideoApp";
import {
  PICKUP,
  SHELF_A,
  SKELETON,
  advance,
  continueAnswer,
  deferred,
  filesAnswer,
  flush,
  freshDrive,
  item,
  layout,
  never,
  restrictAnswer,
  restricting,
  shelfCards,
  silent,
  title,
  useFakeClock,
  type Entry,
  type Params,
  type Provider,
} from "./discoverHarness";

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

const { catalogue, intel, media } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intel: {} as Record<string, unknown>,
  media: {} as Record<string, unknown>,
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => {
    const slots = Object.fromEntries(
      Object.entries(catalogue.slots).map(([slot, entries]) => [slot, entries.map((e) => ({ ...e }))]),
    );
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

vi.mock("@/addons/intelligence/slots.ts", () => ({ slotComponents: {}, slotProviders: intel }));
vi.mock("@/addons/media_import/slots.ts", () => ({ slotComponents: {}, slotProviders: media }));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/d/apps/video",
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

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const addonsLinked = ["intelligence", "media_import", "knowledge"].every((name) => {
  const dir = resolve(SRC, "addons", name);
  return existsSync(dir) && readdirSync(dir).length > 0;
});

let drive = "";
let unmatched = new Set<string>();

const isContinue = (p: Params) => p.by === "watch" && p.key === "continue";

function defaultShelves(_d: string, p: Params) {
  if (p.ids !== undefined) return restrictAnswer(p, unmatched);
  if (isContinue(p)) return continueAnswer([item("c1", "Resume me", drive)]);
  return { by: p.by, total_shelves: 0, base: "", shelves: [] };
}

const restrictCalls = () =>
  getShelves.mock.calls
    .map(([d, p]): Params & { drive: string } => ({ ...(p as Params), drive: d as string }))
    .filter((p) => p.ids !== undefined);

/** Restrict requests from the given call index on, as their id lists. */
const idsSince = (from: number) => restrictCalls().slice(from).map((p) => p.ids as string[]);

const viewerRequired = () => Object.assign(new ApiStatusError(400, "API error: 400"), { detail: "viewer_required" });

function declare(slots: { recommended?: Entry[]; shelves?: Entry[] }) {
  catalogue.slots = {
    ...(slots.recommended ? { "video-discover-recommended": slots.recommended } : {}),
    ...(slots.shelves ? { "video-discover-shelves": slots.shelves } : {}),
  };
}

const trips = () => ({
  id: "sf-trips",
  drive,
  name: "Trips",
  query: "tag:Trip",
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
});

async function visit(onDrive = drive) {
  const view = render(<VideoApp drive={onDrive} />);
  await flush();
  return view;
}

/** One visit where Recommended's provider answers `ids` at once, then the app is left. */
async function seedRecommended(ids: string[]) {
  intel.pickup = restricting(ids);
  const view = await visit();
  expect(layout()).toContain("Recommended");
  view.unmount();
}

beforeEach(() => {
  useFakeClock();
  drive = freshDrive();
  nickname = "alice";
  localStorage.clear();
  sessionStorage.clear();
  unmatched = new Set();
  catalogue.loading = false;
  catalogue.catalogueDrive = drive;
  catalogue.slots = {};
  for (const k of Object.keys(intel)) delete intel[k];
  for (const k of Object.keys(media)) delete media[k];
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async () => filesAnswer([item("n1", "Newest one", drive)]));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-077 the rebuild on the next visit", () => {
  it.runIf(addonsLinked)("SPEC-CORE-077 I5 I6 a revisit draws Recommended from one restrict of the stored ids, before its provider answers, and still asks the provider once", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r3", "r1", "r2"]);

    const from = restrictCalls().length;
    intel.pickup = silent();
    await visit();

    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
    expect(shelfCards("Recommended")).toEqual([title("r3"), title("r1"), title("r2")]);
    const rebuild = restrictCalls().slice(from);
    expect(rebuild).toHaveLength(1);
    expect(rebuild[0]).toMatchObject({ drive, by: "all", key: "all", type: ["video"], watch: "unwatched", ids: ["r3", "r1", "r2"] });
    expect(intel.pickup).toHaveBeenCalledTimes(1);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 the store lives in memory only", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r7"]);
    intel.pickup = silent();
    await visit();
    expect(shelfCards("Recommended")).toEqual([title("r7")]);

    const stored = [localStorage, sessionStorage].flatMap((s) =>
      Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`),
    );
    expect(stored.filter((entry) => entry.includes("r7"))).toEqual([]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 an addon shelf rebuilds without a watch condition, for another profile and for none", async () => {
    declare({ shelves: [SHELF_A] });
    media["shelf-a"] = restricting(["a2", "a1"]);
    (await visit()).unmount();

    for (const who of ["bob", null]) {
      nickname = who;
      const from = restrictCalls().length;
      media["shelf-a"] = silent();
      const view = await visit();

      expect(shelfCards("Shelf Alpha"), `profile ${who}`).toEqual([title("a2"), title("a1")]);
      const rebuild = restrictCalls().slice(from);
      expect(rebuild).toHaveLength(1);
      expect(rebuild[0].watch).toBeUndefined();
      expect(rebuild[0].ids).toEqual(["a2", "a1"]);
      view.unmount();
    }
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 the stored ids are the built shelf: restricted, without duplicates, in order, at most 12", async () => {
    const asked = Array.from({ length: 20 }, (_, i) => `r${i}`);
    unmatched = new Set(["r2"]);
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      const accepted = await restrict(asked);
      return [accepted[0], "zz", accepted[0], ...accepted];
    });
    declare({ recommended: [PICKUP] });
    (await visit()).unmount();
    unmatched = new Set();

    const from = restrictCalls().length;
    intel.pickup = silent();
    await visit();

    const expected = asked.filter((id) => id !== "r2").slice(0, 12);
    expect(idsSince(from)).toEqual([expected]);
    expect(shelfCards("Recommended")).toEqual(expected.map(title));
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 a rebuild draws only what its restrict returns now, in the stored order", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r3", "r1", "r2"]);

    unmatched = new Set(["r1"]);
    intel.pickup = silent();
    await visit();

    expect(shelfCards("Recommended")).toEqual([title("r3"), title("r2")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I5 a rebuild with no item does not settle: the provider's answer within the deadline is drawn", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1", "r2"]);

    unmatched = new Set(["r1", "r2"]);
    const answer = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await answer.promise;
      return restrict(["p1"]);
    });
    const from = restrictCalls().length;
    await visit();

    expect(idsSince(from)).toEqual([["r1", "r2"]]);
    expect(layout()).toEqual(["Continue", SKELETON]);

    await act(async () => answer.resolve([]));
    await flush();
    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
    expect(shelfCards("Recommended")).toEqual([title("p1")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I4 a rebuild with no item and a provider that never answers is dropped at the deadline", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1"]);

    unmatched = new Set(["r1"]);
    intel.pickup = silent();
    const from = restrictCalls().length;
    await visit();
    expect(idsSince(from)).toEqual([["r1"]]);
    expect(layout()).toEqual(["Continue", SKELETON]);

    await advance(801);
    expect(layout()).toEqual(["Continue", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 an empty stored list sends no rebuild request and waits for the provider", async () => {
    declare({ recommended: [PICKUP], shelves: [SHELF_A] });
    intel.pickup = restricting(["r1"]);
    media["shelf-a"] = vi.fn<Provider>(async () => []);
    (await visit()).unmount();

    const from = restrictCalls().length;
    intel.pickup = silent();
    const answer = deferred<string[]>();
    media["shelf-a"] = vi.fn<Provider>(async ({ restrict }) => {
      await answer.promise;
      return restrict(["a1"]);
    });
    await visit();

    expect(idsSince(from)).toEqual([["r1"]]);
    expect(layout()).toEqual(["Continue", "Recommended", SKELETON]);

    await act(async () => answer.resolve([]));
    await flush();
    expect(layout()).toEqual(["Continue", "Recommended", "Shelf Alpha", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 a failed rebuild request waits for the provider within the deadline", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1"]);

    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (p.ids !== undefined && (p.ids as string[]).includes("r1")) throw new Error("rebuild failed");
      return defaultShelves(d, p);
    });
    const answer = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await answer.promise;
      return restrict(["p1"]);
    });
    const from = restrictCalls().length;
    await visit();

    expect(idsSince(from)).toEqual([["r1"]]);
    expect(layout()).toEqual(["Continue", SKELETON]);

    await act(async () => answer.resolve([]));
    await flush();
    expect(shelfCards("Recommended")).toEqual([title("p1")]);
  });
});

describe("SPEC-CORE-077 which answer is drawn", () => {
  it.runIf(addonsLinked)("SPEC-CORE-077 I5 after a rebuild is drawn the provider's answer is not swapped in, but it replaces the stored ids", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1"]);

    const answer = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await answer.promise;
      return restrict(["p9", "p8"]);
    });
    const view = await visit();
    expect(shelfCards("Recommended")).toEqual([title("r1")]);

    await act(async () => answer.resolve([]));
    await flush();
    expect(shelfCards("Recommended")).toEqual([title("r1")]);
    expect(screen.queryByText(title("p9"))).not.toBeInTheDocument();
    view.unmount();

    const from = restrictCalls().length;
    intel.pickup = silent();
    await visit();
    expect(idsSince(from)).toEqual([["p9", "p8"]]);
    expect(shelfCards("Recommended")).toEqual([title("p9"), title("p8")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I4 a rebuild that arrives after the deadline is not drawn", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1"]);

    const rebuild = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) =>
      p.ids !== undefined && (p.ids as string[]).includes("r1") ? rebuild.promise : defaultShelves(d, p),
    );
    intel.pickup = silent();
    const from = restrictCalls().length;
    await visit();
    expect(idsSince(from)).toEqual([["r1"]]);
    expect(layout()).toEqual(["Continue", SKELETON]);

    await advance(801);
    expect(layout()).toEqual(["Continue", "New"]);
    await act(async () => rebuild.resolve(restrictAnswer({ ids: ["r1"] }, new Set())));
    await flush();
    expect(layout()).toEqual(["Continue", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I5 a provider that answers before the rebuild is drawn, and the late rebuild is not", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1"]);

    const rebuild = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) =>
      p.ids !== undefined && (p.ids as string[]).includes("r1") ? rebuild.promise : defaultShelves(d, p),
    );
    intel.pickup = restricting(["p1"]);
    const from = restrictCalls().length;
    await visit();

    expect(idsSince(from)).toContainEqual(["r1"]);
    expect(shelfCards("Recommended")).toEqual([title("p1")]);

    await act(async () => rebuild.resolve(restrictAnswer({ ids: ["r1"] }, new Set())));
    await flush();
    expect(shelfCards("Recommended")).toEqual([title("p1")]);
  });
});

describe("SPEC-CORE-077 what is written", () => {
  it.runIf(addonsLinked)("SPEC-CORE-077 I7 an answer after the deadline is not drawn but is stored and rebuilt on the next visit", async () => {
    declare({ recommended: [PICKUP] });
    const answer = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await answer.promise;
      return restrict(["r5"]);
    });
    const view = await visit();
    await advance(801);
    expect(layout()).toEqual(["Continue", "New"]);

    await act(async () => answer.resolve([]));
    await flush();
    expect(layout()).toEqual(["Continue", "New"]);
    expect(intel.pickup).toHaveBeenCalledTimes(1);
    view.unmount();

    intel.pickup = silent();
    await visit();
    expect(shelfCards("Recommended")).toEqual([title("r5")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I7 an answer that arrives after the app unmounted is stored", async () => {
    declare({ recommended: [PICKUP] });
    const answer = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await answer.promise;
      return restrict(["r6"]);
    });
    const view = await visit();
    view.unmount();
    await act(async () => answer.resolve([]));
    await flush();

    intel.pickup = silent();
    await visit();
    expect(shelfCards("Recommended")).toEqual([title("r6")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I7 an answer that arrives after the drive changed is stored under the drive it was asked for", async () => {
    declare({ recommended: [PICKUP] });
    const first = drive;
    const second = freshDrive();
    const answer = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ drive: asked, restrict }) => {
      if (asked !== first) return never<string[]>();
      await answer.promise;
      return restrict(["r8"]);
    });
    const view = await visit(first);

    catalogue.catalogueDrive = second;
    view.rerender(<VideoApp drive={second} />);
    await flush();
    await act(async () => answer.resolve([]));
    await flush();
    expect(screen.queryByText(title("r8"))).not.toBeInTheDocument();
    const onSecond = restrictCalls().filter((p) => p.drive === second);
    expect(onSecond.some((p) => (p.ids as string[]).includes("r8"))).toBe(false);
    view.unmount();

    catalogue.catalogueDrive = first;
    intel.pickup = silent();
    await visit(first);
    expect(shelfCards("Recommended")).toEqual([title("r8")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I7 a rejected provider and an absent entry leave the stored ids in place", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1"]);

    intel.pickup = vi.fn<Provider>(async () => Promise.reject(new Error("boom")));
    (await visit()).unmount();

    delete intel.pickup;
    const absent = await visit();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(layout()).toEqual(["Continue", "New"]);
    absent.unmount();

    const from = restrictCalls().length;
    intel.pickup = silent();
    await visit();
    expect(idsSince(from)).toEqual([["r1"]]);
    expect(shelfCards("Recommended")).toEqual([title("r1")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I6 I7 a catalogue that loads after the deadline still asks, and the answer is rebuilt next visit", async () => {
    catalogue.loading = true;
    declare({ recommended: [PICKUP] });
    intel.pickup = restricting(["r4"]);
    const view = await visit();
    await advance(801);
    expect(intel.pickup).not.toHaveBeenCalled();

    catalogue.loading = false;
    view.rerender(<VideoApp drive={drive} />);
    await flush();
    expect(intel.pickup).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(title("r4"))).not.toBeInTheDocument();
    view.unmount();

    intel.pickup = silent();
    await visit();
    expect(shelfCards("Recommended")).toEqual([title("r4")]);
  });
});

describe("SPEC-CORE-077 I7 the key", () => {
  type Variant = {
    name: string;
    entries: { recommended?: Entry[]; shelves?: Entry[] };
    provider: "recommended" | "shelf";
    change: () => void;
    rebuilds: boolean;
  };
  const LATER: Entry = { id: "later", label: "Later", priority: 20, addonName: "media_import" };

  const variants: Variant[] = [
    { name: "a different target", entries: { recommended: [PICKUP] }, provider: "recommended", change: () => writeAppPrefs(drive, { target: "sf-trips" }), rebuilds: false },
    { name: "the next local day", entries: { recommended: [PICKUP] }, provider: "recommended", change: () => vi.setSystemTime(new Date(2026, 10, 11, 0, 1)), rebuilds: false },
    { name: "another nickname", entries: { recommended: [PICKUP] }, provider: "recommended", change: () => (nickname = "bob"), rebuilds: false },
    { name: "a Recommended entry list with another entry", entries: { recommended: [PICKUP] }, provider: "recommended", change: () => declare({ recommended: [PICKUP, LATER] }), rebuilds: false },
    { name: "a Recommended entry with another priority", entries: { recommended: [PICKUP] }, provider: "recommended", change: () => declare({ recommended: [{ ...PICKUP, priority: 11 }] }), rebuilds: false },
    { name: "a relabelled Recommended entry", entries: { recommended: [PICKUP] }, provider: "recommended", change: () => declare({ recommended: [{ ...PICKUP, label: "Renamed" }] }), rebuilds: true },
    { name: "an addon entry with another id", entries: { shelves: [SHELF_A] }, provider: "shelf", change: () => declare({ shelves: [{ ...SHELF_A, id: "shelf-a2" }] }), rebuilds: false },
    { name: "an addon entry with another label and priority", entries: { shelves: [SHELF_A] }, provider: "shelf", change: () => declare({ shelves: [{ ...SHELF_A, label: "Renamed", priority: 30 }] }), rebuilds: true },
  ];

  it.runIf(addonsLinked).each(variants)("SPEC-CORE-077 I7 a stored entry is rebuilt on the same key, and $name rebuilds: $rebuilds", async (v) => {
    vi.setSystemTime(new Date(2026, 10, 10, 23, 58));
    getSmartFolders.mockResolvedValue([trips()]);
    declare(v.entries);
    const setProvider = (p: Provider) => {
      if (v.provider === "recommended") intel.pickup = p;
      else {
        media["shelf-a"] = p;
        media["shelf-a2"] = p;
      }
    };
    setProvider(restricting(["k1"]));
    (await visit()).unmount();

    setProvider(silent());
    let from = restrictCalls().length;
    (await visit()).unmount();
    expect(idsSince(from), "same key").toEqual([["k1"]]);

    v.change();
    from = restrictCalls().length;
    await visit();
    const rebuilt = idsSince(from).some((ids) => ids.includes("k1"));
    expect(rebuilt, v.name).toBe(v.rebuilds);
    expect(screen.queryByText(title("k1")) !== null, v.name).toBe(v.rebuilds);
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I7 a stored entry is never read on another drive", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["k1"]);

    const other = freshDrive();
    catalogue.catalogueDrive = other;
    intel.pickup = silent();
    const from = restrictCalls().length;
    await visit(other);

    expect(idsSince(from)).toEqual([]);
    expect(layout()).toEqual(["Continue", SKELETON]);
  });
});

describe("SPEC-CORE-077 I8 viewer_required from a provider or a rebuild", () => {
  it.runIf(addonsLinked)("SPEC-CORE-077 I8 a rebuild's viewer_required while its position is unsettled rejects the viewer", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1"]);

    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (p.ids !== undefined && (p.ids as string[]).includes("r1")) throw viewerRequired();
      return defaultShelves(d, p);
    });
    intel.pickup = silent();
    await visit();

    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
    expect(screen.queryByText("Resume me")).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I8 a rebuild's viewer_required after the provider settled the position does nothing", async () => {
    declare({ recommended: [PICKUP] });
    await seedRecommended(["r1"]);

    const rebuild = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) =>
      p.ids !== undefined && (p.ids as string[]).includes("r1") ? rebuild.promise : defaultShelves(d, p),
    );
    intel.pickup = restricting(["p1"]);
    const from = restrictCalls().length;
    await visit();
    expect(idsSince(from)).toContainEqual(["r1"]);
    expect(shelfCards("Recommended")).toEqual([title("p1")]);

    await act(async () => rebuild.reject(viewerRequired()));
    await flush();

    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
    expect(screen.getByText("Resume me")).toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-077 I8 a provider's viewer_required after its position was dropped does nothing", async () => {
    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (p.ids !== undefined) throw viewerRequired();
      return defaultShelves(d, p);
    });
    const gate = deferred<void>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await gate.promise;
      return restrict(["r1"]);
    });
    declare({ recommended: [PICKUP] });
    await visit();
    await advance(801);
    expect(layout()).toEqual(["Continue", "New"]);

    await act(async () => gate.resolve());
    await flush();

    expect(layout()).toEqual(["Continue", "New"]);
    expect(screen.getByText("Resume me")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-077 the rebuild's target", () => {
  it.runIf(addonsLinked)("SPEC-CORE-077 I5 a rebuild restricts under the visit's target", async () => {
    getSmartFolders.mockResolvedValue([trips()]);
    writeAppPrefs(drive, { target: "sf-trips" });
    declare({ shelves: [SHELF_A] });
    media["shelf-a"] = restricting(["a1"]);
    (await visit()).unmount();

    media["shelf-a"] = silent();
    const from = restrictCalls().length;
    await visit();

    const rebuild = restrictCalls().slice(from);
    expect(rebuild).toHaveLength(1);
    expect([rebuild[0].tag].flat()).toContain("Trip");
    expect(screen.getByText(title("a1"))).toBeInTheDocument();
  });
});
