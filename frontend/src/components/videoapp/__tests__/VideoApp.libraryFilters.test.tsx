/**
 * SPEC-CORE-147: Video's Library tag and state filters, the tag-counts request
 * the tag menu makes, and where the filters live while the page is open.
 *
 * The app is imported after `vi.resetModules()` in every test: the filters
 * live in a module-level store, and a fresh module graph is what a full page
 * load gives.
 */

import type { ComponentType } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { DRIVE } = vi.hoisted(() => ({ DRIVE: "main" }));

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: DRIVE,
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
}));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();
const getSmartFolders = vi.fn();
const getCollections = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
}));

type Params = Record<string, unknown>;
type Candidate = { name: string; count: number };

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
    has_thumbnail: false,
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

function shelves(_drive: string, params: Params) {
  const by = String(params.by);
  if (by === "watch") {
    return { by, total_shelves: 1, shelves: [{ key: String(params.key), label: "", count: 1, items: [item("w1", "Resume me")] }] };
  }
  if (by === "all") {
    return { by, total_shelves: 1, shelves: [{ key: "all", label: "", count: 1, items: [item("a1", "Flat one")] }] };
  }
  const key = by === "folder" ? "Movies" : by === "tag" ? "Trip" : by === "month" ? "2026-03" : "under_10m";
  return {
    by,
    total_shelves: 1,
    shelves: [{ key, label: key, count: 3, items: [item(`i-${by}`, `${by} card`)] }],
  };
}

const ANSWER: Candidate[] = [
  { name: "Trip", count: 3 },
  { name: "Cats", count: 1 },
];

type FetchCall = { url: URL; method: string; body: unknown };
let tagCountCalls: FetchCall[];
let tagCountsAnswer: () => Promise<Response>;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://localhost");
  if (url.pathname.includes("/tag-counts")) {
    tagCountCalls.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return tagCountsAnswer();
  }
  return json({ detail: "Not Found" }, 404);
}

type App = ComponentType<{ drive: string }>;
type Prefs = typeof import("@/lib/appPrefs");

async function load(): Promise<{ VideoApp: App; prefs: Prefs }> {
  const appPath = "@/components/videoapp/VideoApp";
  const prefsPath = "@/lib/appPrefs";
  const app = await import(/* @vite-ignore */ appPath);
  const prefs = (await import(/* @vite-ignore */ prefsPath)) as Prefs;
  return { VideoApp: app.VideoApp as App, prefs };
}

async function openLibrary(drive = DRIVE, target?: string) {
  const { VideoApp, prefs } = await load();
  prefs.writeAppPrefs(drive, target ? { face: "library", target } : { face: "library" });
  const view = render(<VideoApp drive={drive} />);
  return { ...view, VideoApp, prefs };
}

const tagButton = () => screen.getByRole("button", { name: /^Tag/ });

async function chooseTags(...names: string[]) {
  fireEvent.click(await screen.findByRole("button", { name: /^Tag/ }));
  for (const name of names) {
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: new RegExp(name) }));
  }
  fireEvent.keyDown(tagButton(), { key: "Escape" });
}

async function chooseState(label: string) {
  fireEvent.click(await screen.findByRole("button", { name: /^State/ }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: label }));
}

async function chooseGroup(label: string) {
  fireEvent.click(await screen.findByRole("button", { name: /Group By/ }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: label }));
}

async function chooseTarget(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: new RegExp(name) }));
}

function libraryCalls(): Params[] {
  return getShelves.mock.calls
    .map(([, params]) => params as Params)
    .filter((p) => p.by !== "watch" || p.key === undefined)
    .filter((p) => p.per_shelf === 5 || p.per_shelf === 60 || p.per_shelf === 12);
}

const lastLibrary = () => libraryCalls().at(-1)!;

function seeAllUrls(): URL[] {
  return screen
    .getAllByRole("link", { name: /See all/ })
    .map((a) => new URL(a.getAttribute("href") ?? "", "http://localhost"));
}

beforeEach(() => {
  vi.resetModules();
  nickname = "alice";
  localStorage.clear();
  sessionStorage.clear();
  tagCountCalls = [];
  tagCountsAnswer = async () => json(ANSWER);
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  getShelves.mockReset().mockImplementation(async (d, p) => shelves(d, p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [item("n1", "Newest one")], meta: { total: 3, page: 1, limit: 12 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-147 the Library's filter menus", () => {
  it("SPEC-CORE-147 draws Tag and State before Group By and Sort", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    const order = [/^Tag/, /^State/, /^Group By/, /^Sort/].map((name) => screen.getByRole("button", { name }));
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("SPEC-CORE-147 offers All, Unwatched, In Progress and Watched in the State menu", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    fireEvent.click(screen.getByRole("button", { name: /^State/ }));

    const options = screen.getAllByRole("menuitemradio").map((r) => r.textContent?.trim());
    expect(options).toEqual(["All", "Unwatched", "In Progress", "Watched"]);
    expect(screen.getByRole("menuitemradio", { name: "All" })).toHaveAttribute("aria-checked", "true");
  });

  it("SPEC-CORE-147 I4 the folder shelves, their See all links and every grouping carry the tags and the state", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    await chooseTags("Trip", "Cats");
    await chooseState("Watched");

    await waitFor(() => expect(lastLibrary()).toMatchObject({ by: "folder", tag: ["Trip", "Cats"], watch: "finished" }));
    await waitFor(() => {
      const urls = seeAllUrls();
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url.searchParams.getAll("tag")).toEqual(["Trip", "Cats"]);
        expect(url.searchParams.get("watch")).toBe("finished");
      }
    });

    for (const [label, by] of [
      ["Tag", "tag"],
      ["Date Added", "month"],
      ["Length", "duration"],
      ["None", "all"],
    ] as const) {
      await chooseGroup(label);
      await waitFor(() => expect(lastLibrary()).toMatchObject({ by, tag: ["Trip", "Cats"], watch: "finished" }));
    }
  });

  it("SPEC-CORE-147 I4 each state option sends its watch value", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    for (const [label, watch] of [
      ["Unwatched", "unwatched"],
      ["In Progress", "in_progress"],
      ["Watched", "finished"],
    ] as const) {
      await chooseState(label);
      await waitFor(() => expect(lastLibrary()).toMatchObject({ watch }));
    }
    await chooseState("All");
    await waitFor(() => expect(lastLibrary().watch).toBeUndefined());
  });

  it("SPEC-CORE-147 Any clears the tags from the requests", async () => {
    await openLibrary();
    await screen.findByText("folder card");
    await chooseTags("Trip");
    await waitFor(() => expect(lastLibrary()).toMatchObject({ tag: ["Trip"] }));

    fireEvent.click(tagButton());
    fireEvent.click(await screen.findByText("Any"));

    await waitFor(() => expect(lastLibrary().tag).toBeUndefined());
    expect(tagButton()).toHaveAccessibleName("Tag: None specified");
  });
});

describe("SPEC-CORE-147 I12 the tag-counts request", () => {
  it("SPEC-CORE-147 I12 carries the Library's conditions, the state and the chosen tags, and goes again after a toggle", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-trips", "Trips", "tag:Trip path:Movies")]);
    await openLibrary(DRIVE, "sf-trips");
    await screen.findByText("folder card");
    await chooseState("In Progress");
    await waitFor(() => expect(lastLibrary()).toMatchObject({ watch: "in_progress" }));

    fireEvent.click(tagButton());
    await waitFor(() => expect(tagCountCalls).toHaveLength(1));
    const first = tagCountCalls[0];
    expect(first.method).toBe("GET");
    expect(first.url.pathname).toBe(`/api/drives/${DRIVE}/tag-counts`);
    expect(first.url.searchParams.get("watch")).toBe("in_progress");
    const library = lastLibrary();
    for (const [key, value] of Object.entries(library)) {
      if (value === undefined || ["by", "key", "per_shelf", "shelf_limit", "sort", "order", "page", "offset"].includes(key)) continue;
      const sent = first.url.searchParams.getAll(key);
      expect(sent, key).toEqual(Array.isArray(value) ? value.map(String) : [String(value)]);
    }

    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Cats/ }));

    await waitFor(() => expect(tagCountCalls).toHaveLength(2));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(tagCountCalls[1].url.searchParams.getAll("tag")).toEqual(
      expect.arrayContaining(["Cats"]),
    );
    expect(tagCountCalls[1].url.searchParams.get("watch")).toBe("in_progress");
  });

  it("SPEC-CORE-147 I3 leaves the Target's own tag out of the candidates", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-trips", "Trips", "tag:Trip")]);
    await openLibrary(DRIVE, "sf-trips");
    await screen.findByText("folder card");

    fireEvent.click(tagButton());

    expect(await screen.findByRole("menuitemcheckbox", { name: /Cats/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox", { name: /Trip/ })).not.toBeInTheDocument();
  });

  it("SPEC-CORE-147 I9 a failing tag-counts leaves the chosen tags and the Library's results as they were", async () => {
    await openLibrary();
    await screen.findByText("folder card");
    await chooseTags("Trip");
    await waitFor(() => expect(lastLibrary()).toMatchObject({ tag: ["Trip"] }));
    const before = libraryCalls().length;

    tagCountsAnswer = async () => json({ detail: "boom" }, 500);
    fireEvent.click(tagButton());

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(tagButton()).toHaveAccessibleName("Tag: Trip");
    expect(screen.getByText("folder card")).toBeInTheDocument();
    expect(libraryCalls()).toHaveLength(before);
  });
});

describe("SPEC-CORE-147 I6 without a profile", () => {
  it("SPEC-CORE-147 I6 draws the tag menu but no state menu, and sends no watch", async () => {
    nickname = null;
    await openLibrary();
    await screen.findByText("folder card");

    expect(tagButton()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^State/ })).not.toBeInTheDocument();
    await chooseTags("Trip");
    await waitFor(() => expect(lastLibrary()).toMatchObject({ tag: ["Trip"] }));
    expect(libraryCalls().every((p) => p.watch === undefined)).toBe(true);
    await waitFor(() => expect(tagCountCalls.length).toBeGreaterThan(0));
    expect(tagCountCalls.every((c) => !c.url.searchParams.has("watch"))).toBe(true);
  });

  it("SPEC-CORE-147 I6 clearing the profile sets the state to All", async () => {
    const { rerender, VideoApp } = await openLibrary();
    await screen.findByText("folder card");
    await chooseState("Watched");
    await waitFor(() => expect(lastLibrary()).toMatchObject({ watch: "finished" }));

    nickname = null;
    rerender(<VideoApp drive={DRIVE} />);

    await waitFor(() => expect(lastLibrary().watch).toBeUndefined());
    expect(screen.queryByRole("button", { name: /^State/ })).not.toBeInTheDocument();

    nickname = "alice";
    rerender(<VideoApp drive={DRIVE} />);
    expect(await screen.findByRole("button", { name: /^State/ })).toHaveAccessibleName("State: All");
  });
});

describe("SPEC-CORE-147 I10 the filtered empty state", () => {
  function emptyWhenFiltered(_d: string, p: Params) {
    if (p.tag !== undefined || p.watch !== undefined) {
      return p.by === "all"
        ? { by: "all", total_shelves: 1, shelves: [{ key: "all", label: "", count: 0, items: [] }] }
        : { by: p.by, total_shelves: 0, shelves: [] };
    }
    return shelves(_d, p);
  }

  it("SPEC-CORE-147 I10 says Nothing matches these filters, not No files, when a tag leaves nothing", async () => {
    getShelves.mockImplementation(async (d, p) => emptyWhenFiltered(d, p));
    await openLibrary();
    await screen.findByText("folder card");

    await chooseTags("Trip");

    expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
    expect(screen.queryByText("No files")).not.toBeInTheDocument();
  });

  it("SPEC-CORE-147 I10 says Nothing matches these filters when a state leaves nothing in the None grid", async () => {
    getShelves.mockImplementation(async (d, p) => emptyWhenFiltered(d, p));
    await openLibrary();
    await screen.findByText("folder card");
    await chooseGroup("None");
    await screen.findByText("Flat one");

    await chooseState("Unwatched");

    expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
    expect(screen.queryByText("No files")).not.toBeInTheDocument();
  });

  it("SPEC-CORE-147 I10 goes back to No files once the filters are cleared", async () => {
    getShelves.mockImplementation(async (_d, p: Params) => ({ by: p.by, total_shelves: 0, shelves: [] }));
    await openLibrary();
    expect(await screen.findByText("No files")).toBeInTheDocument();

    await chooseTags("Trip");
    expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
    expect(screen.queryByText("No files")).not.toBeInTheDocument();

    fireEvent.click(tagButton());
    fireEvent.click(await screen.findByText("Any"));

    expect(await screen.findByText("No files")).toBeInTheDocument();
    expect(screen.queryByText("Nothing matches these filters")).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-147 I5 where the filters live", () => {
  async function filtered() {
    const view = await openLibrary();
    await screen.findByText("folder card");
    await chooseTags("Trip");
    await chooseState("Watched");
    await waitFor(() => expect(lastLibrary()).toMatchObject({ tag: ["Trip"], watch: "finished" }));
    return view;
  }

  function expectFiltersOn() {
    expect(tagButton()).toHaveAccessibleName("Tag: Trip");
    expect(screen.getByRole("button", { name: /^State/ })).toHaveAccessibleName("State: Watched");
  }

  function expectFiltersOff() {
    expect(tagButton()).toHaveAccessibleName("Tag: None specified");
    expect(screen.getByRole("button", { name: /^State/ })).toHaveAccessibleName("State: All");
  }

  it("SPEC-CORE-147 I5 writes no filter value to localStorage or sessionStorage", async () => {
    const writes: string[] = [];
    const record = (store: Storage) => {
      const original = store.setItem.bind(store);
      vi.spyOn(store, "setItem").mockImplementation((key, value) => {
        writes.push(`${key}=${value}`);
        original(key, value);
      });
    };
    record(localStorage);
    record(sessionStorage);

    await filtered();

    expect(writes.filter((w) => w.includes("Trip") || w.includes("finished"))).toEqual([]);
  });

  it("SPEC-CORE-147 I5 a tab switch keeps them", async () => {
    await filtered();

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await screen.findByText("Resume me");
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));

    await screen.findByRole("button", { name: /^Tag/ });
    expectFiltersOn();
    await waitFor(() => expect(lastLibrary()).toMatchObject({ tag: ["Trip"], watch: "finished" }));
  });

  it("SPEC-CORE-147 I5 leaving the app and coming back without a page load keeps them", async () => {
    const { unmount, VideoApp } = await filtered();

    unmount();
    render(<VideoApp drive={DRIVE} />);

    await screen.findByText("folder card");
    expectFiltersOn();
    expect(lastLibrary()).toMatchObject({ tag: ["Trip"], watch: "finished" });
  });

  it("SPEC-CORE-147 I5 a full page load empties them", async () => {
    const { unmount } = await filtered();
    unmount();

    vi.resetModules();
    const { VideoApp } = await load();
    render(<VideoApp drive={DRIVE} />);

    await screen.findByText("folder card");
    expectFiltersOff();
    expect(lastLibrary().tag).toBeUndefined();
    expect(lastLibrary().watch).toBeUndefined();
  });

  it("SPEC-CORE-147 I5 opening the app on another drive and coming back does not bring them back", async () => {
    const { unmount, VideoApp, prefs } = await filtered();
    unmount();

    prefs.writeAppPrefs("other", { face: "library" });
    const other = render(<VideoApp drive="other" />);
    await screen.findByText("folder card");
    expectFiltersOff();
    other.unmount();

    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("folder card");
    expectFiltersOff();
  });

  it("SPEC-CORE-147 I5 opening the app on another drive without its Library still empties them", async () => {
    const { unmount, VideoApp, prefs } = await filtered();
    unmount();

    prefs.writeAppPrefs("other", { face: "discover" });
    const other = render(<VideoApp drive="other" />);
    await act(async () => {});
    other.unmount();

    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("folder card");
    expectFiltersOff();
  });

  it("SPEC-CORE-147 I5 choosing another Target empties them", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-movies", "Trips", "path:Movies")]);
    await filtered();

    await chooseTarget("Trips");

    await waitFor(() => expectFiltersOff());
    await waitFor(() => expect(lastLibrary().watch).toBeUndefined());
    expect(lastLibrary().tag).toBeUndefined();
  });

  it("SPEC-CORE-147 I5 re-choosing the Target in force keeps them", async () => {
    await filtered();

    await chooseTarget("All videos");

    await act(async () => {});
    expectFiltersOn();
    expect(lastLibrary()).toMatchObject({ tag: ["Trip"], watch: "finished" });
  });
});

afterEach(() => cleanup());
