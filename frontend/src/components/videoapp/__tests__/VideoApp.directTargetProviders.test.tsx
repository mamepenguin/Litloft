/**
 * SPEC-CORE-177: under a direct Smart Collection target with an exclusion, a
 * provider's restriction carries the target's keys instead of members, and the
 * Discover cache is used, keyed apart for targets that differ in an exclusion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import { fileIdsOf, installWireFetch, json, paramsOf, type WireCall } from "@/__tests__/helpers/wireFetch";
import { VideoApp } from "../VideoApp";
import { VideoShelfPage } from "../VideoShelfPage";

const DRIVE = "main";
const API = `/api/drives/${DRIVE}`;

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

type Entry = { id: string; label: string; priority: number; addonName: string };
type Provider = (args: {
  drive: string;
  limit: number;
  restrict: (ids: string[]) => Promise<string[]>;
}) => Promise<string[]>;
type PageProvider = (args: {
  drive: string;
  locale: string;
  limit: number;
  cursor: string | null;
  restrict: (ids: string[]) => Promise<string[]>;
}) => Promise<{ items: unknown[]; cursor: unknown }>;

const { catalogue, slotProviders, slotPageProviders } = vi.hoisted(() => ({
  catalogue: { slots: {} as Record<string, Entry[]> },
  slotProviders: {} as Record<string, unknown>,
  slotPageProviders: {} as Record<string, unknown>,
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
  slotProviders,
  slotPageProviders,
}));
vi.mock("@/addons/media_import/slots.ts", () => ({
  slotComponents: {},
  slotProviders: {},
  slotPageProviders: {},
}));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

function item(id: string) {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Vid ${id}`,
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

const SHELF: Entry = { id: "shelf-a", label: "Shelf Alpha", priority: 10, addonName: "intelligence" };
const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };
let wire: { calls: WireCall[] };

const isShelves = (c: WireCall) => c.url.pathname === `${API}/shelves`;
const isMemberRoute = (c: WireCall) => c.url.pathname.endsWith("/query") || fileIdsOf(c) !== null;
const restrictCalls = () => wire.calls.filter((c) => paramsOf(c, "ids").length > 0);

function expectRestrictedBy(folder: string) {
  const restricts = restrictCalls();
  expect(restricts.length).toBeGreaterThan(0);
  for (const call of restricts) {
    expect(isMemberRoute(call)).toBe(false);
    expect(paramsOf(call, "exclude_folder")).toEqual([folder]);
    expect(paramsOf(call, "type")).toEqual(["video"]);
  }
  expect(wire.calls.filter(isMemberRoute)).toEqual([]);
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  invalidateAddonsCache();
  cacheAccess.keys = [];
  cacheAccess.reads = [];
  cacheAccess.writes = [];
  catalogue.slots = {};
  for (const bag of [slotProviders, slotPageProviders]) {
    for (const name of Object.keys(bag)) delete bag[name];
  }
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
    const path = call.url.pathname;
    if (path === `${API}/smart-folders`) {
      return json([
        smartFolder("sf-not-work", "Not work", "-path:Work"),
        smartFolder("sf-not-play", "Not play", "-path:Play"),
      ]);
    }
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (path === `${API}/files` || path === `${API}/files/query`) {
      return json({ data: [item("n1")], meta: { total: 1, page: 1, limit: 12 } });
    }
    if (isShelves(call) || path === `${API}/shelves/query`) {
      const by = call.url.searchParams.get("by") ?? "all";
      const key = call.url.searchParams.get("key") ?? "all";
      const asked = [...paramsOf(call, "ids"), ...(fileIdsOf(call) ?? [])];
      const items = by === "all" && key === "all" ? [...new Set(asked)].map(item) : [];
      return json({ by, total_shelves: 1, shelves: [{ key, label: key, count: items.length, items }] });
    }
    return json([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-177 I3 a provider's restriction carries the target's keys", () => {
  it("SPEC-CORE-177 Discover's addon shelf restricts through the listing route with exclude_folder", async () => {
    catalogue.slots = { "video-discover-shelves": [SHELF] };
    slotProviders["shelf-a"] = vi.fn<Provider>(async ({ restrict }) => restrict(["m1"]));
    writeAppPrefs(DRIVE, { target: "sf-not-work" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    await settle();
    expectRestrictedBy("Work");
  });

  it("SPEC-CORE-177 the provider See all page restricts through the listing route with exclude_folder", async () => {
    catalogue.slots = { "video-discover-shelves": [SHELF] };
    slotPageProviders["shelf-a"] = vi.fn<PageProvider>(async ({ restrict }) => {
      const accepted = await restrict(["m1"]);
      return { items: accepted.map((id) => ({ id })), cursor: null };
    });
    writeAppPrefs(DRIVE, { target: "sf-not-work" });
    render(<VideoShelfPage drive={DRIVE} by={null} shelfKey="all" entry="shelf-a" slot={null} />);

    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    await settle();
    expectRestrictedBy("Work");
  });
});

describe("SPEC-CORE-177 I9 the Discover cache under a direct target with an exclusion", () => {
  it("SPEC-CORE-177 is used, and two targets differing only in an exclusion share no entry", async () => {
    catalogue.slots = { "video-discover-recommended": [PICKUP] };
    slotProviders.pickup = vi.fn<Provider>(async ({ restrict }) => restrict(["m1"]));
    writeAppPrefs(DRIVE, { target: "sf-not-work" });
    const first = render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    await settle();
    expectRestrictedBy("Work");
    expect(cacheAccess.reads.length).toBeGreaterThan(0);
    expect(cacheAccess.writes.length).toBeGreaterThan(0);
    const workKeys = [...cacheAccess.keys];
    first.unmount();

    cacheAccess.keys = [];
    const reads = cacheAccess.reads.length;
    wire.calls.length = 0;
    writeAppPrefs(DRIVE, { target: "sf-not-play" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(cacheAccess.reads.length).toBeGreaterThan(reads));
    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    await settle();
    const playKeys = [...cacheAccess.keys];

    expect(playKeys.length).toBeGreaterThan(0);
    expect(playKeys.filter((key) => workKeys.includes(key))).toEqual([]);
    expectRestrictedBy("Play");
  });
});
