/**
 * SPEC-CORE-118 step 9: the Discover cache under a collection target, whose key
 * holds the target's params and so the collection's name.
 *
 * Every case uses a drive of its own, so the tab-lifetime store cannot carry an entry from
 * one case into another.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { writeAppPrefs } from "@/lib/appPrefs";
import { VideoApp } from "../VideoApp";
import {
  PICKUP,
  continueAnswer,
  filesAnswer,
  flush,
  freshDrive,
  item,
  restrictAnswer,
  restricting,
  silent,
  title,
  useFakeClock,
  type Entry,
  type Params,
} from "./discoverHarness";

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

const { catalogue, intel } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intel: {} as Record<string, unknown>,
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
vi.mock("@/addons/media_import/slots.ts", () => ({ slotComponents: {}, slotProviders: {} }));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/d/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
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
let collectionName = "Trip";

const restrictCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.ids !== undefined);

const idsSince = (from: number) => restrictCalls().slice(from).map((p) => p.ids as string[]);

function collectionsAnswer(): Response {
  return new Response(
    JSON.stringify([
      {
        id: "c1",
        name: collectionName,
        description: null,
        drive,
        item_count: 3,
        first_file_id: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function visit() {
  const view = render(<VideoApp drive={drive} />);
  await flush();
  return view;
}

beforeEach(() => {
  useFakeClock();
  drive = freshDrive();
  collectionName = "Trip";
  localStorage.clear();
  sessionStorage.clear();
  catalogue.loading = false;
  catalogue.catalogueDrive = drive;
  catalogue.slots = { "video-discover-recommended": [PICKUP] };
  for (const k of Object.keys(intel)) delete intel[k];
  getShelves.mockReset().mockImplementation(async (_d: string, p: Params) => {
    if (p.ids !== undefined) return restrictAnswer(p, new Set());
    if (p.by === "watch" && p.key === "continue") return continueAnswer([item("c1", "Resume me", drive)]);
    return { by: p.by, total_shelves: 0, base: "", shelves: [] };
  });
  getDriveFiles.mockReset().mockImplementation(async () => filesAnswer([item("n1", "Newest one", drive)]));
  getSmartFolders.mockReset().mockResolvedValue([]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input), "http://localhost");
      if (url.pathname === `/api/drives/${drive}/collections`) return collectionsAnswer();
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  writeAppPrefs(drive, { target: "collection:c1" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-118 step 9 the Discover cache under a collection target", () => {
  it.runIf(addonsLinked)("SPEC-CORE-118 step 9 a revisit under the same collection rebuilds from the stored ids, with the collection's name", async () => {
    intel.pickup = restricting(["k1"]);
    (await visit()).unmount();
    expect(restrictCalls()[0]).toMatchObject({ type: ["video"], collection: ["Trip"] });

    intel.pickup = silent();
    const from = restrictCalls().length;
    await visit();

    expect(idsSince(from)).toEqual([["k1"]]);
    expect(restrictCalls().slice(from)[0]).toMatchObject({ type: ["video"], collection: ["Trip"] });
    expect(screen.queryByText(title("k1"))).not.toBeNull();
  });

  it.runIf(addonsLinked)("SPEC-CORE-118 step 9 a collection renamed between visits is another key and rebuilds nothing", async () => {
    intel.pickup = restricting(["k1"]);
    (await visit()).unmount();

    collectionName = "Trip 2";
    intel.pickup = silent();
    const from = restrictCalls().length;
    await visit();

    expect(idsSince(from).some((ids) => ids.includes("k1"))).toBe(false);
    expect(screen.queryByText(title("k1"))).toBeNull();
    expect(
      getShelves.mock.calls.some(([, p]) => JSON.stringify((p as Params).collection) === JSON.stringify(["Trip 2"])),
    ).toBe(true);
  });
});
