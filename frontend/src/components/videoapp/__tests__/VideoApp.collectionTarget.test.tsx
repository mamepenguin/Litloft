/**
 * SPEC-CORE-118: a collection as the Video app's target. Every request under it
 * carries `type` = the base kinds and `collection` = the collection's name.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { readAppTarget, writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import {
  fileIdsOf,
  installWireFetch,
  json,
  never,
  paramsOf,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";
import { VideoApp } from "../VideoApp";

const DRIVE = "main";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
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

const TRIP = collection("c-trip", "Trip");
const OTHER = collection("c-other", "Other");
const SAVED = "collection:c-trip";
const NOT_FROM_A_COLLECTION = ["search", "tag", "folder", "size", "duration", "favorite", "liked"];

const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isShelves = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const isShelvesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves/query`;
const isCollections = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/collections`;
const underTarget = (c: WireCall) => isListing(c) || isShelves(c) || isFilesQuery(c) || isShelvesQuery(c);

function shelvesAnswer(call: WireCall) {
  const by = call.url.searchParams.get("by") ?? "all";
  const key = call.url.searchParams.get("key") ?? "all";
  return json({
    by,
    total_shelves: 1,
    shelves: [{ key, label: key, count: 1, items: [item(`s-${by}-${key}`, `Shelf ${by} ${key}`)] }],
  });
}

let smartFolders: () => Response | Promise<Response>;
let collections: () => Response | Promise<Response>;
let wire: { calls: WireCall[] };

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  smartFolders = () => json([smartFolder("sf-trips", "Trips", "tag:Trip")]);
  collections = () => json([TRIP, OTHER]);
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
    if (path === `/api/drives/${DRIVE}/smart-folders`) return smartFolders();
    if (isCollections(call)) return collections();
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isListing(call) || isFilesQuery(call)) {
      return json({ data: [item("d1", "Listed video")], meta: { total: 42, page: 1, limit: 12 } });
    }
    if (isShelves(call) || isShelvesQuery(call)) return shelvesAnswer(call);
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

function expectCollectionTarget(call: WireCall, name: string) {
  expect(call.method).toBe("GET");
  expect(fileIdsOf(call)).toBeNull();
  expect(paramsOf(call, "type")).toEqual(["video"]);
  expect(paramsOf(call, "collection")).toEqual([name]);
  for (const key of NOT_FROM_A_COLLECTION) expect(paramsOf(call, key), key).toEqual([]);
}

describe("SPEC-CORE-118 I3 every request under a collection target", () => {
  it.each([
    ["Discover", undefined],
    ["Library", "library" as const],
  ])("SPEC-CORE-118 I3 %s sends type=video and the collection's name, nothing else from the target", async (_face, face) => {
    writeAppPrefs(DRIVE, face ? { target: SAVED, face } : { target: SAVED });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    const sent = wire.calls.filter(underTarget);
    expect(sent.some(isListing)).toBe(true);
    for (const call of sent) expectCollectionTarget(call, "Trip");
    expect(wire.calls.filter((c) => isFilesQuery(c) || isShelvesQuery(c))).toEqual([]);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Trip");
  });

  it("SPEC-CORE-118 step 9 the name sent is the one loaded on mount, after a rename on the server", async () => {
    writeAppPrefs(DRIVE, { target: SAVED });
    render(<VideoApp drive={DRIVE} />);
    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    collections = () => json([collection("c-trip", "Trip renamed"), OTHER]);
    const from = wire.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    await waitFor(() => expect(wire.calls.slice(from).some(isShelves)).toBe(true));
    await settle();

    for (const call of wire.calls.slice(from).filter(underTarget)) expectCollectionTarget(call, "Trip");
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Trip");
  });
});

describe("SPEC-CORE-118 I2 choosing a collection in the Target menu", () => {
  it("SPEC-CORE-118 I2 saves collection:<id> and the next requests carry the collection", async () => {
    render(<VideoApp drive={DRIVE} />);
    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /Target/ }));
    const from = wire.calls.length;
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Trip" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Trip"));
    await waitFor(() => expect(wire.calls.slice(from).some(isShelves)).toBe(true));
    await settle();

    expect(readAppTarget(DRIVE, "video")).toBe(SAVED);
    const after = wire.calls.slice(from);
    for (const call of after.filter(isShelves)) expectCollectionTarget(call, "Trip");
    expect(after.filter(isListing).some((c) => paramsOf(c, "collection")[0] === "Trip")).toBe(true);
  });
});

describe("SPEC-CORE-118 I4 nothing under a target goes out before its own list", () => {
  it("SPEC-CORE-118 I4 a saved collection waits for the collection list", async () => {
    collections = () => never();
    writeAppPrefs(DRIVE, { target: SAVED });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
    await settle();

    expect(wire.calls.filter(underTarget)).toEqual([]);
  });

  it("SPEC-CORE-118 I4 a saved collection does not wait for the Smart Collection list", async () => {
    smartFolders = () => never();
    writeAppPrefs(DRIVE, { target: SAVED });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    for (const call of wire.calls.filter(underTarget)) expectCollectionTarget(call, "Trip");
  });

  it("SPEC-CORE-118 I4, I6 a saved Smart Collection waits for its own list only, and carries no collection", async () => {
    collections = () => never();
    writeAppPrefs(DRIVE, { target: "sf-trips" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    expect(wire.calls.filter(isCollections)).toHaveLength(1);
    const sent = wire.calls.filter(underTarget);
    for (const call of sent) {
      expect(paramsOf(call, "tag")).toEqual(["Trip"]);
      expect(paramsOf(call, "collection")).toEqual([]);
    }
  });

  it("SPEC-CORE-118 I4, I6 the default target waits for neither list, and carries no collection", async () => {
    smartFolders = () => never();
    collections = () => never();
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    expect(wire.calls.filter(isCollections)).toHaveLength(1);
    for (const call of wire.calls.filter(underTarget)) {
      expect(paramsOf(call, "type")).toEqual(["video"]);
      expect(paramsOf(call, "collection")).toEqual([]);
    }
  });
});

describe("SPEC-CORE-118 I2 a collection target that cannot be resolved", () => {
  function expectDefaultTarget() {
    const sent = wire.calls.filter(underTarget);
    expect(sent.length).toBeGreaterThan(0);
    for (const call of sent) {
      expect(paramsOf(call, "type")).toEqual(["video"]);
      expect(paramsOf(call, "collection")).toEqual([]);
    }
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("All videos");
    expect(readAppTarget(DRIVE, "video")).toBe(SAVED);
  }

  it("SPEC-CORE-118 I2 a gone collection gives the default target, the saved id kept", async () => {
    collections = () => json([OTHER]);
    writeAppPrefs(DRIVE, { target: SAVED });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    expect(wire.calls.filter(isCollections)).toHaveLength(1);
    expectDefaultTarget();
    fireEvent.click(screen.getByRole("button", { name: /Target/ }));
    expect(await screen.findByRole("menuitemradio", { name: "Other" })).toBeInTheDocument();
  });

  it("SPEC-CORE-118 I2 a failed list gives the default target at once; a retry that loads it applies the target", async () => {
    let fail = true;
    collections = () => (fail ? json({ detail: "boom" }, 500) : json([TRIP, OTHER]));
    writeAppPrefs(DRIVE, { target: SAVED });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();
    expectDefaultTarget();

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Manage/ }));
    const from = wire.calls.length;
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(wire.calls.slice(from).some(isCollections)).toBe(true));
    expect(await screen.findByRole("checkbox", { name: "Trip" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(
        wire.calls.slice(from).some((c) => isShelves(c) && paramsOf(c, "collection")[0] === "Trip"),
      ).toBe(true),
    );
    await settle();

    for (const call of wire.calls.slice(from).filter(isShelves)) expectCollectionTarget(call, "Trip");
    expect(readAppTarget(DRIVE, "video")).toBe(SAVED);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Trip");
  });
});
