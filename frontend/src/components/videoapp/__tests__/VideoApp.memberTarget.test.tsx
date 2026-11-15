/**
 * SPEC-CORE-117: a Smart Collection target with free text is a member target.
 * The app evaluates it, then sends every request under it through the POST
 * routes with `file_ids` = the members and none of the query's own conditions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import {
  fileIdsOf,
  installWireFetch,
  json,
  never,
  pagedListing,
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

function item(id: string, title: string, fileType = "video") {
  return {
    id,
    filename: `${title}.mp4`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: fileType,
    mime_type: fileType === "video" ? "video/mp4" : "image/jpeg",
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

const MEMBERS = [item("m1", "Member one"), item("m2", "Member two"), item("m3", "Member pic", "image")];
const TARGET_CONDITIONS = ["search", "tag", "folder", "collection", "size", "duration", "favorite", "liked"];
const UNUSABLE = "This target cannot be used";

const isListing = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files`;
const isShelves = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves`;
const isFilesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/files/query`;
const isShelvesQuery = (c: WireCall) => c.url.pathname === `/api/drives/${DRIVE}/shelves/query`;
const isEvaluation = (c: WireCall) => isListing(c) && c.url.searchParams.has("search");

function shelvesAnswer(call: WireCall) {
  const by = call.url.searchParams.get("by") ?? "all";
  const key = call.url.searchParams.get("key") ?? "all";
  return json({
    by,
    total_shelves: 1,
    shelves: [{ key, label: key, count: 1, items: [item(`s-${by}-${key}`, `Shelf ${by} ${key}`)] }],
  });
}

let members = MEMBERS;
let evaluation: (call: WireCall) => Response | Promise<Response>;
const addon = { on: false, statusFails: false, searchFails: false };
let wire: { calls: WireCall[] };

function install() {
  wire = installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === `/api/drives/${DRIVE}/smart-folders`) {
      return json([
        smartFolder("sf-cats", "Cats", "cats"),
        smartFolder("sf-neg", "Not drafts", "-tag:draft"),
        smartFolder("sf-mixed", "Cat trips", "cats tag:Trip"),
      ]);
    }
    if (path === "/api/addons/status") {
      if (addon.statusFails) return json({ detail: "boom" }, 500);
      return json({
        addons: addon.on ? { intelligence: { label: "Intelligence", icon: "sparkles" } } : {},
        slots: {},
      });
    }
    if (path.startsWith("/api/addons/intelligence/search")) {
      return addon.searchFails ? json({ detail: "boom" }, 500) : json({ available: true, results: [] });
    }
    if (isEvaluation(call)) return evaluation(call);
    if (isListing(call)) return json({ data: [item("d1", "Default video")], meta: { total: 42, page: 1, limit: 12 } });
    if (isFilesQuery(call)) return json({ data: [item("p1", "Posted video")], meta: { total: 7, page: 1, limit: 12 } });
    if (isShelves(call) || isShelvesQuery(call)) return shelvesAnswer(call);
    return json([]);
  });
}

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  members = MEMBERS;
  evaluation = (call) => pagedListing(members, call);
  addon.on = false;
  addon.statusFails = false;
  addon.searchFails = false;
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
  install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function targetRequests(calls: WireCall[]) {
  return calls.filter((c) => isFilesQuery(c) || isShelvesQuery(c));
}

describe("SPEC-CORE-117 I8 a member target sends its members, not its conditions", () => {
  it.each([
    ["free text", "sf-cats"],
    ["a negated token, free text to the parser", "sf-neg"],
    ["free text with an operator", "sf-mixed"],
  ])("Discover (%s): every request goes through a POST route with file_ids = the members", async (_label, target) => {
    writeAppPrefs(DRIVE, { target });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(targetRequests(wire.calls).length).toBeGreaterThan(0));
    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));

    for (const call of targetRequests(wire.calls)) {
      expect(call.method).toBe("POST");
      expect(new Set(fileIdsOf(call))).toEqual(new Set(MEMBERS.map((m) => m.id)));
      for (const key of TARGET_CONDITIONS) expect(paramsOf(call, key)).toEqual([]);
      for (const kind of paramsOf(call, "type")) expect(kind).toBe("video");
    }
    expect(wire.calls.filter(isShelves)).toEqual([]);
    expect(wire.calls.filter((c) => isListing(c) && !isEvaluation(c))).toEqual([]);
  });

  it("the Library's own requests go through the POST shelves route with the members", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats", face: "library" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));

    for (const call of wire.calls.filter(isShelvesQuery)) {
      expect(new Set(fileIdsOf(call))).toEqual(new Set(MEMBERS.map((m) => m.id)));
      for (const key of TARGET_CONDITIONS) expect(paramsOf(call, key)).toEqual([]);
    }
    expect(wire.calls.filter(isShelves)).toEqual([]);
  });

  it("10,000 members are sent whole", async () => {
    members = Array.from({ length: 10_000 }, (_, i) => item(`k${i}`, `Many ${i}`));
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(targetRequests(wire.calls).length).toBeGreaterThan(0), { timeout: 10_000 });

    expect(new Set(fileIdsOf(targetRequests(wire.calls)[0]))).toEqual(new Set(members.map((m) => m.id)));
    expect(screen.queryByText(UNUSABLE)).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-117 step 4, I8: nothing goes out under the target while it evaluates", () => {
  it("sends no shelf or listing request and keeps the target's name", async () => {
    evaluation = () => never();
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isEvaluation)).toBe(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(wire.calls.filter((c) => isShelves(c) || isShelvesQuery(c) || isFilesQuery(c))).toEqual([]);
    expect(await screen.findByRole("button", { name: /Target/ })).toHaveTextContent("Cats");
  });
});

describe("SPEC-CORE-117 step 9, I8: a failed evaluation", () => {
  it("replaces the body with one retry control, keeps the name, and retry evaluates again", async () => {
    let fail = true;
    evaluation = (call) => (fail ? json({ detail: "boom" }, 500) : pagedListing(members, call));
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    const retry = await screen.findByRole("button", { name: /retry/i });
    expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Cats");
    expect(screen.queryByText(UNUSABLE)).not.toBeInTheDocument();
    expect(wire.calls.filter((c) => isShelves(c) || isShelvesQuery(c) || isFilesQuery(c))).toEqual([]);
    expect(wire.calls.filter((c) => isListing(c) && !isEvaluation(c))).toEqual([]);

    fail = false;
    const before = wire.calls.filter(isEvaluation).length;
    fireEvent.click(retry);

    await waitFor(() => expect(wire.calls.filter(isEvaluation).length).toBeGreaterThan(before));
    await waitFor(() => expect(targetRequests(wire.calls).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-117 step 9, I8: more than 10,000 members", () => {
  it("replaces the body with the unusable line, sends nothing, and keeps the name", async () => {
    // Counted before narrowing to video: most of these are pictures.
    members = [
      item("v0", "Only video"),
      ...Array.from({ length: 10_000 }, (_, i) => item(`p${i}`, `Pic ${i}`, "image")),
    ];
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText(UNUSABLE, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Cats");
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(wire.calls.filter((c) => isShelves(c) || isShelvesQuery(c) || isFilesQuery(c))).toEqual([]);
  });
});

describe("SPEC-CORE-117 step 9, I8: an evaluation that could not read the whole set", () => {
  it.each([
    [
      "the meaning search answers 500",
      () => {
        addon.on = true;
        addon.searchFails = true;
      },
    ],
    [
      "the addon status lookup fails",
      () => {
        addon.statusFails = true;
      },
    ],
  ])("%s: one retry control and nothing under the target", async (_label, arrange) => {
    arrange();
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findAllByRole("button", { name: /retry/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Cats");
    expect(wire.calls.filter((c) => isShelves(c) || isShelvesQuery(c) || isFilesQuery(c))).toEqual([]);
    expect(wire.calls.filter((c) => isListing(c) && !isEvaluation(c))).toEqual([]);
  });
});

describe("SPEC-CORE-117 step 6, I8: no Discover cache under a member target", () => {
  it("a second visit evaluates again and draws nothing from the first visit before it is ready", async () => {
    writeAppPrefs(DRIVE, { target: "sf-cats" });
    const first = render(<VideoApp drive={DRIVE} />);
    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));
    await waitFor(() => expect(screen.queryAllByText(/^Shelf /).length).toBeGreaterThan(0));
    const drawn = screen.queryAllByText(/^Shelf /).map((el) => el.textContent);
    first.unmount();

    evaluation = () => never();
    const evaluated = wire.calls.filter(isEvaluation).length;
    render(<VideoApp drive={DRIVE} />);
    await waitFor(() => expect(wire.calls.filter(isEvaluation).length).toBeGreaterThan(evaluated));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    for (const text of drawn) expect(screen.queryByText(text!)).not.toBeInTheDocument();
  });
});
