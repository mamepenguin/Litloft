/**
 * SPEC-CORE-147: Reading's tag and state menus moved onto the core filter
 * part. Their values and the requests they drive are held by the existing
 * Library tests; these hold what changes: the candidates come from tag-counts
 * under the conditions in force, the filters live while the page is open, and
 * a filtered empty Library says so.
 *
 * The app is imported after `vi.resetModules()` in every test: the filters
 * live in a module-level store, and a fresh module graph is what a full page
 * load gives.
 */

import type { ComponentType } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DRIVE = "main";
let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/reading",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();
const getSmartFolders = vi.fn();
const getCollections = vi.fn();
const getDriveTags = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
  getDriveTags: (...args: unknown[]) => getDriveTags(...args),
}));

type Params = Record<string, unknown>;

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

function shelves(_drive: string, params: Params) {
  if (params.by === "folder" && params.per_shelf === 1) {
    return {
      by: "folder",
      base: "Books",
      total_shelves: 2,
      shelves: [
        { key: "Books/Comics", label: "Comics", count: 7, items: [book("c", "Comics")] },
        { key: "Books/Novels", label: "Novels", count: 3, items: [book("n", "Novels")] },
      ],
    };
  }
  if (params.by === "all") {
    return {
      by: "all",
      total_shelves: 1,
      shelves: [{ key: "all", label: "", count: 2, items: [book("f1", "Flat one"), book("f2", "Flat two")] }],
    };
  }
  return { by: params.by, total_shelves: 0, shelves: [] };
}

const ANSWER = [
  { name: "novel", count: 2 },
  { name: "essay", count: 1 },
];

type FetchCall = { url: URL; method: string; body: unknown };
let tagCountCalls: FetchCall[];

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
    return json(ANSWER);
  }
  return json({ detail: "Not Found" }, 404);
}

type App = ComponentType<{ drive: string }>;
type Prefs = typeof import("@/lib/appPrefs");

async function load(): Promise<{ ReadingApp: App; prefs: Prefs }> {
  const appPath = "@/components/readingapp/ReadingApp";
  const prefsPath = "@/lib/appPrefs";
  const app = await import(/* @vite-ignore */ appPath);
  const prefs = (await import(/* @vite-ignore */ prefsPath)) as Prefs;
  return { ReadingApp: app.ReadingApp as App, prefs };
}

async function openLibrary(drive = DRIVE, target?: string) {
  const { ReadingApp, prefs } = await load();
  prefs.writeAppPrefs(drive, target ? { face: "library", target } : { face: "library" }, "reading");
  const view = render(<ReadingApp drive={drive} />);
  return { ...view, ReadingApp, prefs };
}

const tagButton = () => screen.getByRole("button", { name: /^Tag/ });
const stateButton = () => screen.getByRole("button", { name: /^State/ });

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

async function chooseTarget(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: /Target/ }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: new RegExp(name) }));
}

function libraryCalls(): Params[] {
  return getShelves.mock.calls
    .map(([, params]) => params as Params)
    .filter((p) => p.by === "all" && p.per_shelf === 60);
}

const lastLibrary = () => libraryCalls().at(-1)!;

beforeEach(() => {
  vi.resetModules();
  nickname = "alice";
  localStorage.clear();
  sessionStorage.clear();
  tagCountCalls = [];
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
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
  getShelves.mockReset().mockImplementation(async (d, p) => shelves(d, p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [book("n1", "Newest one")], meta: { total: 2, page: 1, limit: 12 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
  getDriveTags.mockReset().mockResolvedValue([
    { name: "drive-wide", count: 40 },
    { name: "elsewhere", count: 9 },
  ]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-147 I3 I12 Reading's tag candidates", () => {
  it("SPEC-CORE-147 lists the tag-counts answer, not every tag of the drive", async () => {
    await openLibrary();
    await screen.findByText("Flat one");

    fireEvent.click(tagButton());

    expect(await screen.findByRole("menuitemcheckbox", { name: /novel/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: /essay/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox", { name: /drive-wide/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox", { name: /elsewhere/ })).not.toBeInTheDocument();
  });

  it("SPEC-CORE-147 I12 the request carries the chip, the state and the chosen tags", async () => {
    await openLibrary();
    await screen.findByText("Flat one");
    fireEvent.click(within(screen.getByTestId("reading-chips")).getByRole("button", { name: "Comics" }));
    await chooseState("In progress");
    await waitFor(() =>
      expect(lastLibrary()).toMatchObject({ folder: ["Books/Comics"], watch: "in_progress" }),
    );

    fireEvent.click(tagButton());
    await waitFor(() => expect(tagCountCalls).toHaveLength(1));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /essay/ }));
    await waitFor(() => expect(tagCountCalls).toHaveLength(2));

    const [first, second] = tagCountCalls;
    for (const call of [first, second]) {
      expect(call.url.pathname).toBe(`/api/drives/${DRIVE}/tag-counts`);
      expect(call.url.searchParams.getAll("folder")).toEqual(["Books/Comics"]);
      expect(call.url.searchParams.get("watch")).toBe("in_progress");
      expect(call.url.searchParams.getAll("type")).toEqual(["pdf", "epub", "archive"]);
    }
    expect(first.url.searchParams.getAll("tag")).toEqual([]);
    expect(second.url.searchParams.getAll("tag")).toEqual(["essay"]);
  });

  it("SPEC-CORE-147 I12 the request carries the Target's own conditions", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-books", "Books", "path:Books tag:novel")]);
    await openLibrary(DRIVE, "sf-books");
    await screen.findByText("Flat one");

    fireEvent.click(tagButton());
    await waitFor(() => expect(tagCountCalls).toHaveLength(1));

    const library = lastLibrary();
    for (const [key, value] of Object.entries(library)) {
      if (value === undefined || ["by", "key", "per_shelf", "shelf_limit", "sort", "order", "page", "offset"].includes(key)) continue;
      const sent = tagCountCalls[0].url.searchParams.getAll(key);
      expect(sent, key).toEqual(Array.isArray(value) ? value.map(String) : [String(value)]);
    }
    expect(tagCountCalls[0].url.searchParams.getAll("tag")).toEqual(["novel"]);
    expect(screen.queryByRole("menuitemcheckbox", { name: /novel/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("menuitemcheckbox", { name: /essay/ })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-147 Reading's filter menus", () => {
  it("SPEC-CORE-147 the State menu draws CircleCheck and the Tag menu draws Tag", async () => {
    await openLibrary();
    await screen.findByText("Flat one");

    expect(stateButton().querySelector("svg")?.getAttribute("class")).toContain("lucide-circle-check");
    expect(tagButton().querySelector("svg")?.getAttribute("class")).toContain("lucide-tag");
  });
});

describe("SPEC-CORE-147 I10 Reading's filtered empty state", () => {
  it("SPEC-CORE-147 I10 says Nothing matches these filters, not No books, when a tag leaves nothing", async () => {
    getShelves.mockImplementation(async (d: string, p: Params) =>
      p.by === "all" && p.tag !== undefined
        ? { by: "all", total_shelves: 1, shelves: [{ key: "all", label: "", count: 0, items: [] }] }
        : shelves(d, p),
    );
    await openLibrary();
    await screen.findByText("Flat one");

    await chooseTags("novel");

    expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
    expect(screen.queryByText("No books")).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-147 I5 where Reading's filters live", () => {
  async function filtered() {
    const view = await openLibrary();
    await screen.findByText("Flat one");
    await chooseTags("novel");
    await chooseState("Finished");
    await waitFor(() => expect(lastLibrary()).toMatchObject({ tag: ["novel"], watch: "finished" }));
    return view;
  }

  function expectFiltersOn() {
    expect(tagButton()).toHaveAccessibleName("Tag: novel");
    expect(stateButton()).toHaveAccessibleName("State: Finished");
  }

  function expectFiltersOff() {
    expect(tagButton()).toHaveAccessibleName("Tag: None specified");
    expect(stateButton()).toHaveAccessibleName("State: All");
  }

  it("SPEC-CORE-147 I5 writes no filter value to localStorage or sessionStorage", async () => {
    const writes: string[] = [];
    for (const store of [localStorage, sessionStorage]) {
      const original = store.setItem.bind(store);
      vi.spyOn(store, "setItem").mockImplementation((key, value) => {
        writes.push(`${key}=${value}`);
        original(key, value);
      });
    }

    await filtered();

    expect(writes.filter((w) => w.includes("novel") || w.includes("finished"))).toEqual([]);
  });

  it("SPEC-CORE-147 I5 a tab switch keeps them", async () => {
    await filtered();

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "true"));
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));

    await screen.findByText("Flat one");
    expectFiltersOn();
    expect(lastLibrary()).toMatchObject({ tag: ["novel"], watch: "finished" });
  });

  it("SPEC-CORE-147 I5 a See all round trip keeps them", async () => {
    const { unmount, ReadingApp } = await filtered();

    unmount();
    render(<ReadingApp drive={DRIVE} />);

    await screen.findByText("Flat one");
    expectFiltersOn();
    expect(lastLibrary()).toMatchObject({ tag: ["novel"], watch: "finished" });
  });

  it("SPEC-CORE-147 I5 a full page load empties them", async () => {
    const { unmount } = await filtered();
    unmount();

    vi.resetModules();
    const { ReadingApp } = await load();
    render(<ReadingApp drive={DRIVE} />);

    await screen.findByText("Flat one");
    expectFiltersOff();
    expect(lastLibrary().tag).toBeUndefined();
    expect(lastLibrary().watch).toBeUndefined();
  });

  it("SPEC-CORE-147 I5 opening the app on another drive and coming back does not bring them back", async () => {
    const { unmount, ReadingApp, prefs } = await filtered();
    unmount();

    prefs.writeAppPrefs("other", { face: "library" }, "reading");
    const other = render(<ReadingApp drive="other" />);
    await screen.findByText("Flat one");
    expectFiltersOff();
    other.unmount();

    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Flat one");
    expectFiltersOff();
  });

  it("SPEC-CORE-147 I5 opening the app on another drive without its Library still empties them", async () => {
    const { unmount, ReadingApp, prefs } = await filtered();
    unmount();

    prefs.writeAppPrefs("other", { face: "discover" }, "reading");
    const other = render(<ReadingApp drive="other" />);
    await act(async () => {});
    other.unmount();

    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Flat one");
    expectFiltersOff();
  });

  it("SPEC-CORE-147 I5 choosing another Target empties them", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-books", "Books", "path:Books")]);
    await filtered();

    await chooseTarget("Books");

    await waitFor(() => expectFiltersOff());
    await waitFor(() => expect(lastLibrary().watch).toBeUndefined());
    expect(lastLibrary().tag).toBeUndefined();
  });

  it("SPEC-CORE-147 I5 re-choosing the Target in force keeps them", async () => {
    await filtered();

    await chooseTarget("All books");

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expectFiltersOn();
    expect(lastLibrary()).toMatchObject({ tag: ["novel"], watch: "finished" });
  });
});
