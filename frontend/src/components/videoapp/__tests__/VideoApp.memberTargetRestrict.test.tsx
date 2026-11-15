/**
 * SPEC-CORE-117 step 5, I8: under a member target, the restriction of a
 * provider's ids — Discover's Recommended and addon shelves, and the provider
 * shelf page — goes through POST shelves/query with the members, so an id
 * outside them is never drawn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import {
  fileIdsOf,
  installWireFetch,
  json,
  pagedListing,
  paramsOf,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";
import { VideoApp } from "../VideoApp";
import { VideoShelfPage } from "../VideoShelfPage";

const DRIVE = "main";

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

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

const MEMBERS = [item("m1"), item("m2")];
const SHELF: Entry = { id: "shelf-a", label: "Shelf Alpha", priority: 10, addonName: "intelligence" };
let wire: { calls: WireCall[] };

const isShelves = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves`;
const isShelvesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves/query`;
const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isEvaluation = (c: WireCall) => isListing(c) && c.url.searchParams.get("search") === "cats";

/** Every request that restricts a provider's ids, whichever route the client chose. */
const restrictCalls = () => wire.calls.filter((c) => paramsOf(c, "ids").length > 0);

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  catalogue.slots = { "video-discover-shelves": [SHELF] };
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
    if (isListing(call) || path === `/api/drives/${DRIVE}/files/query`) {
      return json({ data: [item("n1")], meta: { total: 1, page: 1, limit: 12 } });
    }
    if (isShelves(call) || isShelvesQuery(call)) {
      const by = call.url.searchParams.get("by") ?? "all";
      const key = call.url.searchParams.get("key") ?? "all";
      const asked = [...paramsOf(call, "ids"), ...(fileIdsOf(call) ?? [])];
      // The server applies the member set when the request carries one. A GET
      // carries none, so its own ids come back as asked — including any id
      // outside the target.
      const members = fileIdsOf(call);
      const kept = members === null ? asked : asked.filter((id) => members.includes(id));
      const items = by === "all" && key === "all" ? [...new Set(kept)].map(item) : [];
      return json({ by, total_shelves: 1, shelves: [{ key, label: key, count: items.length, items }] });
    }
    return json([], 200);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function expectMembersOnly() {
  const restricts = restrictCalls();
  expect(restricts.length).toBeGreaterThan(0);
  for (const call of restricts) {
    expect(call.method).toBe("POST");
    expect(isShelvesQuery(call)).toBe(true);
    expect(new Set(fileIdsOf(call))).toEqual(new Set(MEMBERS.map((member) => member.id)));
  }
  expect(wire.calls.filter(isShelves)).toEqual([]);
}

describe("SPEC-CORE-117 step 5, I8: a provider shelf's restriction carries the members", () => {
  it("Discover's addon shelf restricts through POST shelves/query and drops an outside id", async () => {
    slotProviders["shelf-a"] = vi.fn<Provider>(async ({ restrict }) => restrict(["m1", "outside"]));
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    expect(screen.queryByText("Vid outside")).not.toBeInTheDocument();
    expectMembersOnly();
  });

  it("the provider shelf page restricts through POST shelves/query and drops an outside id", async () => {
    slotPageProviders["shelf-a"] = vi.fn<PageProvider>(async ({ restrict }) => {
      const accepted = await restrict(["m1", "outside"]);
      return { items: accepted.map((id) => ({ id })), cursor: null };
    });
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoShelfPage drive={DRIVE} by={null} shelfKey="all" entry="shelf-a" slot={null} />);

    expect(await screen.findByText("Vid m1")).toBeInTheDocument();
    expect(screen.queryByText("Vid outside")).not.toBeInTheDocument();
    expectMembersOnly();
  });
});
