/**
 * SPEC-CORE-172 sending 9, I12 and I17: a Smart Collection whose query holds a
 * `-` or `has:` token is an app target through the member path. Its evaluation
 * sends the exclusions, the requests under it carry only the members, and with
 * no free text the evaluation stops at the first page whose total exceeds
 * 10,000.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import { resolveAppTarget } from "@/lib/appTarget";
import { READING_BASE_KINDS, resolveReadingMemberTarget } from "@/lib/readingAppTarget";
import { resolveVideoMemberTarget, resolveVideoTarget } from "@/lib/videoAppTarget";
import type { FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import {
  fileIdsOf,
  installWireFetch,
  json,
  pagedListing,
  paramsOf,
  type WireCall,
} from "@/__tests__/helpers/wireFetch";
import { ReadingApp } from "@/components/readingapp/ReadingApp";
import { VideoApp } from "@/components/videoapp/VideoApp";

const DRIVE = "main";
const TARGET_KEY = `litloft.videoApp.target.${DRIVE}`;

const nav = vi.hoisted(() => ({
  search: new URLSearchParams(),
  pathname: "/drive/main/apps/video",
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
  useParams: () => ({ name: "main" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
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

function smartFolder(id: string, name: string, query: string): SmartFolder {
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

function item(id: string, fileType: "video" | "document" = "video") {
  return {
    id,
    filename: fileType === "video" ? `${id}.mp4` : `${id}.pdf`,
    title: id,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: fileType,
    mime_type: fileType === "video" ? "video/mp4" : "application/pdf",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: fileType === "video" ? 120 : null,
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

const FOLDERS = [
  smartFolder("sf-not-work", "Not work", "-path:Work"),
  smartFolder("sf-untagged", "Untagged", "-has:tag"),
  smartFolder("sf-cats", "Cats not work", "cats -path:Work"),
];
const UNUSABLE = "This target cannot be used";
const NEW_KEYS = ["exclude_tag", "exclude_type", "exclude_folder", "exclude_collection", "has_tag", "has_collection"];
const TARGET_CONDITIONS = ["search", "tag", "folder", "collection", "favorite", "liked", ...NEW_KEYS];

const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const isShelves = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves`;
const isShelvesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves/query`;
const underTarget = (c: WireCall) => isFilesQuery(c) || isShelvesQuery(c) || isShelves(c);

let members: ReturnType<typeof item>[] = [];
let wire: { calls: WireCall[] };

function shelvesAnswer(call: WireCall) {
  const by = call.url.searchParams.get("by") ?? "all";
  const key = call.url.searchParams.get("key") ?? "all";
  return json({ by, base: "", total_shelves: 1, shelves: [{ key, label: key, count: 1, items: [item("s1")] }] });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  invalidateAddonsCache();
  nav.search = new URLSearchParams();
  nav.pathname = "/drive/main/apps/video";
  nav.replace.mockReset();
  nav.replace.mockImplementation((href: string) => {
    nav.search = new URL(href, `http://localhost${nav.pathname}`).searchParams;
  });
  members = [item("m1"), item("m2"), item("b1", "document")];
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
    if (path === `/api/drives/${DRIVE}/smart-folders`) return json(FOLDERS);
    if (path === `/api/drives/${DRIVE}/collections`) return json([]);
    if (path === `/api/drives/${DRIVE}/home-shortcuts`) return json([]);
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isListing(call)) return pagedListing(members, call);
    if (isFilesQuery(call)) return json({ data: [item("p1")], meta: { total: 1, page: 1, limit: 12 } });
    if (isShelves(call) || isShelvesQuery(call)) return shelvesAnswer(call);
    if (path.includes("/tag-counts")) return json([]);
    return json([]);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-172 sending 9 resolvers", () => {
  const BASES: readonly (readonly FileKind[])[] = [["video"], ["image"], READING_BASE_KINDS];
  const NEW_TOKEN_QUERIES = ["has:tag", "-has:collection", "HAS:TAG", "x has:collection", "tag:a has:tag"];

  for (const base of BASES) {
    it.each(NEW_TOKEN_QUERIES)(`a direct target with %j is unsupported_part (${base.join(",")})`, (query) => {
      expect(resolveAppTarget(smartFolder("sf", "S", query), base)).toEqual({
        usable: false,
        reason: "unsupported_part",
      });
    });
  }

  it.each([...NEW_TOKEN_QUERIES, "-path:Work", "-tag:x", "-in:Trip", "-is:favorite"])(
    "the Video app has no direct target for %j",
    (query) => {
      expect(resolveVideoTarget(smartFolder("sf", "S", query))).toEqual({
        usable: false,
        reason: "unsupported_part",
      });
      expect(resolveVideoMemberTarget(smartFolder("sf", "S", query))).not.toBeNull();
      expect(resolveReadingMemberTarget(smartFolder("sf", "S", query))).not.toBeNull();
    },
  );
});

const evaluations = () => wire.calls.filter(isListing);

describe("SPEC-CORE-172 I12/I17 the Video app evaluates the exclusions", () => {
  it("the evaluation sends the exclusion, and every request under the target only the members", async () => {
    writeAppPrefs(DRIVE, { target: "sf-not-work" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));

    expect(evaluations().length).toBeGreaterThan(0);
    for (const call of evaluations()) {
      expect(paramsOf(call, "exclude_folder")).toEqual(["Work"]);
      expect(paramsOf(call, "search")).toEqual([]);
    }
    for (const call of wire.calls.filter(underTarget)) {
      expect(call.method).toBe("POST");
      expect(new Set(fileIdsOf(call))).toEqual(new Set(members.map((m) => m.id)));
      for (const key of TARGET_CONDITIONS) expect(paramsOf(call, key)).toEqual([]);
    }
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Not work");
  });

  it("-has:tag sends has_tag=false", async () => {
    writeAppPrefs(DRIVE, { target: "sf-untagged" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(evaluations().length).toBeGreaterThan(0));

    expect(paramsOf(evaluations()[0], "has_tag")).toEqual(["false"]);
    expect(paramsOf(evaluations()[0], "search")).toEqual([]);
  });

  it("exactly 10,000 with no free text is usable and sends every member", async () => {
    members = Array.from({ length: 10_000 }, (_, i) => item(`k${i}`));
    writeAppPrefs(DRIVE, { target: "sf-not-work" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true), { timeout: 10_000 });

    expect(screen.queryByText(UNUSABLE)).not.toBeInTheDocument();
    for (const call of evaluations()) expect(paramsOf(call, "exclude_folder")).toEqual(["Work"]);
    expect(new Set(fileIdsOf(wire.calls.find(isShelvesQuery)!)).size).toBe(10_000);
  });

  it("above 10,000 with no free text: one listing page, then the unusable line", async () => {
    members = Array.from({ length: 10_001 }, (_, i) => item(`k${i}`));
    writeAppPrefs(DRIVE, { target: "sf-not-work" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText(UNUSABLE, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(evaluations()).toHaveLength(1);
    expect(paramsOf(evaluations()[0], "exclude_folder")).toEqual(["Work"]);
    expect(wire.calls.filter(underTarget)).toEqual([]);
  });

  it("above 10,000 with free text: every page is read", async () => {
    members = Array.from({ length: 10_001 }, (_, i) => item(`k${i}`));
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText(UNUSABLE, {}, { timeout: 20_000 })).toBeInTheDocument();
    const read = evaluations().filter((c) => paramsOf(c, "search").includes("cats"));
    expect(read.length).toBeGreaterThan(1);
    for (const call of read) expect(paramsOf(call, "exclude_folder")).toEqual(["Work"]);
  }, 30_000);

  it("accepts a ?target= link to such a Smart Collection", async () => {
    nav.search = new URLSearchParams("target=sf-not-work");
    const VideoRoute = (await import("@/app/drive/[name]/apps/video/page")).default;
    render(<VideoRoute />);

    await waitFor(() => expect(localStorage.getItem(TARGET_KEY)).toBe("sf-not-work"));
    await waitFor(() => expect(evaluations().length).toBeGreaterThan(0));
    expect(paramsOf(evaluations()[0], "exclude_folder")).toEqual(["Work"]);
  });
});

describe("SPEC-CORE-172 I12/I17 the Reading app evaluates the exclusions", () => {
  beforeEach(() => {
    nav.pathname = "/drive/main/apps/reading";
  });

  it("the evaluation sends the exclusion and the requests only the members", async () => {
    writeAppPrefs(DRIVE, { target: "sf-not-work" }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));

    for (const call of evaluations()) {
      expect(paramsOf(call, "exclude_folder")).toEqual(["Work"]);
      expect(paramsOf(call, "search")).toEqual([]);
    }
    for (const call of wire.calls.filter(underTarget)) {
      expect(call.method).toBe("POST");
      for (const key of TARGET_CONDITIONS) expect(paramsOf(call, key)).toEqual([]);
    }
  });

  it("above 10,000 with no free text: one listing page, then the unusable line", async () => {
    members = Array.from({ length: 10_001 }, (_, i) => item(`k${i}`, "document"));
    writeAppPrefs(DRIVE, { target: "sf-not-work" }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    expect(await screen.findByText(UNUSABLE, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(evaluations()).toHaveLength(1);
    expect(wire.calls.filter(underTarget)).toEqual([]);
  });
});
