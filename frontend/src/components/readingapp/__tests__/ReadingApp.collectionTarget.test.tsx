/**
 * SPEC-CORE-118 in the Reading app: a collection target sends the Reading base
 * kinds and the collection's name, and waits for the collection list only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { readAppTarget, writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import { READING_BASE_KINDS } from "@/lib/readingAppTarget";
import {
  fileIdsOf,
  installWireFetch,
  json,
  never,
  paramsOf,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";
import { ReadingApp } from "../ReadingApp";

const DRIVE = "main";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/reading",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

function book(id: string, title: string) {
  return {
    id,
    filename: `${title}.pdf`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "Books",
    file_type: "document",
    mime_type: "application/pdf",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: null,
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

const SAVED = "collection:c-shelf";
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
    base: "",
    total_shelves: 1,
    shelves: [{ key, label: key, count: 1, items: [book(`s-${by}-${key}`, `Shelf ${by} ${key}`)] }],
  });
}

let smartFolders: () => Response | Promise<Response>;
let collections: () => Response | Promise<Response>;
let wire: { calls: WireCall[] };

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  smartFolders = () => json([smartFolder("sf-read", "Read", "tag:read")]);
  collections = () => json([collection("c-shelf", "Bedside 2"), collection("c-other", "Other")]);
  wire = installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === `/api/drives/${DRIVE}/smart-folders`) return smartFolders();
    if (isCollections(call)) return collections();
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isListing(call) || isFilesQuery(call)) {
      return json({ data: [book("d1", "Listed book")], meta: { total: 42, page: 1, limit: 12 } });
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

const sortedKinds = (call: WireCall) => [...paramsOf(call, "type")].sort();
const BASE = [...READING_BASE_KINDS].sort();

describe("SPEC-CORE-118 I3 every request under a collection target", () => {
  it.each([
    ["Discover", undefined],
    ["Library", "library" as const],
  ])("SPEC-CORE-118 I3 %s sends the Reading base kinds and the collection's name, nothing else from the target", async (_face, face) => {
    writeAppPrefs(DRIVE, face ? { target: SAVED, face } : { target: SAVED }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    const sent = wire.calls.filter(underTarget);
    for (const call of sent) {
      expect(call.method).toBe("GET");
      expect(fileIdsOf(call)).toBeNull();
      expect(sortedKinds(call)).toEqual(BASE);
      expect(paramsOf(call, "collection")).toEqual(["Bedside 2"]);
      for (const key of NOT_FROM_A_COLLECTION) expect(paramsOf(call, key), key).toEqual([]);
    }
    expect(wire.calls.filter((c) => isFilesQuery(c) || isShelvesQuery(c))).toEqual([]);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Bedside 2");
  });
});

describe("SPEC-CORE-118 step 6, I2 choosing a collection in Reading's Target menu", () => {
  it("SPEC-CORE-118 I2 saves collection:<id> and the next requests carry the collection", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /Target/ }));
    const from = wire.calls.length;
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Bedside 2" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Bedside 2"));
    await waitFor(() => expect(wire.calls.slice(from).some(isShelves)).toBe(true));
    await settle();

    expect(readAppTarget(DRIVE, "reading")).toBe(SAVED);
    for (const call of wire.calls.slice(from).filter(isShelves)) {
      expect(sortedKinds(call)).toEqual(BASE);
      expect(paramsOf(call, "collection")).toEqual(["Bedside 2"]);
    }
  });
});

describe("SPEC-CORE-118 I4 nothing under a target goes out before its own list", () => {
  it("SPEC-CORE-118 I4 a saved collection waits for the collection list", async () => {
    collections = () => never();
    writeAppPrefs(DRIVE, { target: SAVED }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
    await settle();

    expect(wire.calls.filter(underTarget)).toEqual([]);
  });

  it("SPEC-CORE-118 I4 a saved collection does not wait for the Smart Collection list", async () => {
    smartFolders = () => never();
    writeAppPrefs(DRIVE, { target: SAVED }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    for (const call of wire.calls.filter(underTarget)) {
      expect(paramsOf(call, "collection")).toEqual(["Bedside 2"]);
    }
  });

  it.each([
    ["a saved Smart Collection", "sf-read", ["read"]],
    ["the default target", undefined, []],
  ])("SPEC-CORE-118 I4, I6 %s does not wait for the collection list and carries no collection", async (_label, target, tags) => {
    collections = () => never();
    if (target) writeAppPrefs(DRIVE, { target }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    expect(wire.calls.filter(isCollections)).toHaveLength(1);
    for (const call of wire.calls.filter(underTarget)) {
      expect(paramsOf(call, "tag")).toEqual(tags);
      expect(paramsOf(call, "collection")).toEqual([]);
    }
  });
});

describe("SPEC-CORE-118 I2 a collection target that cannot be resolved", () => {
  it.each([
    ["the list failed", () => json({ detail: "boom" }, 500)],
    ["the collection is gone", () => json([collection("c-other", "Other")])],
  ])("SPEC-CORE-118 I2 %s: the default target, the saved id kept", async (_label, answer) => {
    collections = answer;
    writeAppPrefs(DRIVE, { target: SAVED }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isCollections)).toBe(true));
    await waitFor(() => expect(wire.calls.some(isShelves)).toBe(true));
    await settle();

    for (const call of wire.calls.filter(underTarget)) {
      expect(sortedKinds(call)).toEqual(BASE);
      expect(paramsOf(call, "collection")).toEqual([]);
    }
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("All books");
    expect(readAppTarget(DRIVE, "reading")).toBe(SAVED);
  });
});
