/**
 * SPEC-CORE-156: the name under a member Target, and the name while the Library
 * body is not drawn. A Smart Collection with free text sends its members through
 * the POST routes; the name's `search` is then the only `search` those requests
 * carry. Every request is answered at `fetch`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";

import { writeAppPrefs, type AppId } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import { readLibraryFilters, resetLibraryFilters, writeLibraryFilters } from "@/components/appshell/libraryFilters";
import { fileIdsOf, installWireFetch, json, pagedListing, paramsOf, type WireCall } from "@/__tests__/helpers/wireFetch";
import { VideoApp } from "@/components/videoapp/VideoApp";
import { ReadingApp } from "@/components/readingapp/ReadingApp";

const DRIVE = "main";
const NAME = "kyoto";

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

interface AppCase {
  id: AppId;
  App: ComponentType<{ drive: string }>;
  fileType: string;
  mime: string;
  unusableType: string;
  empty: string;
}

const APPS: AppCase[] = [
  { id: "video", App: VideoApp, fileType: "video", mime: "video/mp4", unusableType: "image", empty: "No files" },
  { id: "reading", App: ReadingApp, fileType: "document", mime: "application/pdf", unusableType: "image", empty: "This target cannot be used" },
];

let app: AppCase;

function item(id: string, title: string) {
  return {
    id,
    filename: `${title}.bin`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: app.fileType,
    mime_type: app.mime,
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: app.id === "video" ? 120 : null,
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

function smartFolder(id: string, name: string, query: string, fileType: string | null = null) {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: fileType,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

const path = (c: WireCall) => c.url.pathname;
const isListing = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/files`;
const isShelves = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/shelves`;
const isShelvesQuery = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/shelves/query`;
const isTagCountsQuery = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/tag-counts/query`;
/** The member evaluation: a listing that carries the Target's own free text. */
const isEvaluation = (c: WireCall) => isListing(c) && paramsOf(c, "search").includes("cats");
const isChip = (c: WireCall) =>
  (isShelves(c) || isShelvesQuery(c)) && c.url.searchParams.get("by") === "folder" && c.url.searchParams.get("per_shelf") === "1";

let wire: { calls: WireCall[] };
let members: ReturnType<typeof item>[];

function shelvesAnswer(call: WireCall) {
  const by = call.url.searchParams.get("by") ?? "all";
  const key = call.url.searchParams.get("key") ?? "all";
  const search = call.url.searchParams.get("search");
  return json({
    by,
    base: "",
    total_shelves: 1,
    shelves: [{ key, label: key, count: 1, items: [item(`s-${by}-${key}`, `${search ? `${search} ` : ""}Shelf ${by}`)] }],
  });
}

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  for (const id of ["video", "reading"] as const) resetLibraryFilters(id, DRIVE);
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("SPEC-CORE-156 $id", (appCase) => {
  beforeEach(() => {
    app = appCase;
    members = [item("m1", "Member one"), item("m2", "Member two")];
    wire = installWireFetch((call) => {
      if (path(call) === `/api/drives/${DRIVE}/smart-folders`) {
        return json([smartFolder("sf-cats", "Cats", "cats"), smartFolder("pics", "Pictures", "", app.unusableType)]);
      }
      if (path(call) === `/api/drives/${DRIVE}/collections`) return json([]);
      if (path(call) === "/api/addons/status") return json({ addons: {}, slots: {} });
      if (path(call).includes("/tag-counts")) return json([{ name: "Trip", count: 1 }]);
      if (isEvaluation(call)) return pagedListing(members, call);
      if (isListing(call)) return json({ data: [], meta: { total: 2, page: 1, limit: 12 } });
      if (isShelves(call) || isShelvesQuery(call)) return shelvesAnswer(call);
      return json([]);
    });
  });

  it("SPEC-CORE-156 I1 under a member Target the Library posts the members with search=N, and search=N alone", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats", face: "library" }, app.id);
    writeLibraryFilters(app.id, DRIVE, { tags: [], state: "all", name: NAME });
    render(<app.App drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.filter(isShelvesQuery).some((c) => !isChip(c))).toBe(true));

    const library = wire.calls.filter((c) => isShelvesQuery(c) && !isChip(c));
    for (const call of library) {
      expect(call.method).toBe("POST");
      expect(new Set(fileIdsOf(call))).toEqual(new Set(members.map((m) => m.id)));
      expect(paramsOf(call, "search")).toEqual([NAME]);
    }
    expect(wire.calls.filter(isShelves).filter((c) => !isChip(c))).toEqual([]);
    for (const call of wire.calls.filter(isChip)) expect(paramsOf(call, "search")).toEqual([]);
  });

  it("SPEC-CORE-156 I1 under a member Target tag-counts/query carries search=N alone", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats", face: "library" }, app.id);
    writeLibraryFilters(app.id, DRIVE, { tags: [], state: "all", name: NAME });
    render(<app.App drive={DRIVE} />);
    await waitFor(() => expect(wire.calls.filter(isShelvesQuery).some((c) => !isChip(c))).toBe(true));

    fireEvent.click(await screen.findByRole("button", { name: /^Tag/ }));

    await waitFor(() => expect(wire.calls.some(isTagCountsQuery)).toBe(true));
    for (const call of wire.calls.filter(isTagCountsQuery)) {
      expect(call.method).toBe("POST");
      expect(paramsOf(call, "search")).toEqual([NAME]);
    }
  });

  it("SPEC-CORE-156 I2 the member evaluation and the header count do not carry the name", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats", face: "library" }, app.id);
    writeLibraryFilters(app.id, DRIVE, { tags: [], state: "all", name: NAME });
    render(<app.App drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.filter(isShelvesQuery).some((c) => paramsOf(c, "search").includes(NAME))).toBe(true));
    expect(wire.calls.some(isEvaluation)).toBe(true);
    for (const call of wire.calls.filter(isListing)) expect(paramsOf(call, "search")).not.toContain(NAME);
  });

  it("SPEC-CORE-156 I9 I12 an unusable Target keeps its own state, draws no field, and the name stays in the store", async () => {
    writeAppPrefs(DRIVE, { target: "pics", face: "library" }, app.id);
    writeLibraryFilters(app.id, DRIVE, { tags: [], state: "all", name: NAME });
    render(<app.App drive={DRIVE} />);

    expect(await screen.findByText(app.empty)).toBeInTheDocument();
    expect(screen.queryByText("Nothing matches these filters")).toBeNull();
    expect(screen.queryByRole("button", { name: "Filter by name" })).toBeNull();
    expect(screen.queryByRole("searchbox", { name: "Filter by name" })).toBeNull();
    expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: NAME });
  });
});
