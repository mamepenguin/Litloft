/**
 * SPEC-CORE-118 step 8, I3 on the See all pages, the provider shelf page and the
 * restriction of a provider's ids: under a collection target every request
 * carries the base kinds and the collection's name, and the page's own
 * conditions apply as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import { READING_BASE_KINDS } from "@/lib/readingAppTarget";
import { fileIdsOf, installWireFetch, json, paramsOf, type WireCall } from "@/__tests__/helpers/wireFetch";
import { VideoApp } from "../VideoApp";
import { VideoShelfPage } from "../VideoShelfPage";
import { ReadingShelfPage } from "@/components/readingapp/ReadingShelfPage";

const DRIVE = "main";

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video/shelf",
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

const collection = (id: string, name: string) => ({
  id,
  name,
  description: null,
  drive: DRIVE,
  item_count: 2,
  first_file_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const SHELF: Entry = { id: "shelf-a", label: "Shelf Alpha", priority: 10, addonName: "intelligence" };
const NOT_FROM_A_COLLECTION = ["search", "size", "duration", "favorite", "liked"];

const isShelves = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves`;
const isShelvesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves/query`;
const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const underTarget = (c: WireCall) => isListing(c) || isShelves(c) || isFilesQuery(c) || isShelvesQuery(c);
const restrictCalls = (calls: WireCall[]) => calls.filter((c) => paramsOf(c, "ids").length > 0);

let wire: { calls: WireCall[] };

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
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
    if (path === `/api/drives/${DRIVE}/smart-folders`) return json([]);
    if (path === `/api/drives/${DRIVE}/collections`) return json([collection("c-trip", "Trip"), collection("c-x", "Other")]);
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isListing(call) || isFilesQuery(call)) return json({ data: [item("n1")], meta: { total: 1, page: 1, limit: 12 } });
    if (isShelves(call) || isShelvesQuery(call)) {
      const by = call.url.searchParams.get("by") ?? "all";
      const key = call.url.searchParams.get("key") ?? "all";
      const asked = paramsOf(call, "ids");
      // The server keeps only the collection's ids when the request names it.
      const kept = paramsOf(call, "collection").length > 0 ? asked.filter((id) => id !== "outside") : asked;
      const items = asked.length > 0 ? kept.map(item) : [item(`s-${by}-${key}`)];
      return json({ by, base: "", total_shelves: 1, shelves: [{ key, label: key, count: items.length, items }] });
    }
    return json([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function settle(ms = 100) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function expectCollectionTarget(call: WireCall, base: readonly string[]) {
  expect(call.method).toBe("GET");
  expect(fileIdsOf(call)).toBeNull();
  expect([...paramsOf(call, "type")].sort()).toEqual([...base].sort());
  expect(paramsOf(call, "collection")).toEqual(["Trip"]);
  for (const key of NOT_FROM_A_COLLECTION) expect(paramsOf(call, key), key).toEqual([]);
}

describe("SPEC-CORE-118 I3 a See all page under a collection target", () => {
  it("SPEC-CORE-118 I3 Video: every request carries type=video and the collection, with the page's own key", async () => {
    writeAppPrefs(DRIVE, { target: "collection:c-trip" });
    render(<VideoShelfPage drive={DRIVE} by="tag" shelfKey="Trip" />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    const sent = wire.calls.filter(underTarget);
    for (const call of sent) {
      expectCollectionTarget(call, ["video"]);
      expect(paramsOf(call, "tag")).toEqual([]);
      expect(paramsOf(call, "folder")).toEqual([]);
    }
    const shelf = wire.calls.find(isShelves)!;
    expect(shelf.url.searchParams.get("by")).toBe("tag");
    expect(shelf.url.searchParams.get("key")).toBe("Trip");
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Trip");
  });

  it("SPEC-CORE-118 I3 Reading: every request carries the Reading base kinds and the collection, with the page's own folder and tag", async () => {
    writeAppPrefs(DRIVE, { target: "collection:c-trip" }, "reading");
    render(<ReadingShelfPage drive={DRIVE} by="tag" shelfKey="Trip" folders={["Books/Novels"]} tags={["read"]} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    for (const call of wire.calls.filter(underTarget)) expectCollectionTarget(call, READING_BASE_KINDS);
    // The header count is a shelves request of its own, before the page's.
    const shelf = wire.calls.find((call) => isShelves(call) && paramsOf(call, "by")[0] === "tag")!;
    expect(paramsOf(shelf, "folder")).toEqual(["Books/Novels"]);
    expect(paramsOf(shelf, "tag")).toEqual(["read"]);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Trip");
  });
});

describe("SPEC-CORE-118 I3 a provider's ids are restricted under the collection", () => {
  it("SPEC-CORE-118 I3 Discover's addon shelf restricts with type=video and the collection", async () => {
    catalogue.slots = { "video-discover-shelves": [SHELF] };
    slotProviders["shelf-a"] = vi.fn<Provider>(async ({ restrict }) => restrict(["m1", "outside"]));
    writeAppPrefs(DRIVE, { target: "collection:c-trip" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    expect(screen.queryByText("Vid outside")).not.toBeInTheDocument();
    const restricts = restrictCalls(wire.calls);
    expect(restricts.length).toBeGreaterThan(0);
    for (const call of restricts) expectCollectionTarget(call, ["video"]);
  });

  it("SPEC-CORE-118 I3 the provider shelf page restricts with type=video and the collection", async () => {
    catalogue.slots = { "video-discover-shelves": [SHELF] };
    slotPageProviders["shelf-a"] = vi.fn<PageProvider>(async ({ restrict }) => {
      const accepted = await restrict(["m1", "outside"]);
      return { items: accepted.map((id) => ({ id })), cursor: null };
    });
    writeAppPrefs(DRIVE, { target: "collection:c-trip" });
    render(<VideoShelfPage drive={DRIVE} by={null} shelfKey="all" entry="shelf-a" slot={null} />);

    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    expect(screen.queryByText("Vid outside")).not.toBeInTheDocument();
    const restricts = restrictCalls(wire.calls);
    expect(restricts.length).toBeGreaterThan(0);
    for (const call of restricts) expectCollectionTarget(call, ["video"]);
  });
});
