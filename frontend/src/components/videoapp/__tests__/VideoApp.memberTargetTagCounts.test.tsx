/**
 * SPEC-CORE-147 I12: under a member Target, the tag menu's tag-counts request
 * is the POST form carrying the members, as the Library's own requests are.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import { fileIdsOf, installWireFetch, json, pagedListing, paramsOf, type WireCall } from "@/__tests__/helpers/wireFetch";
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

const MEMBERS = [item("m1", "Member one"), item("m2", "Member two")];
const TARGET_CONDITIONS = ["search", "folder", "collection", "size", "duration", "favorite", "liked"];

const isTagCounts = (c: WireCall) => c.url.pathname.startsWith(`/api/drives/${DRIVE}/tag-counts`);
const isEvaluation = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files` && c.url.searchParams.has("search");

let wire: { calls: WireCall[] };

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
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
    if (isTagCounts(call)) return json([{ name: "Trip", count: 2 }, { name: "Food", count: 1 }]);
    if (path.endsWith("/shelves") || path.endsWith("/shelves/query")) {
      const by = call.url.searchParams.get("by") ?? "all";
      return json({ by, total_shelves: 1, shelves: [{ key: "k", label: "k", count: 1, items: [item("s1", "Shelf card")] }] });
    }
    if (path.endsWith("/files") || path.endsWith("/files/query")) {
      return json({ data: [item("p1", "Posted video")], meta: { total: 2, page: 1, limit: 12 } });
    }
    return json([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-147 I12 tag-counts under a member Target", () => {
  it("SPEC-CORE-147 I12 posts the members to tag-counts/query, with the chosen tags and none of the query's conditions", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats", face: "library" });
    render(<VideoApp drive={DRIVE} />);
    await screen.findAllByText("Shelf card");

    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    await waitFor(() => expect(wire.calls.filter(isTagCounts)).toHaveLength(1));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Food/ }));
    await waitFor(() => expect(wire.calls.filter(isTagCounts)).toHaveLength(2));

    const [first, second] = wire.calls.filter(isTagCounts);
    for (const call of [first, second]) {
      expect(call.method).toBe("POST");
      expect(call.url.pathname).toBe(`/api/drives/${DRIVE}/tag-counts/query`);
      expect(new Set(fileIdsOf(call))).toEqual(new Set(MEMBERS.map((m) => m.id)));
      for (const key of TARGET_CONDITIONS) expect(paramsOf(call, key)).toEqual([]);
    }
    expect(paramsOf(first, "tag")).toEqual([]);
    expect(paramsOf(second, "tag")).toEqual(["Food"]);
  });
});
