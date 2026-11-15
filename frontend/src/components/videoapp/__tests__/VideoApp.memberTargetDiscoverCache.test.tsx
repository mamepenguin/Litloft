/**
 * SPEC-CORE-117 step 6, I8: a member target never reads or writes the Discover
 * cache, and its entries cannot be reached by another target whose listing
 * parameters are byte-equal (the default "all videos" target).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import { fileIdsOf, installWireFetch, json, pagedListing, type WireCall } from "@/__tests__/helpers/wireFetch";
import { discoverCacheKey } from "../discoverCache";
import { VideoApp } from "../VideoApp";

const DRIVE = "main";

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

const cacheAccess = vi.hoisted(() => ({
  keys: [] as string[],
  reads: [] as string[],
  writes: [] as string[],
}));
vi.mock("../discoverCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../discoverCache")>();
  return {
    ...actual,
    discoverCacheKey: (key: Parameters<typeof actual.discoverCacheKey>[0]) => {
      const built = actual.discoverCacheKey(key);
      cacheAccess.keys.push(built);
      return built;
    },
    readCachedItems: (key: string) => {
      cacheAccess.reads.push(key);
      return actual.readCachedItems(key);
    },
    writeCachedItems: (key: string, items: readonly { id: string; byline?: string }[]) => {
      cacheAccess.writes.push(key);
      actual.writeCachedItems(key, items);
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

type Entry = { id: string; label: string; priority: number; addonName: string; href?: string };
type Provider = (args: {
  drive: string;
  limit: number;
  restrict: (ids: string[]) => Promise<string[]>;
}) => Promise<string[]>;

const { catalogue, addonProviders } = vi.hoisted(() => ({
  catalogue: { slots: {} as Record<string, Entry[]> },
  addonProviders: {} as Record<string, unknown>,
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => {
    const slots = Object.fromEntries(
      Object.entries(catalogue.slots).map(([slot, entries]) => [slot, entries.map((entry) => ({ ...entry }))]),
    );
    return {
      addons: {},
      catalogueDrive: "main",
      slots,
      loading: false,
      getSlotEntries: (id: string) => slots[id] ?? [],
      hasSlot: (id: string) => (slots[id] ?? []).length > 0,
    };
  },
  useAddonStatus: () => ({ features: {} }),
}));

vi.mock("@/addons/intelligence/slots.ts", () => ({
  slotComponents: {},
  slotProviders: addonProviders,
}));
vi.mock("@/addons/media_import/slots.ts", () => ({ slotComponents: {}, slotProviders: {} }));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

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

const MEMBERS = [item("m1", "Member one"), item("m2", "Member two")];
const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };
let provider: ReturnType<typeof vi.fn<Provider>>;

const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isEvaluation = (c: WireCall) => isListing(c) && c.url.searchParams.get("search") === "cats";

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function hangingProvider() {
  return vi.fn<Provider>(() => new Promise<string[]>(() => {}));
}

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  cacheAccess.keys = [];
  cacheAccess.reads = [];
  cacheAccess.writes = [];
  catalogue.slots = { "video-discover-recommended": [PICKUP] };
  for (const name of Object.keys(addonProviders)) delete addonProviders[name];
  provider = vi.fn<Provider>(async ({ restrict }) => restrict(["m1"]));
  addonProviders.pickup = provider;
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
  installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === `/api/drives/${DRIVE}/smart-folders`) {
      return json([
        {
          id: "sf-cats",
          drive: DRIVE,
          name: "Cats",
          query: "cats",
          file_type: null,
          sort_by: null,
          sort_order: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: null,
        },
      ]);
    }
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isEvaluation(call)) return pagedListing(MEMBERS, call);
    if (isListing(call) || call.url.pathname === `/api/drives/${DRIVE}/files/query`) {
      return json({ data: [item("n1", "Newest one")], meta: { total: 1, page: 1, limit: 12 } });
    }
    if (path === `/api/drives/${DRIVE}/shelves` || path === `/api/drives/${DRIVE}/shelves/query`) {
      const by = call.url.searchParams.get("by") ?? "all";
      const key = call.url.searchParams.get("key") ?? "all";
      const ids = [...call.url.searchParams.getAll("ids"), ...(fileIdsOf(call) ?? [])];
      const members = fileIdsOf(call);
      const kept = members === null ? ids : ids.filter((id) => members.includes(id));
      const items = by === "all" && key === "all" ? [...new Set(kept)].map((id) => item(id, `Vid ${id}`)) : [];
      return json({
        by,
        total_shelves: 1,
        shelves: [{ key, label: key, count: items.length, items }],
      });
    }
    return json([], 200);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-117 step 6, I8: the Discover cache under a member target", () => {
  it("keys a member target apart from the default target whose params are equal", () => {
    const base = {
      drive: DRIVE,
      params: { type: ["video"] } as VideoTargetParams,
      slot: "video-discover-recommended",
      date: "2026-01-01",
    };
    expect(discoverCacheKey({ ...base, requestKey: "member\u0000sf-cats" })).not.toBe(
      discoverCacheKey({ ...base, requestKey: "" }),
    );
  });

  it("neither reads nor writes it, and an outside id the provider returns is not drawn", async () => {
    provider = vi.fn<Provider>(async ({ restrict }) => restrict(["m1", "outside"]));
    addonProviders.pickup = provider;
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    expect(screen.queryByText("Vid outside")).not.toBeInTheDocument();

    expect(cacheAccess.reads).toEqual([]);
    expect(cacheAccess.writes).toEqual([]);
  });

  it("does not hand the member visit's shelf to the default target", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    const first = render(<VideoApp drive={DRIVE} />);
    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    first.unmount();

    let failProvider!: (error: unknown) => void;
    provider = vi.fn<Provider>(
      () =>
        new Promise<string[]>((_, reject) => {
          failProvider = reject;
        }),
    );
    addonProviders.pickup = provider;
    writeAppPrefs(DRIVE, { target: "default" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(provider).toHaveBeenCalled());
    await waitFor(() => expect(cacheAccess.reads).toHaveLength(1));
    await settle();
    await settle();
    await act(async () => failProvider(new Error("provider failed")));
    // New is drawn only once Recommended has settled, so its presence bounds
    // when the cached draw could have happened.
    expect(await screen.findByText("Newest one")).toBeInTheDocument();
    await settle();
    expect(screen.queryByText("Vid m1")).not.toBeInTheDocument();
  });

  it("computes a member target's Discover cache keys apart from the default target's", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    const first = render(<VideoApp drive={DRIVE} />);
    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    const memberKeys = [...cacheAccess.keys];
    first.unmount();

    cacheAccess.keys = [];
    provider = hangingProvider();
    addonProviders.pickup = provider;
    writeAppPrefs(DRIVE, { target: "default" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(cacheAccess.reads).toHaveLength(1));
    const defaultKeys = [...cacheAccess.keys];

    expect(memberKeys.length).toBeGreaterThan(0);
    expect(defaultKeys.length).toBeGreaterThan(0);
    expect(memberKeys.filter((key) => defaultKeys.includes(key))).toEqual([]);
  });
});
