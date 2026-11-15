/**
 * SPEC-CORE-117 steps 5 and 9, I8 on the See all pages of Video and Reading:
 * a member target's shelf page goes through POST shelves/query with the
 * members, keeps the page's own conditions, and a failed evaluation leaves one
 * retry control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
import { VideoShelfPage } from "../VideoShelfPage";
import { ReadingShelfPage } from "@/components/readingapp/ReadingShelfPage";

const DRIVE = "main";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video/shelf",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

function item(id: string, fileType = "video") {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Item ${id}`,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: fileType,
    mime_type: fileType === "video" ? "video/mp4" : "application/pdf",
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

const smartFolder = (id: string, name: string, query: string) => ({
  id,
  drive: DRIVE,
  name,
  query,
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
});

const MEMBERS = [item("m1"), item("m2"), item("m3", "document")];
const TARGET_CONDITIONS = ["search", "collection", "size", "duration", "favorite", "liked"];

const isShelves = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves`;
const isShelvesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves/query`;
const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const isEvaluation = (c: WireCall) => isListing(c) && c.url.searchParams.get("search") === "cats";

let fail = false;
let wire: { calls: WireCall[] };

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  fail = false;
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
    if (path === `/api/drives/${DRIVE}/smart-folders`) return json([smartFolder("sf-cats", "Cats", "cats")]);
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isEvaluation(call)) return fail ? json({ detail: "boom" }, 500) : pagedListing(MEMBERS, call);
    if (isListing(call) || isFilesQuery(call)) return pagedListing([item("d1")], call);
    if (isShelves(call) || isShelvesQuery(call)) {
      const key = call.url.searchParams.get("key") ?? "";
      return json({
        by: call.url.searchParams.get("by"),
        total_shelves: 1,
        shelves: [{ key, label: key, count: 1, items: [item("s1")] }],
      });
    }
    return json([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PAGES = [
  {
    app: "video" as const,
    render: () => render(<VideoShelfPage drive={DRIVE} by="tag" shelfKey="Trip" />),
  },
  {
    app: "reading" as const,
    render: () =>
      render(<ReadingShelfPage drive={DRIVE} by="tag" shelfKey="Trip" folders={["Books/Novels"]} tags={["read"]} />),
  },
];

describe("SPEC-CORE-117 I8: a member target's shelf page", () => {
  it.each(PAGES)("$app: POST shelves/query with the members and the page's own key", async (page) => {
    writeAppPrefs(DRIVE, { target: "sf-cats" }, page.app === "reading" ? "reading" : undefined);
    page.render();

    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));

    for (const call of wire.calls.filter(isShelvesQuery)) {
      expect(new Set(fileIdsOf(call))).toEqual(new Set(MEMBERS.map((m) => m.id)));
      expect(call.url.searchParams.get("by")).toBe("tag");
      expect(call.url.searchParams.get("key")).toBe("Trip");
      for (const key of TARGET_CONDITIONS) expect(paramsOf(call, key)).toEqual([]);
    }
    if (page.app === "reading") {
      const call = wire.calls.find(isShelvesQuery)!;
      expect(paramsOf(call, "folder")).toEqual(["Books/Novels"]);
      expect(paramsOf(call, "tag")).toEqual(["read"]);
    }
    expect(wire.calls.filter(isShelves)).toEqual([]);
  });

  it.each(PAGES)("$app: a failed evaluation leaves one retry control, and retry evaluates again", async (page) => {
    fail = true;
    writeAppPrefs(DRIVE, { target: "sf-cats" }, page.app === "reading" ? "reading" : undefined);
    page.render();

    const retry = await screen.findByRole("button", { name: /retry/i });
    expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(1);
    expect(wire.calls.filter((c) => isShelves(c) || isShelvesQuery(c))).toEqual([]);

    fail = false;
    fireEvent.click(retry);

    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));
  });
});
