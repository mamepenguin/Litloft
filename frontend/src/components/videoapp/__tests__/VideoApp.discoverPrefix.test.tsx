/**
 * SPEC-CORE-076: Discover draws its shelves from the top down, holds one untitled skeleton
 * below the drawn ones, and drops a provider shelf that has not settled by the deadline.
 *
 * The clock is fake so the deadline is exact; `setImmediate` stays real so module loads and
 * mocked requests finish inside `flush()`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { ApiStatusError } from "@/lib/api";
import { VideoApp } from "../VideoApp";
import { DiscoverFace } from "../DiscoverFace";
import {
  PICKUP,
  SHELF_A,
  SHELF_B,
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

type FaceRender = { titles: string[]; pending: unknown; empty: unknown };

const { catalogue, intel, media, faceRenders } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intel: {} as Record<string, unknown>,
  media: {} as Record<string, unknown>,
  faceRenders: [] as FaceRender[],
}));

vi.mock("../DiscoverFace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../DiscoverFace")>();
  return {
    DiscoverFace: (props: Parameters<typeof actual.DiscoverFace>[0]) => {
      const seen = props as unknown as { shelves?: { title: string }[]; pending?: unknown; empty?: unknown };
      faceRenders.push({
        titles: (seen.shelves ?? []).map((s) => s.title),
        pending: seen.pending,
        empty: seen.empty,
      });
      return actual.DiscoverFace(props);
    },
  };
});

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
const isNew = (p: Params) => p.sort === "created_at";

function defaultShelves(_d: string, p: Params) {
  if (p.ids !== undefined) return restrictAnswer(p, unmatched);
  if (isContinue(p)) return continueAnswer([item("c1", "Resume me", drive)]);
  return { by: p.by, total_shelves: 0, base: "", shelves: [] };
}

function defaultFiles(_d: string, _p: Params) {
  return filesAnswer([item("n1", "Newest one", drive)]);
}

const continueCalls = () => getShelves.mock.calls.filter(([, p]) => isContinue(p as Params)).length;
const newCalls = () => getDriveFiles.mock.calls.filter(([, p]) => isNew(p as Params)).length;

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

async function visit() {
  const view = render(<VideoApp drive={drive} />);
  await flush();
  return view;
}

async function chooseTarget(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /Target/ }));
  await flush();
  fireEvent.click(screen.getByText(name));
  await flush();
}

beforeEach(() => {
  useFakeClock();
  drive = freshDrive();
  nickname = "alice";
  localStorage.clear();
  unmatched = new Set();
  faceRenders.length = 0;
  catalogue.loading = false;
  catalogue.catalogueDrive = drive;
  catalogue.slots = {};
  for (const k of Object.keys(intel)) delete intel[k];
  for (const k of Object.keys(media)) delete media[k];
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async (d, p) => defaultFiles(d, p));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-076 the drawn prefix", () => {
  it.runIf(addonsLinked)("SPEC-CORE-076 I2 I3 while Continue loads, only one untitled skeleton is drawn, even below settled shelves", async () => {
    const held = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => (isContinue(p) ? held.promise : defaultShelves(d, p)));
    intel.pickup = restricting(["r1"]);
    media["shelf-a"] = restricting(["a1"]);
    declare({ recommended: [PICKUP], shelves: [SHELF_A] });
    await visit();

    expect(intel.pickup).toHaveBeenCalledTimes(1);
    expect(layout()).toEqual([SKELETON]);
    expect(screen.queryByText("Newest one")).not.toBeInTheDocument();
    expect(screen.queryByText(title("r1"))).not.toBeInTheDocument();

    await act(async () => held.resolve(continueAnswer([item("c1", "Resume me", drive)])));
    await flush();

    expect(layout()).toEqual(["Continue", "Recommended", "Shelf Alpha", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 I2 I3 New waits under one skeleton while Recommended is pending, then both appear", async () => {
    const pending = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["r1"]);
      return pending.promise;
    });
    declare({ recommended: [PICKUP] });
    await visit();

    expect(intel.pickup).toHaveBeenCalledTimes(1);
    expect(layout()).toEqual(["Continue", SKELETON]);
    expect(screen.queryByText("Newest one")).not.toBeInTheDocument();

    await act(async () => pending.resolve(["r1"]));
    await flush();

    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
    expect(shelfCards("Recommended")).toEqual([title("r1")]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 I2 an addon shelf below a pending Recommended is not drawn until Recommended settles", async () => {
    const pending = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(() => pending.promise);
    media["shelf-a"] = restricting(["a1"]);
    declare({ recommended: [PICKUP], shelves: [SHELF_A] });
    await visit();

    expect(media["shelf-a"]).toHaveBeenCalledTimes(1);
    expect(layout()).toEqual(["Continue", SKELETON]);
    expect(screen.queryByText(title("a1"))).not.toBeInTheDocument();

    await act(async () => pending.reject(new Error("boom")));
    await flush();

    expect(layout()).toEqual(["Continue", "Shelf Alpha", "New"]);
  });

  it.runIf(addonsLinked).each<[string, () => Provider | undefined, string | null]>([
    ["rejects", () => vi.fn<Provider>(async () => Promise.reject(new Error("boom"))), "alice"],
    ["answers no id", () => vi.fn<Provider>(async () => []), "alice"],
    ["answers only ids its restrict drops", () => vi.fn<Provider>(async () => ["zz"]), "alice"],
    ["has no function", () => undefined, "alice"],
    ["does not apply without a profile", () => restricting(["r1"]), null],
  ])(
    "SPEC-CORE-076 a Recommended that %s settles at once and does not hold back the shelves below it",
    async (_case, provider, who) => {
      nickname = who;
      const p = provider();
      if (p) intel.pickup = p;
      media["shelf-a"] = restricting(["a1"]);
      media["shelf-b"] = vi.fn<Provider>(() => never<string[]>());
      declare({ recommended: [PICKUP], shelves: [SHELF_A, SHELF_B] });
      await visit();

      expect(media["shelf-b"]).toHaveBeenCalledTimes(1);
      const continueRow = who ? ["Continue"] : [];
      expect(layout()).toEqual([...continueRow, "Shelf Alpha", SKELETON]);
      expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    },
  );

  it.runIf(addonsLinked)("SPEC-CORE-076 I1 I2 across every render the drawn shelves only grow, in order, until all have settled", async () => {
    const rec = deferred<string[]>();
    const b = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["r1"]);
      return rec.promise;
    });
    media["shelf-a"] = restricting(["a1"]);
    media["shelf-b"] = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["b1"]);
      return b.promise;
    });
    declare({ recommended: [PICKUP], shelves: [SHELF_A, SHELF_B] });
    await visit();
    await act(async () => b.resolve(["b1"]));
    await flush();
    await act(async () => rec.resolve(["r1"]));
    await flush();

    const full = ["Continue", "Recommended", "Shelf Alpha", "Shelf Beta", "New"];
    expect(faceRenders.at(-1)?.titles).toEqual(full);
    expect(faceRenders.at(-1)?.pending).toBe(false);
    for (let i = 1; i < faceRenders.length; i++) {
      const before = faceRenders[i - 1].titles;
      const after = faceRenders[i].titles;
      expect(after.slice(0, before.length), `render ${i}`).toEqual(before);
    }
    const firstDone = faceRenders.findIndex((r) => r.pending === false);
    expect(faceRenders.slice(firstDone).every((r) => r.pending === false)).toBe(true);
    expect(faceRenders.slice(0, firstDone).every((r) => r.pending === true)).toBe(true);
    expect(layout()).toEqual(full);
  });
});

describe("SPEC-CORE-076 the deadline", () => {
  it.runIf(addonsLinked)("SPEC-CORE-076 I4 a Recommended pending at 799 ms is still awaited and is dropped at 800 ms, whatever arrives later", async () => {
    const pending = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["r1"]);
      return pending.promise;
    });
    declare({ recommended: [PICKUP] });
    await visit();

    await advance(799);
    expect(layout()).toEqual(["Continue", SKELETON]);

    await advance(2);
    expect(layout()).toEqual(["Continue", "New"]);

    await act(async () => pending.resolve(["r1"]));
    await flush();
    expect(layout()).toEqual(["Continue", "New"]);
    expect(screen.queryByText(title("r1"))).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 I4 a provider that answers before the deadline is drawn", async () => {
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await new Promise((r) => setTimeout(r, 600));
      return restrict(["r1"]);
    });
    declare({ recommended: [PICKUP] });
    await visit();

    expect(layout()).toEqual(["Continue", SKELETON]);
    await advance(600);

    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 I4 a shelf that settled before the deadline is drawn when the one above it is dropped", async () => {
    intel.pickup = vi.fn<Provider>(() => never<string[]>());
    media["shelf-a"] = restricting(["a1"]);
    declare({ recommended: [PICKUP], shelves: [SHELF_A] });
    await visit();

    expect(layout()).toEqual(["Continue", SKELETON]);
    await advance(801);

    expect(layout()).toEqual(["Continue", "Shelf Alpha", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 I4 I6 a catalogue that loads after the deadline draws no provider shelf, and each provider is still asked once", async () => {
    catalogue.loading = true;
    intel.pickup = restricting(["r1"]);
    media["shelf-a"] = restricting(["a1"]);
    declare({ recommended: [PICKUP], shelves: [SHELF_A] });
    const view = await visit();

    expect(layout()).toEqual(["Continue", SKELETON]);
    await advance(801);
    expect(layout()).toEqual(["Continue", "New"]);

    catalogue.loading = false;
    view.rerender(<VideoApp drive={drive} />);
    await flush();

    expect(intel.pickup).toHaveBeenCalledTimes(1);
    expect(media["shelf-a"]).toHaveBeenCalledTimes(1);
    expect(layout()).toEqual(["Continue", "New"]);
    expect(screen.queryByText(title("r1"))).not.toBeInTheDocument();
    expect(screen.queryByText(title("a1"))).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("SPEC-CORE-067 I6 with no entry declared, New waits for the catalogue of this drive, not for the deadline", async () => {
    catalogue.loading = true;
    declare({});
    const view = await visit();

    expect(layout()).toEqual(["Continue", SKELETON]);

    catalogue.loading = false;
    view.rerender(<VideoApp drive={drive} />);
    await flush();

    expect(layout()).toEqual(["Continue", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-067 I6 with a catalogue that never loads, New is drawn at the deadline", async () => {
    catalogue.loading = true;
    declare({});
    await visit();

    expect(layout()).toEqual(["Continue", SKELETON]);
    await advance(801);

    expect(layout()).toEqual(["Continue", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 I9 Continue has no deadline: a slow Continue holds the skeleton past it, then the shelves settled meanwhile are drawn", async () => {
    const held = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => (isContinue(p) ? held.promise : defaultShelves(d, p)));
    intel.pickup = restricting(["r1"]);
    declare({ recommended: [PICKUP] });
    await visit();

    await advance(2000);
    expect(layout()).toEqual([SKELETON]);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();

    await act(async () => held.resolve(continueAnswer([item("c1", "Resume me", drive)])));
    await flush();

    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
  });
});

describe("SPEC-CORE-076 Retry", () => {
  it.runIf(addonsLinked)("SPEC-CORE-076 I1 Retry on a failed Continue keeps the drawn prefix and does not hold back the shelves below", async () => {
    let failContinue = true;
    const retried = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (isContinue(p)) {
        if (failContinue) throw new Error("boom");
        return retried.promise;
      }
      return defaultShelves(d, p);
    });
    const pending = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["r1"]);
      return pending.promise;
    });
    declare({ recommended: [PICKUP] });
    await visit();

    expect(layout()).toEqual(["Continue", SKELETON]);
    const retry = screen.getByRole("button", { name: /retry/i });

    failContinue = false;
    fireEvent.click(retry);
    await flush();
    expect(layout()).toEqual(["Continue (loading)", SKELETON]);

    await act(async () => pending.resolve(["r1"]));
    await flush();
    expect(layout()).toEqual(["Continue (loading)", "Recommended", "New"]);

    await act(async () => retried.resolve(continueAnswer([item("c1", "Resume me", drive)])));
    await flush();
    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
    expect(continueCalls()).toBe(2);
  });
});

describe("SPEC-CORE-076 the visit", () => {
  it.runIf(addonsLinked)("SPEC-CORE-076 a target change removes every shelf and draws one untitled skeleton, then draws from the top", async () => {
    getSmartFolders.mockResolvedValue([trips()]);
    const tripContinue = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) =>
      isContinue(p) && p.tag !== undefined ? tripContinue.promise : defaultShelves(d, p),
    );
    intel.pickup = restricting(["r1"]);
    declare({ recommended: [PICKUP] });
    await visit();
    expect(layout()).toEqual(["Continue", "Recommended", "New"]);

    await chooseTarget("Trips");

    expect(layout()).toEqual([SKELETON]);
    expect(screen.queryByText("Resume me")).not.toBeInTheDocument();
    expect(screen.queryByText("Newest one")).not.toBeInTheDocument();

    await act(async () => tripContinue.resolve(continueAnswer([item("c2", "Resume me", drive)])));
    await flush();
    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 a profile that appears after mount restarts the visit from one skeleton", async () => {
    nickname = null;
    const held = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => (isContinue(p) ? held.promise : defaultShelves(d, p)));
    declare({});
    const view = await visit();
    expect(layout()).toEqual(["New"]);

    nickname = "alice";
    view.rerender(<VideoApp drive={drive} />);
    await flush();

    expect(layout()).toEqual([SKELETON]);
    expect(screen.queryByText("Newest one")).not.toBeInTheDocument();

    await act(async () => held.resolve(continueAnswer([item("c1", "Resume me", drive)])));
    await flush();
    expect(layout()).toEqual(["Continue", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 a target that was empty and is no longer restarts the visit from one skeleton", async () => {
    getSmartFolders.mockResolvedValue([{ ...trips(), id: "sf-pics", name: "Pictures", query: "", file_type: "image" }]);
    declare({});
    await visit();
    expect(layout()).toEqual(["Continue", "New"]);

    await chooseTarget("Pictures");
    expect(screen.getByText("No files")).toBeInTheDocument();

    const held = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => (isContinue(p) ? held.promise : defaultShelves(d, p)));
    await chooseTarget("All videos");

    expect(layout()).toEqual([SKELETON]);
    await act(async () => held.resolve(continueAnswer([item("c1", "Resume me", drive)])));
    await flush();
    expect(layout()).toEqual(["Continue", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 another nickname restarts the visit from one skeleton", async () => {
    declare({});
    const view = await visit();
    expect(layout()).toEqual(["Continue", "New"]);

    const held = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => (isContinue(p) ? held.promise : defaultShelves(d, p)));
    nickname = "bob";
    view.rerender(<VideoApp drive={drive} />);
    await flush();

    expect(layout()).toEqual([SKELETON]);
    await act(async () => held.resolve(continueAnswer([item("c1", "Resume me", drive)])));
    await flush();
    expect(layout()).toEqual(["Continue", "New"]);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 re-renders and an entry change after the catalogue is ready neither restart the visit nor ask again", async () => {
    const rec = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["r1"]);
      return rec.promise;
    });
    media["shelf-a"] = restricting(["a1"]);
    declare({ recommended: [PICKUP], shelves: [SHELF_A] });
    const view = await visit();
    expect(layout()).toEqual(["Continue", SKELETON]);

    for (let i = 0; i < 3; i++) view.rerender(<VideoApp drive={drive} />);
    declare({
      recommended: [PICKUP, { id: "later", label: "Later", priority: 20, addonName: "media_import" }],
      shelves: [{ ...SHELF_A, href: "addons/media_import/elsewhere" }, SHELF_B],
    });
    media["shelf-b"] = restricting(["b1"]);
    view.rerender(<VideoApp drive={drive} />);
    await flush();

    expect(layout()).toEqual(["Continue", SKELETON]);
    await act(async () => rec.resolve(["r1"]));
    await flush();

    expect(layout()).toEqual(["Continue", "Recommended", "Shelf Alpha", "New"]);
    expect(intel.pickup).toHaveBeenCalledTimes(1);
    expect(media["shelf-a"]).toHaveBeenCalledTimes(1);
    expect(media["shelf-b"]).not.toHaveBeenCalled();
    expect(continueCalls()).toBe(1);
    expect(newCalls()).toBe(1);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 switching to Library and back keeps the visit: what settled meanwhile is drawn and nothing is asked again", async () => {
    const rec = deferred<string[]>();
    intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
      await restrict(["r1"]);
      return rec.promise;
    });
    declare({ recommended: [PICKUP] });
    await visit();
    expect(layout()).toEqual(["Continue", SKELETON]);

    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    await flush();
    await act(async () => rec.resolve(["r1"]));
    await flush();
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await flush();

    expect(layout()).toEqual(["Continue", "Recommended", "New"]);
    expect(intel.pickup).toHaveBeenCalledTimes(1);
    expect(continueCalls()).toBe(1);
    expect(newCalls()).toBe(1);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 I4 the deadline keeps running while Library is shown", async () => {
    intel.pickup = vi.fn<Provider>(() => never<string[]>());
    declare({ recommended: [PICKUP] });
    await visit();
    expect(layout()).toEqual(["Continue", SKELETON]);

    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    await flush();
    await advance(801);
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await flush();

    expect(layout()).toEqual(["Continue", "New"]);
    expect(intel.pickup).toHaveBeenCalledTimes(1);
  });

  it.runIf(addonsLinked)("SPEC-CORE-076 a viewer_required answer to Continue restarts the visit without Continue and Recommended", async () => {
    const rejected = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => (isContinue(p) ? rejected.promise : defaultShelves(d, p)));
    intel.pickup = restricting(["r1"]);
    media["shelf-a"] = vi.fn<Provider>(() => never<string[]>());
    declare({ recommended: [PICKUP], shelves: [SHELF_A] });
    await visit();
    expect(layout()).toEqual([SKELETON]);

    await act(async () =>
      rejected.reject(Object.assign(new ApiStatusError(400, "API error: 400"), { detail: "viewer_required" })),
    );
    await flush();

    expect(layout()).toEqual([SKELETON]);
    await advance(801);
    expect(layout()).toEqual(["New"]);
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-076 the empty state", () => {
  it.runIf(addonsLinked)("SPEC-CORE-076 I3 I9 the empty state replaces the skeleton once Continue and New settle empty, with a provider still pending", async () => {
    const held = deferred<unknown>();
    getShelves.mockImplementation(async (d: string, p: Params) => (isContinue(p) ? held.promise : defaultShelves(d, p)));
    getDriveFiles.mockImplementation(async () => filesAnswer([]));
    media["shelf-a"] = vi.fn<Provider>(() => never<string[]>());
    declare({ shelves: [SHELF_A] });
    await visit();
    expect(layout()).toEqual([SKELETON]);

    await act(async () => held.resolve(continueAnswer([])));
    await flush();

    expect(screen.getByText("No files")).toBeInTheDocument();
    expect(layout()).toEqual([]);
  });
});

describe("SPEC-CORE-076 DiscoverFace draws its props", () => {
  const loaded = (id: string, name: string) => ({
    id,
    title: name,
    state: { status: "loaded" as const, items: [item(`${id}-1`, `Vid ${id}`)] },
    retry: () => {},
  });
  type FaceProps = Parameters<typeof DiscoverFace>[0];
  const face = (props: Record<string, unknown>) =>
    render(<DiscoverFace {...({ drive: "d", hasProfile: true, empty: false, ...props } as unknown as FaceProps)} />);

  it("SPEC-CORE-076 I3 draws the shelves in order, then exactly one untitled skeleton and nothing after it", () => {
    face({ shelves: [loaded("continue", "Continue"), loaded("recommended", "Recommended")], pending: true });

    expect(layout()).toEqual(["Continue", "Recommended", SKELETON]);
    expect(shelfCards("Recommended")).toEqual(["Vid recommended"]);
  });

  it("SPEC-CORE-076 I3 draws no skeleton once nothing is pending", () => {
    face({ shelves: [loaded("continue", "Continue"), loaded("new", "New")], pending: false });

    expect(layout()).toEqual(["Continue", "New"]);
  });

  it("SPEC-CORE-076 I3 with no shelf drawn yet, draws the skeleton alone", () => {
    face({ shelves: [], pending: true });

    expect(layout()).toEqual([SKELETON]);
  });

  it("SPEC-CORE-076 the empty state takes precedence over the skeleton", () => {
    face({ shelves: [], pending: true, empty: true });

    expect(screen.getByText("No files")).toBeInTheDocument();
    expect(layout()).toEqual([]);
    expect(document.querySelectorAll(".animate-pulse")).toHaveLength(0);
  });
});
