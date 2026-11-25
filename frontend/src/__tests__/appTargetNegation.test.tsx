/**
 * SPEC-CORE-177: a Smart Collection whose query holds a `-` or `has:` token and
 * no free text is a direct target in Video and Reading. Its requests carry the
 * exclusions as listing keys and go out without a member evaluation; free
 * text, and in Reading a `duration:` beside such a token, keep the member path.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { writeAppPrefs, type AppId } from "@/lib/appPrefs";
import { invalidateAddonsCache } from "@/lib/addons";
import { READING_BASE_KINDS } from "@/lib/readingAppTarget";
import { resetLibraryFilters, writeLibraryFilters } from "@/components/appshell/libraryFilters";
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
import { ReadingShelfPage } from "@/components/readingapp/ReadingShelfPage";
import { VideoApp } from "@/components/videoapp/VideoApp";
import { VideoShelfPage } from "@/components/videoapp/VideoShelfPage";

const DRIVE = "main";
const API = `/api/drives/${DRIVE}`;

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

const EVERY_KEY =
  "tag:Trip -tag:draft -type:image -path:Work -in:Old -is:favorite -is:liked has:tag -has:collection";

const FOLDERS = [
  smartFolder("sf-not-work", "Not work", "-path:Work"),
  smartFolder("sf-every", "Every key", EVERY_KEY),
  smartFolder("sf-cats", "Cats not work", "cats -path:Work"),
  smartFolder("sf-long", "Long not work", "-path:Work duration:>1h"),
  smartFolder("sf-trip", "Trip not draft", "tag:Trip -tag:draft"),
  smartFolder("sf-fun-out", "No fun", "-path:Videos/Fun"),
  smartFolder("sf-videos-no-fun", "Videos but fun", "path:Videos -path:Videos/Fun"),
  smartFolder("sf-no-video", "No videos", "-type:video"),
  smartFolder("sf-no-books", "No books here", "-type:document -type:archive"),
  smartFolder("sf-imp-tag", "Impossible tag", "tag:a -tag:a"),
  smartFolder("sf-imp-fav", "Impossible favourite", "is:favorite -is:favorite"),
  smartFolder("sf-imp-has", "Impossible has", "has:tag -has:tag"),
  smartFolder("sf-imp-path", "Impossible path", "path:A -path:A"),
  { ...smartFolder("sf-pics", "Pictures", ""), file_type: "image" },
];
const UNUSABLE = "This target cannot be used";

interface AppCase {
  id: AppId;
  kind: "video" | "document";
  base: readonly string[];
  pathname: string;
  App: (props: { drive: string }) => ReactElement;
}

const APPS: AppCase[] = [
  { id: "video", kind: "video", base: ["video"], pathname: "/drive/main/apps/video", App: VideoApp },
  {
    id: "reading",
    kind: "document",
    base: READING_BASE_KINDS,
    pathname: "/drive/main/apps/reading",
    App: ReadingApp,
  },
];

const path = (c: WireCall) => c.url.pathname;
const isListing = (c: WireCall) => path(c) === `${API}/files`;
const isShelves = (c: WireCall) => path(c) === `${API}/shelves`;
const isTagCounts = (c: WireCall) => path(c).startsWith(`${API}/tag-counts`);
const isUnderTarget = (c: WireCall) =>
  path(c) === `${API}/files` ||
  path(c) === `${API}/files/query` ||
  path(c) === `${API}/shelves` ||
  path(c) === `${API}/shelves/query` ||
  isTagCounts(c) ||
  path(c).startsWith(`${API}/folder-counts`);
const isMemberRoute = (c: WireCall) => (isUnderTarget(c) && path(c).endsWith("/query")) || fileIdsOf(c) !== null;
const isChips = (c: WireCall) =>
  isShelves(c) && c.url.searchParams.get("by") === "folder" && c.url.searchParams.get("shelf_limit") === "24";
const isCount = (c: WireCall) =>
  (isListing(c) && c.url.searchParams.get("limit") === "1") ||
  (isShelves(c) && c.url.searchParams.get("by") === "all" && c.url.searchParams.get("per_shelf") === "1");

/** A key's values from the query string and from a JSON body, as strings. */
function valuesOf(call: WireCall, key: string): string[] {
  const body = call.body as Record<string, unknown> | null;
  const fromBody = body && typeof body === "object" && key in body ? [body[key]].flat().map(String) : [];
  return [...paramsOf(call, key), ...fromBody];
}

let members: ReturnType<typeof item>[] = [];
let failShelves = false;
let wire: { calls: WireCall[] };

function shelvesAnswer(call: WireCall, kind: "video" | "document") {
  const by = call.url.searchParams.get("by") ?? "all";
  const key = call.url.searchParams.get("key") ?? "all";
  return json({ by, base: "", total_shelves: 1, shelves: [{ key, label: key, count: 1, items: [item("s1", kind)] }] });
}

let app: AppCase = APPS[0];

async function settle(ms = 100) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

const underTarget = () => wire.calls.filter(isUnderTarget);

function expectDirect() {
  expect(wire.calls.filter(isMemberRoute)).toEqual([]);
  for (const call of wire.calls.filter(isListing)) {
    expect(Number(call.url.searchParams.get("page") ?? "1")).toBe(1);
  }
}

function expectEvery(key: string, values: string[]) {
  const calls = underTarget();
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) expect(valuesOf(call, key), `${key} on ${call.url}`).toEqual(values);
}

function choose(a: AppCase, prefs: Parameters<typeof writeAppPrefs>[1]) {
  writeAppPrefs(DRIVE, prefs, a.id);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  invalidateAddonsCache();
  for (const id of ["video", "reading"] as const) resetLibraryFilters(id, DRIVE);
  nav.search = new URLSearchParams();
  nav.pathname = "/drive/main/apps/video";
  nav.replace.mockReset();
  nav.replace.mockImplementation((href: string) => {
    nav.search = new URL(href, `http://localhost${nav.pathname}`).searchParams;
  });
  app = APPS[0];
  members = [item("m1"), item("m2")];
  failShelves = false;
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
    const p = path(call);
    if (p === `${API}/smart-folders`) return json(FOLDERS);
    if (p === `${API}/collections`) return json([]);
    if (p === `${API}/home-shortcuts`) return json([]);
    if (p === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (isTagCounts(call)) {
      return json([
        { name: "Trip", count: 3 },
        { name: "Kyoto", count: 1 },
      ]);
    }
    if (isListing(call)) return pagedListing(members, call);
    if (p === `${API}/files/query`) return json({ data: [item("p1", app.kind)], meta: { total: 1, page: 1, limit: 12 } });
    if (p === `${API}/shelves` || p === `${API}/shelves/query`) {
      return failShelves ? json({ detail: "boom" }, 500) : shelvesAnswer(call, app.kind);
    }
    return json([]);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(APPS)("SPEC-CORE-177 $id: a direct target with an exclusion", (appCase) => {
  beforeEach(() => {
    app = appCase;
    nav.pathname = appCase.pathname;
    members = [item("m1", appCase.kind), item("m2", appCase.kind)];
  });

  it("SPEC-CORE-177 I2 I3 Discover sends listing requests carrying exclude_folder, and no member request", async () => {
    choose(app, { target: "sf-not-work" });
    render(<app.App drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves), "a GET shelves request under the target").toBe(true));
    await settle();

    expectDirect();
    expectEvery("exclude_folder", ["Work"]);
    for (const call of underTarget()) {
      for (const kind of valuesOf(call, "type")) expect(app.base).toContain(kind);
    }
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Not work");
  });

  it("SPEC-CORE-177 I3 Discover carries all eight keys with the query's tag", async () => {
    choose(app, { target: "sf-every" });
    render(<app.App drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves), "a GET shelves request under the target").toBe(true));
    await settle();

    expectDirect();
    expectEvery("exclude_tag", ["draft"]);
    expectEvery("exclude_type", ["image"]);
    expectEvery("exclude_folder", ["Work"]);
    expectEvery("exclude_collection", ["Old"]);
    expectEvery("favorite", ["false"]);
    expectEvery("liked", ["false"]);
    expectEvery("has_tag", ["true"]);
    expectEvery("has_collection", ["false"]);
    for (const call of underTarget()) expect(valuesOf(call, "tag")).toContain("Trip");
  });

  it("SPEC-CORE-177 I3 the Library's listing, count, folder chips and tag filter carry all eight keys", async () => {
    choose(app, { target: "sf-every", face: "library" });
    render(<app.App drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isChips), "a GET folder-chip request").toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: /^Tag/ }));
    await waitFor(() => expect(wire.calls.some(isTagCounts)).toBe(true));
    await settle();

    expect(wire.calls.some(isCount)).toBe(true);
    expect(wire.calls.some((c) => isShelves(c) && !isChips(c) && !isCount(c))).toBe(true);
    expectDirect();
    expectEvery("exclude_tag", ["draft"]);
    expectEvery("exclude_type", ["image"]);
    expectEvery("exclude_folder", ["Work"]);
    expectEvery("exclude_collection", ["Old"]);
    expectEvery("favorite", ["false"]);
    expectEvery("liked", ["false"]);
    expectEvery("has_tag", ["true"]);
    expectEvery("has_collection", ["false"]);
  });

  it("SPEC-CORE-177 I8 a tag filter adds to the target's tag and keeps its exclude_tag", async () => {
    writeLibraryFilters(app.id, DRIVE, { tags: ["Kyoto"] });
    choose(app, { target: "sf-trip", face: "library" });
    render(<app.App drive={DRIVE} />);

    await waitFor(() =>
      expect(
        wire.calls.some((c) => isShelves(c) && valuesOf(c, "tag").includes("Kyoto")),
        "a GET shelves request with the tag filter",
      ).toBe(true),
    );
    await settle();

    expectDirect();
    expectEvery("exclude_tag", ["draft"]);
    const filtered = wire.calls.filter((c) => isShelves(c) && valuesOf(c, "tag").includes("Kyoto"));
    for (const call of filtered) expect(valuesOf(call, "tag")).toContain("Trip");
  });

  it("SPEC-CORE-177 I6 more than 10,000 matching files is usable and requested directly", async () => {
    members = Array.from({ length: 10_001 }, (_, i) => item(`k${i}`, app.kind));
    choose(app, { target: "sf-not-work" });
    render(<app.App drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves), "a GET shelves request under the target").toBe(true));
    await settle();

    expect(screen.queryByText(UNUSABLE)).not.toBeInTheDocument();
    expectDirect();
    expectEvery("exclude_folder", ["Work"]);
  });

  it("SPEC-CORE-177 failure: a failed listing offers the face's retry, which asks again with the target's keys", async () => {
    failShelves = true;
    choose(app, { target: "sf-not-work" });
    render(<app.App drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves), "a GET shelves request under the target").toBe(true));
    const retry = (await screen.findAllByRole("button", { name: /retry|try again/i }))[0];
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Not work");

    failShelves = false;
    const before = wire.calls.filter(isShelves).length;
    fireEvent.click(retry);

    await waitFor(() => expect(wire.calls.filter(isShelves).length).toBeGreaterThan(before));
    await settle();
    expectDirect();
    expectEvery("exclude_folder", ["Work"]);
  });

  it("SPEC-CORE-177 I10 choosing it in the Target menu applies it directly", async () => {
    render(<app.App drive={DRIVE} />);

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
    const row = await screen.findByRole("menuitemradio", { name: "Not work" });
    expect(row).not.toBeDisabled();
    const before = wire.calls.length;
    fireEvent.click(row);

    await waitFor(() => expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Not work"));
    await waitFor(() =>
      expect(
        wire.calls.slice(before).some((c) => isShelves(c) && valuesOf(c, "exclude_folder").includes("Work")),
        "a GET shelves request carrying exclude_folder=Work",
      ).toBe(true),
    );
    await settle();
    expect(wire.calls.slice(before).filter(isMemberRoute)).toEqual([]);
  });
});

describe("SPEC-CORE-177 I5 an empty direct target requests nothing", () => {
  const IMPOSSIBLE = ["sf-imp-tag", "sf-imp-fav", "sf-imp-has", "sf-imp-path"];

  async function drawn(a: AppCase, id: string): Promise<string> {
    choose(a, { target: id });
    const view = render(<a.App drive={DRIVE} />);
    const name = FOLDERS.find((f) => f.id === id)!.name;
    await waitFor(() => expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent(name));
    await settle(300);
    const text = (document.body.textContent ?? "").replace(name, "");
    view.unmount();
    return text;
  }

  it.each(["sf-no-video", ...IMPOSSIBLE])(
    "SPEC-CORE-177 video %s draws what a Smart Collection limited to images draws, and sends no listing request",
    async (id) => {
      const imagesOnly = await drawn(APPS[0], "sf-pics");
      expect(underTarget()).toEqual([]);

      const empty = await drawn(APPS[0], id);

      expect(underTarget(), "requests under the empty target").toEqual([]);
      expect(empty).toBe(imagesOnly);
    },
  );

  it.each(["sf-no-books", ...IMPOSSIBLE])(
    "SPEC-CORE-177 reading %s keeps the target and sends no listing request",
    async (id) => {
      app = APPS[1];
      nav.pathname = APPS[1].pathname;
      await drawn(APPS[1], id);

      expect(underTarget(), "requests under the empty target").toEqual([]);
    },
  );
});

describe("SPEC-CORE-177 I8 a folder position under a target that excludes a folder", () => {
  it.each(APPS)("SPEC-CORE-177 $id narrows folder to the position and keeps exclude_folder", async (a) => {
    app = a;
    nav.pathname = a.pathname;
    nav.search = new URLSearchParams("folder=Videos");
    members = [item("m1", a.kind)];
    choose(a, { target: "sf-fun-out", face: "library" });
    const Route =
      a.id === "video"
        ? (await import("@/app/drive/[name]/apps/video/page")).default
        : (await import("@/app/drive/[name]/apps/reading/page")).default;
    render(<Route />);

    await waitFor(() =>
      expect(
        wire.calls.some((c) => isShelves(c) && !isCount(c) && valuesOf(c, "folder").includes("Videos")),
        "a Library request at the position",
      ).toBe(true),
    );
    await settle();

    expectDirect();
    expectEvery("exclude_folder", ["Videos/Fun"]);
  });
});

describe("SPEC-CORE-177 I8 a folder position inside a folder-limited target with an excluded subfolder", () => {
  it.each(APPS)("SPEC-CORE-177 $id replaces the target's folder with the position and keeps exclude_folder", async (a) => {
    app = a;
    nav.pathname = a.pathname;
    nav.search = new URLSearchParams("folder=Videos%2FStudy");
    members = [item("m1", a.kind)];
    choose(a, { target: "sf-videos-no-fun", face: "library" });
    const Route =
      a.id === "video"
        ? (await import("@/app/drive/[name]/apps/video/page")).default
        : (await import("@/app/drive/[name]/apps/reading/page")).default;
    render(<Route />);

    await waitFor(() =>
      expect(
        wire.calls.some((c) => isShelves(c) && !isCount(c) && valuesOf(c, "folder").includes("Videos/Study")),
        "a Library request at the position",
      ).toBe(true),
    );
    await settle();

    expectDirect();
    expectEvery("exclude_folder", ["Videos/Fun"]);
    for (const call of underTarget().filter((c) => isShelves(c) && !isCount(c))) {
      expect(valuesOf(call, "folder")).not.toContain("Videos");
    }
  });
});

describe("SPEC-CORE-177 section 9 the tag filter leaves out the target's own tag", () => {
  it("SPEC-CORE-177 Video's Library offers Kyoto and not the target's Trip", async () => {
    choose(APPS[0], { target: "sf-trip", face: "library" });
    render(<VideoApp drive={DRIVE} />);

    fireEvent.click(await screen.findByRole("button", { name: /^Tag/ }));

    expect(await screen.findByRole("menuitemcheckbox", { name: /Kyoto/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox", { name: /Trip/ })).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-177 I7 duration beside an exclusion", () => {
  it("SPEC-CORE-177 Video requests it directly with the duration and the exclusion", async () => {
    choose(APPS[0], { target: "sf-long" });
    render(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some(isShelves), "a GET shelves request under the target").toBe(true));
    await settle();

    expectDirect();
    expectEvery("exclude_folder", ["Work"]);
    expectEvery("duration", ["gt:3600"]);
  });

  it("SPEC-CORE-177 Reading keeps the member path: above 10,000, one listing page, then the unusable line", async () => {
    app = APPS[1];
    nav.pathname = APPS[1].pathname;
    members = Array.from({ length: 10_001 }, (_, i) => item(`k${i}`, "document"));
    choose(APPS[1], { target: "sf-long" });
    render(<ReadingApp drive={DRIVE} />);

    expect(await screen.findByText(UNUSABLE, {}, { timeout: 10_000 })).toBeInTheDocument();
    const evaluations = wire.calls.filter(isListing);
    expect(evaluations).toHaveLength(1);
    expect(paramsOf(evaluations[0], "exclude_folder")).toEqual(["Work"]);
    expect(wire.calls.filter((c) => isShelves(c) || path(c) === `${API}/shelves/query`)).toEqual([]);
  });
});

describe("SPEC-CORE-177 I7 Reading's member path at the 10,000 boundary", () => {
  it("SPEC-CORE-177 exactly 10,000 with duration and an exclusion is usable and sends every member", async () => {
    app = APPS[1];
    nav.pathname = APPS[1].pathname;
    members = Array.from({ length: 10_000 }, (_, i) => item(`k${i}`, "document"));
    choose(APPS[1], { target: "sf-long" });
    render(<ReadingApp drive={DRIVE} />);

    await waitFor(() => expect(wire.calls.some((c) => fileIdsOf(c) !== null)).toBe(true), { timeout: 10_000 });

    expect(screen.queryByText(UNUSABLE)).not.toBeInTheDocument();
    for (const call of wire.calls.filter(isListing)) expect(paramsOf(call, "exclude_folder")).toEqual(["Work"]);
    expect(new Set(fileIdsOf(wire.calls.find((c) => fileIdsOf(c) !== null)!)).size).toBe(10_000);
  });
});

describe("SPEC-CORE-177 I1 free text keeps the member path", () => {
  it("SPEC-CORE-177 Video above 10,000 with free text reads every page", async () => {
    members = Array.from({ length: 10_001 }, (_, i) => item(`k${i}`));
    choose(APPS[0], { target: "sf-cats" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText(UNUSABLE, {}, { timeout: 20_000 })).toBeInTheDocument();
    const read = wire.calls.filter((c) => isListing(c) && paramsOf(c, "search").includes("cats"));
    expect(read.length).toBeGreaterThan(1);
    for (const call of read) expect(paramsOf(call, "exclude_folder")).toEqual(["Work"]);
  }, 30_000);
});

describe("SPEC-CORE-177 I10 a ?target= link", () => {
  it("SPEC-CORE-177 Video applies it, saves it and requests it directly", async () => {
    nav.search = new URLSearchParams("target=sf-not-work");
    const VideoRoute = (await import("@/app/drive/[name]/apps/video/page")).default;
    render(<VideoRoute />);

    await waitFor(() => expect(localStorage.getItem(`litloft.videoApp.target.${DRIVE}`)).toBe("sf-not-work"));
    await waitFor(() => expect(wire.calls.some(isShelves), "a GET shelves request under the target").toBe(true));
    await settle();

    expectDirect();
    expectEvery("exclude_folder", ["Work"]);
  });
});

describe("SPEC-CORE-177 I3 the See all page", () => {
  const PAGES = [
    { app: APPS[0], render: () => render(<VideoShelfPage drive={DRIVE} by="tag" shelfKey="Trip" />) },
    {
      app: APPS[1],
      render: () =>
        render(<ReadingShelfPage drive={DRIVE} by="tag" shelfKey="Trip" folders={["Books/Novels"]} tags={["read"]} />),
    },
  ];

  it.each(PAGES)("SPEC-CORE-177 $app.id sends its shelf with the target's exclusion and its own key", async (page) => {
    app = page.app;
    nav.pathname = `${page.app.pathname}/shelf`;
    choose(page.app, { target: "sf-not-work" });
    page.render();

    await waitFor(() =>
      expect(
        wire.calls.some((c) => isShelves(c) && c.url.searchParams.get("key") === "Trip"),
        "a GET shelves request for the page's shelf",
      ).toBe(true),
    );
    await settle();

    expectDirect();
    expectEvery("exclude_folder", ["Work"]);
  });
});
