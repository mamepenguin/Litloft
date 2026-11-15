/**
 * SPEC-CORE-117 in the Reading app: a Smart Collection with free text is a
 * member target, always usable, evaluated and sent as `file_ids`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import { READING_BASE_KINDS } from "@/lib/readingAppTarget";
import {
  fileIdsOf,
  installWireFetch,
  json,
  pagedListing,
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

function book(id: string, title: string, mime = "application/pdf") {
  return {
    id,
    filename: `${title}.pdf`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "Books",
    file_type: "document",
    mime_type: mime,
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

const FOLDERS = [
  smartFolder("sf-neg", "Unread", "-tag:read"),
  smartFolder("sf-long", "Long cats", "cats duration:>1h"),
  smartFolder("sf-negop", "Not pdf cats", "cats !type:pdf"),
  smartFolder("sf-length", "Long books", "duration:>1h"),
];
const MEMBERS = [book("m1", "Member one"), book("m2", "Member two")];
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
    base: "",
    total_shelves: 1,
    shelves: [{ key, label: key, count: 1, items: [book(`s-${by}-${key}`, `Shelf ${by} ${key}`)] }],
  });
}

let members = MEMBERS;
let evaluation: (call: WireCall) => Response | Promise<Response>;
let wire: { calls: WireCall[] };

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  members = MEMBERS;
  evaluation = (call) => pagedListing(members, call);
  wire = installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === `/api/drives/${DRIVE}/smart-folders`) return json(FOLDERS);
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isEvaluation(call)) return evaluation(call);
    if (isListing(call)) return json({ data: [book("d1", "Default book")], meta: { total: 42, page: 1, limit: 12 } });
    if (isFilesQuery(call)) return json({ data: [book("p1", "Posted book")], meta: { total: 7, page: 1, limit: 12 } });
    if (isShelves(call) || isShelvesQuery(call)) return shelvesAnswer(call);
    return json([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-117 step 7, I9: a Smart Collection with free text is never disabled", () => {
  it.each(["Unread", "Long cats", "Not pdf cats"])("the Target menu offers %s", async (name) => {
    render(<ReadingApp drive={DRIVE} />);

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    const row = await screen.findByRole("menuitemradio", { name });

    expect(row).not.toBeDisabled();
    expect(screen.getByRole("menuitemradio", { name: "Long books" })).toBeDisabled();
  });

  it("Manage… offers every one of them", async () => {
    render(<ReadingApp drive={DRIVE} />);

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Manage/ }));
    await screen.findByRole("dialog");

    for (const name of ["Unread", "Long cats", "Not pdf cats"]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeDisabled();
    }
    expect(screen.getByRole("checkbox", { name: "Long books" })).toBeDisabled();
  });
});

describe("SPEC-CORE-117 I8: a member target's requests", () => {
  it.each([
    ["Discover", "sf-long", undefined],
    ["Library", "sf-neg", "library" as const],
  ])("%s goes through the POST routes with the members and the base kinds only", async (_face, target, face) => {
    writeAppPrefs(DRIVE, face ? { target, face } : { target }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));

    const posted = wire.calls.filter((c) => isShelvesQuery(c) || isFilesQuery(c));
    for (const call of posted) {
      expect(call.method).toBe("POST");
      expect(new Set(fileIdsOf(call))).toEqual(new Set(MEMBERS.map((m) => m.id)));
      for (const key of TARGET_CONDITIONS) expect(paramsOf(call, key)).toEqual([]);
      for (const kind of paramsOf(call, "type")) {
        expect(READING_BASE_KINDS as readonly string[]).toContain(kind);
      }
    }
    expect(wire.calls.filter(isShelves)).toEqual([]);
    expect(wire.calls.filter((c) => isListing(c) && !isEvaluation(c))).toEqual([]);
    expect(screen.queryByText(UNUSABLE)).not.toBeInTheDocument();
  });

  it("a negated kind is free text: the base kinds are not narrowed by it", async () => {
    writeAppPrefs(DRIVE, { target: "sf-negop" }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelvesQuery)).toBe(true));

    const kinds = new Set(wire.calls.filter(isShelvesQuery).flatMap((c) => paramsOf(c, "type")));
    expect(kinds).toEqual(new Set(READING_BASE_KINDS));
  });
});

describe("SPEC-CORE-117 step 9, I8: failure and too large", () => {
  it("a failed evaluation leaves one retry control and the target's name", async () => {
    evaluation = () => json({ detail: "boom" }, 500);
    writeAppPrefs(DRIVE, { target: "sf-neg" }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    await screen.findByRole("button", { name: /retry/i });
    expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Unread");
    expect(wire.calls.filter((c) => isShelves(c) || isShelvesQuery(c) || isFilesQuery(c))).toEqual([]);
  });

  it("more than 10,000 members show the unusable line and send nothing", async () => {
    members = Array.from({ length: 10_001 }, (_, i) => book(`b${i}`, `Book ${i}`));
    writeAppPrefs(DRIVE, { target: "sf-neg" }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    expect(await screen.findByText(UNUSABLE, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Unread");
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(wire.calls.filter((c) => isShelves(c) || isShelvesQuery(c) || isFilesQuery(c))).toEqual([]);
    expect(wire.calls.some(isEvaluation)).toBe(true);
  });
});
