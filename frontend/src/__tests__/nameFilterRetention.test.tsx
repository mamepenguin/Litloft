/**
 * SPEC-CORE-156 I4 and the loading states the acceptance tests leave:
 * a fallback to the default Target, a member re-evaluation, and the requests
 * sent while the Smart Folder list or a member evaluation is still pending.
 * Every request is answered at `fetch`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";

import { writeAppPrefs, type AppId } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import {
  readLibraryFilters,
  resetLibraryFilters,
  writeLibraryFilters,
} from "@/components/appshell/libraryFilters";
import {
  fileIdsOf,
  installWireFetch,
  json,
  pagedListing,
  paramsOf,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";
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
}

const APPS: AppCase[] = [
  { id: "video", App: VideoApp, fileType: "video", mime: "video/mp4" },
  { id: "reading", App: ReadingApp, fileType: "document", mime: "application/pdf" },
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

const path = (c: WireCall) => c.url.pathname;
const isListing = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/files`;
const isShelves = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/shelves`;
const isShelvesQuery = (c: WireCall) => path(c) === `/api/drives/${DRIVE}/shelves/query`;
const isEvaluation = (c: WireCall) => isListing(c) && paramsOf(c, "search").includes("cats");
const isChip = (c: WireCall) =>
  (isShelves(c) || isShelvesQuery(c)) &&
  c.url.searchParams.get("by") === "folder" &&
  c.url.searchParams.get("per_shelf") === "1";
/** Reading's header count asks for one shelf, as the folder chips do. */
const isCountOrChip = (c: WireCall) =>
  (isShelves(c) || isShelvesQuery(c)) && c.url.searchParams.get("per_shelf") === "1";

let wire: { calls: WireCall[] };
let members: ReturnType<typeof item>[];
let folders: Promise<Response> | Response;
let evaluationFails = () => true;
let releaseFolders: (() => void) | null = null;

function shelvesAnswer(call: WireCall) {
  const by = call.url.searchParams.get("by") ?? "all";
  const key = call.url.searchParams.get("key") ?? "all";
  const search = call.url.searchParams.get("search");
  return json({
    by,
    base: "",
    total_shelves: 1,
    shelves: [
      {
        key,
        label: key,
        count: 1,
        items: [item(`s-${by}-${key}`, `${search ? `${search} ` : ""}Shelf ${by}`)],
      },
    ],
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
  members = [];
  folders = json([]);
  evaluationFails = () => true;
  releaseFolders = null;
  wire = installWireFetch((call) => {
    if (path(call) === `/api/drives/${DRIVE}/smart-folders`) return folders;
    if (path(call) === `/api/drives/${DRIVE}/collections`) return json([]);
    if (path(call) === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (path(call).includes("/tag-counts")) return json([{ name: "Trip", count: 1 }]);
    if (isEvaluation(call)) {
      return evaluationFails()
        ? json({ detail: "boom" }, 500)
        : pagedListing(members, call);
    }
    if (isListing(call)) return json({ data: [], meta: { total: 2, page: 1, limit: 12 } });
    if (isShelves(call) || isShelvesQuery(call)) return shelvesAnswer(call);
    return json([]);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("SPEC-CORE-156 $id keeps the name", (appCase) => {
  beforeEach(() => {
    app = appCase;
    members = [item("m1", "Member one"), item("m2", "Member two")];
  });

  it("SPEC-CORE-156 I4 a saved Target that is gone falls back to default and keeps the name", async () => {
    writeAppPrefs(DRIVE, { target: "sf-gone", face: "library" }, app.id);
    writeLibraryFilters(app.id, DRIVE, { tags: [], state: "all", name: NAME });
    render(<app.App drive={DRIVE} />);

    await waitFor(() =>
      expect(
        wire.calls.filter(isShelves).some((c) => paramsOf(c, "search").includes(NAME)),
      ).toBe(true),
    );

    expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: NAME });
    for (const call of wire.calls.filter((c) => isShelves(c) && !isCountOrChip(c))) {
      expect(paramsOf(call, "search")).toEqual([NAME]);
    }
    for (const call of wire.calls.filter(isCountOrChip)) {
      expect(paramsOf(call, "search")).toEqual([]);
    }
    for (const call of wire.calls.filter(isListing)) {
      expect(paramsOf(call, "search")).not.toContain(NAME);
    }
  });

  it("SPEC-CORE-156 I4 a member re-evaluation keeps the name and the requests carry it", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats", face: "library" }, app.id);
    writeLibraryFilters(app.id, DRIVE, { tags: [], state: "all", name: NAME });
    folders = json([smartFolder("sf-cats", "Cats", "cats")]);

    render(<app.App drive={DRIVE} />);
    await screen.findByRole("button", { name: "Retry" });
    expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: NAME });

    evaluationFails = () => false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(
        wire.calls
          .filter((c) => isShelvesQuery(c) && !isChip(c))
          .some((c) => paramsOf(c, "search").includes(NAME)),
      ).toBe(true),
    );

    expect(readLibraryFilters(app.id, DRIVE)).toMatchObject({ name: NAME });
    const library = wire.calls.filter((c) => isShelvesQuery(c) && !isChip(c));
    for (const call of library) {
      expect(new Set(fileIdsOf(call))).toEqual(new Set(members.map((m) => m.id)));
      expect(paramsOf(call, "search")).toEqual([NAME]);
    }
  });

  it("SPEC-CORE-156 I1 I12 the Target list loading sends nothing, then every Library request carries the name", async () => {
    writeAppPrefs(DRIVE, { target: "sf-trips", face: "library" }, app.id);
    writeLibraryFilters(app.id, DRIVE, { tags: [], state: "all", name: NAME });
    folders = new Promise<Response>((resolve) => {
      releaseFolders = () => resolve(json([smartFolder("sf-trips", "Trips", "tag:Trip")]));
    });

    render(<app.App drive={DRIVE} />);
    await waitFor(() => expect(wire.calls.some((c) => path(c).endsWith("/smart-folders"))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));

    expect(wire.calls.filter(isShelves)).toEqual([]);
    expect(wire.calls.filter(isListing)).toEqual([]);

    releaseFolders!();
    await waitFor(() =>
      expect(wire.calls.filter(isShelves).some((c) => paramsOf(c, "search").includes(NAME))).toBe(
        true,
      ),
    );

    for (const call of wire.calls.filter((c) => isShelves(c) && !isCountOrChip(c))) {
      expect(paramsOf(call, "search")).toEqual([NAME]);
    }
    for (const call of wire.calls.filter(isCountOrChip)) {
      expect(paramsOf(call, "search")).toEqual([]);
    }
    for (const call of wire.calls.filter(isListing)) {
      expect(paramsOf(call, "search")).not.toContain(NAME);
    }
  });
});

describe.each(APPS)("SPEC-CORE-156 $id holds the name while a member is evaluated", (appCase) => {
  beforeEach(() => {
    app = appCase;
    members = [item("m1", "Member one"), item("m2", "Member two")];
  });

  it("SPEC-CORE-156 I1 I3 sends nothing under the old name while the evaluation is pending", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats", face: "library" }, app.id);
    writeLibraryFilters(app.id, DRIVE, { tags: [], state: "all", name: NAME });
    folders = json([smartFolder("sf-cats", "Cats", "cats")]);

    let release: ((response: Response) => void) | null = null;
    const evaluation = new Promise<Response>((resolve) => {
      release = resolve;
    });
    wire = installWireFetch((call) => {
      if (path(call) === `/api/drives/${DRIVE}/smart-folders`) return folders;
      if (path(call) === `/api/drives/${DRIVE}/collections`) return json([]);
      if (path(call) === "/api/addons/status") return json({ addons: {}, slots: {} });
      if (isEvaluation(call)) return evaluation;
      if (isListing(call)) return json({ data: [], meta: { total: 2, page: 1, limit: 12 } });
      if (isShelves(call) || isShelvesQuery(call)) return shelvesAnswer(call);
      return json([]);
    });

    render(<app.App drive={DRIVE} />);
    await waitFor(() => expect(wire.calls.some(isEvaluation)).toBe(true));
    await new Promise((r) => setTimeout(r, 50));

    expect(wire.calls.filter(isShelves)).toEqual([]);
    expect(wire.calls.filter(isShelvesQuery)).toEqual([]);

    release!(json({ data: members, meta: { total: members.length, page: 1, limit: 30 } }));

    await waitFor(() =>
      expect(
        wire.calls
          .filter((c) => isShelvesQuery(c) && !isChip(c))
          .some((c) => paramsOf(c, "search").includes(NAME)),
      ).toBe(true),
    );
    for (const call of wire.calls.filter((c) => isShelvesQuery(c) && !isChip(c))) {
      expect(paramsOf(call, "search")).toEqual([NAME]);
    }
  });
});
