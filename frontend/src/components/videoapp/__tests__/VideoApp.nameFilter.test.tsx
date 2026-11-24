/**
 * SPEC-CORE-156: the name filter in Video's Library. Where the field is drawn,
 * which requests carry the name as `search`, and where the name lives while
 * the page is open.
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

const NAME = "kyoto";

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

/** Every card title names the `search` it answered, so a test can tell whose answer is drawn. */
function shelves(_drive: string, params: Params) {
  const by = String(params.by);
  const prefix = params.search ? `${String(params.search)} ` : "";
  if (by === "watch") {
    return { by, total_shelves: 1, shelves: [{ key: String(params.key), label: "", count: 1, items: [item("w1", "Resume me")] }] };
  }
  if (by === "all") {
    return { by, total_shelves: 1, shelves: [{ key: "all", label: "", count: 1, items: [item("a1", `${prefix}Flat one`)] }] };
  }
  const key = by === "folder" ? "Movies" : by === "tag" ? "Trip" : by === "month" ? "2026-03" : "under_10m";
  return {
    by,
    total_shelves: 2,
    shelves: [
      { key, label: key, count: 3, items: [item(`i-${by}`, `${prefix}${by} card`)] },
      { key: `${key} again`, label: `${key} again`, count: 1, items: [item(`i-${by}-2`, `${prefix}${by} other`)] },
    ],
  };
}

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
    return json([{ name: "Trip", count: 3 }]);
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

const nameIcon = () => screen.getByRole("button", { name: "Filter by name" });
const queryNameIcon = () => screen.queryByRole("button", { name: "Filter by name" });
const nameInput = () => screen.getByRole("searchbox", { name: "Filter by name" }) as HTMLInputElement;
const queryNameInput = () => screen.queryByRole("searchbox", { name: "Filter by name" });

/** Types into the field, opening it first when it is the icon. Does not wait for the apply. */
async function typeName(text: string) {
  if (!queryNameInput()) fireEvent.click(await screen.findByRole("button", { name: "Filter by name" }));
  fireEvent.change(nameInput(), { target: { value: text } });
}

async function applyName(text: string) {
  await typeName(text);
  await waitFor(() => expect(lastLibrary().search).toBe(text.trim()));
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

const carriesName = (args: unknown[], name = NAME) => JSON.stringify(args).includes(name);

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
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  getShelves.mockReset().mockImplementation(async (d, p) => shelves(d, p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [item("n1", "Newest one")], meta: { total: 3, page: 1, limit: 12 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-156 I12 where Video's field is drawn", () => {
  it("SPEC-CORE-156 I12 on the Library, the icon sits after the tabs and outside the tablist", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    const icon = nameIcon();
    expect(screen.getByRole("tablist").contains(icon)).toBe(false);
    expect(
      screen.getByRole("tab", { name: "Library" }).compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("SPEC-CORE-156 I2 I12 Discover draws no field, and the name comes back with the Library", async () => {
    await openLibrary();
    await screen.findByText("folder card");
    await applyName(NAME);

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await screen.findByText("Resume me");
    expect(queryNameIcon()).toBeNull();
    expect(queryNameInput()).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    await waitFor(() => expect(nameInput().value).toBe(NAME));
  });

  it("SPEC-CORE-156 I12 an unusable Target draws no field", async () => {
    const first = await openLibrary();
    await screen.findByText("folder card");
    expect(nameIcon()).toBeInTheDocument();
    first.unmount();

    getSmartFolders.mockResolvedValue([smartFolder("pics", "Pictures", "", "image")]);
    const { VideoApp, prefs } = await load();
    prefs.writeAppPrefs(DRIVE, { face: "library", target: "pics" });
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("No files")).toBeInTheDocument();
    expect(queryNameIcon()).toBeNull();
    expect(queryNameInput()).toBeNull();
  });

  it("SPEC-CORE-156 I12 no field while the saved Target is still being looked up, then the field", async () => {
    let release!: (v: unknown) => void;
    getSmartFolders.mockReturnValue(new Promise((r) => (release = r)));
    await openLibrary(DRIVE, "sf-trips");
    await act(async () => {});

    expect(screen.getByRole("tab", { name: "Library" })).toBeInTheDocument();
    expect(queryNameIcon()).toBeNull();

    await act(async () => release([smartFolder("sf-trips", "Trips", "path:Movies")]));
    await screen.findByText("folder card");
    expect(nameIcon()).toBeInTheDocument();
  });
});

describe("SPEC-CORE-156 I1 the Library's requests carry the name", () => {
  it("SPEC-CORE-156 I1 the folder shelves and every grouping send search=N", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    await applyName(NAME);
    expect(lastLibrary()).toMatchObject({ by: "folder", search: NAME });
    expect(await screen.findByText(`${NAME} folder card`)).toBeInTheDocument();

    for (const [label, by] of [
      ["Tag", "tag"],
      ["Date Added", "month"],
      ["Length", "duration"],
      ["None", "all"],
    ] as const) {
      await chooseGroup(label);
      await waitFor(() => expect(lastLibrary()).toMatchObject({ by, search: NAME }));
    }
  });

  it("SPEC-CORE-156 I10 the name is sent trimmed", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    await typeName(`  ${NAME}  `);

    await waitFor(() => expect(lastLibrary().search).toBe(NAME));
    expect(libraryCalls().filter((p) => p.search !== undefined && p.search !== NAME)).toEqual([]);
  });

  it("SPEC-CORE-156 I1 the tag menu's tag-counts sends search=N", async () => {
    await openLibrary();
    await screen.findByText("folder card");
    await applyName(NAME);

    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));

    await waitFor(() => expect(tagCountCalls.length).toBeGreaterThan(0));
    expect(tagCountCalls.at(-1)!.url.searchParams.get("search")).toBe(NAME);
  });

  it("SPEC-CORE-156 I5 every Library See all link carries q=N", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    await applyName(NAME);

    await waitFor(() => {
      const urls = seeAllUrls();
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url.searchParams.get("from")).toBe("library");
        expect(url.searchParams.get("q")).toBe(NAME);
      }
    });
  });

  it("SPEC-CORE-156 I2 the header-count request never carries the name", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    await applyName(NAME);
    await screen.findByText(`${NAME} folder card`);

    expect(getDriveFiles.mock.calls.length).toBeGreaterThan(0);
    for (const call of getDriveFiles.mock.calls) expect(carriesName(call)).toBe(false);
  });

  it("SPEC-CORE-156 I2 I5 Discover's requests and See all links carry no name", async () => {
    await openLibrary();
    await screen.findByText("folder card");
    await applyName(NAME);
    const before = getShelves.mock.calls.length;

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await screen.findByText("Resume me");
    await act(async () => {});

    for (const call of getShelves.mock.calls.slice(before)) expect(carriesName(call)).toBe(false);
    for (const call of getDriveFiles.mock.calls) expect(carriesName(call)).toBe(false);
    for (const a of screen.queryAllByRole("link")) {
      expect(new URL(a.getAttribute("href") ?? "", "http://localhost").searchParams.has("q")).toBe(false);
    }
  });

  it("SPEC-CORE-156 I1 I7 × empties the name at once and no later request carries it", async () => {
    await openLibrary();
    await screen.findByText("folder card");
    await applyName(NAME);
    await screen.findByText(`${NAME} folder card`);

    fireEvent.click(screen.getByRole("button", { name: "Clear input" }));

    await waitFor(() => expect(lastLibrary().search).toBeUndefined());
    const cleared = libraryCalls().length;
    await new Promise((r) => setTimeout(r, 400));
    for (const p of libraryCalls().slice(cleared - 1)) expect(p.search).toBeUndefined();
    expect(await screen.findByText("folder card")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-156 I3 typing and the answers drawn", () => {
  it("SPEC-CORE-156 I3 quick typing sends only the last text, never a prefix", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    await typeName("k");
    await typeName("ky");
    await typeName("kyo");
    expect(libraryCalls().some((p) => p.search !== undefined)).toBe(false);

    await waitFor(() => expect(lastLibrary().search).toBe("kyo"));
    expect(libraryCalls().filter((p) => p.search !== undefined).map((p) => p.search)).not.toContain("k");
    expect(libraryCalls().filter((p) => p.search !== undefined).map((p) => p.search)).not.toContain("ky");
  });

  it("SPEC-CORE-156 I3 Enter sends the name without waiting", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    await typeName(NAME);
    fireEvent.keyDown(nameInput(), { key: "Enter" });
    await act(async () => {});

    expect(lastLibrary().search).toBe(NAME);
  });

  it("SPEC-CORE-156 I3 an answer for an older name is never drawn", async () => {
    await openLibrary();
    await screen.findByText("folder card");
    let releaseOld!: () => void;
    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (p.search === "old") await new Promise<void>((r) => (releaseOld = r));
      return shelves(d, p);
    });

    await applyName("old");
    await applyName("new");
    expect(await screen.findByText("new folder card")).toBeInTheDocument();

    await act(async () => releaseOld());
    await act(async () => {});

    expect(screen.queryByText("old folder card")).toBeNull();
    expect(screen.getByText("new folder card")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-156 I9 the filtered empty state", () => {
  it("SPEC-CORE-156 I9 a name that leaves nothing says Nothing matches these filters", async () => {
    getShelves.mockImplementation(async (d: string, p: Params) =>
      p.search !== undefined
        ? p.by === "all"
          ? { by: "all", total_shelves: 1, shelves: [{ key: "all", label: "", count: 0, items: [] }] }
          : { by: p.by, total_shelves: 0, shelves: [] }
        : shelves(d, p),
    );
    await openLibrary();
    await screen.findByText("folder card");

    await applyName("nothing-like-this");

    expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
    expect(screen.queryByText("No files")).not.toBeInTheDocument();
    expect(nameInput().value).toBe("nothing-like-this");
  });

  it("SPEC-CORE-156 a failed filtered request offers Try again and keeps the text", async () => {
    await openLibrary();
    await screen.findByText("folder card");
    getShelves.mockImplementation(async (d: string, p: Params) => {
      if (p.search !== undefined) throw new Error("boom");
      return shelves(d, p);
    });

    await typeName(NAME);

    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
    expect(nameInput().value).toBe(NAME);
    expect(libraryCalls().some((p) => p.search === NAME)).toBe(true);
  });
});

describe("SPEC-CORE-156 I4 where the name lives", () => {
  async function named() {
    const view = await openLibrary();
    await screen.findByText("folder card");
    await applyName(NAME);
    return view;
  }

  async function expectNameOn() {
    await waitFor(() => expect(nameInput().value).toBe(NAME));
    await waitFor(() => expect(lastLibrary().search).toBe(NAME));
  }

  async function expectNameOff() {
    await screen.findByRole("button", { name: "Filter by name" });
    expect(queryNameInput()).toBeNull();
    await waitFor(() => expect(lastLibrary().search).toBeUndefined());
  }

  it("SPEC-CORE-156 I4 writes the name to neither localStorage nor sessionStorage", async () => {
    const writes: string[] = [];
    for (const store of [localStorage, sessionStorage]) {
      const original = store.setItem.bind(store);
      vi.spyOn(store, "setItem").mockImplementation((key, value) => {
        writes.push(`${key}=${value}`);
        original(key, value);
      });
    }

    await named();

    expect(writes.filter((w) => w.includes(NAME))).toEqual([]);
  });

  it("SPEC-CORE-156 I4 a tab switch keeps it", async () => {
    await named();

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await screen.findByText("Resume me");
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));

    await expectNameOn();
  });

  it("SPEC-CORE-156 I4 leaving the app and coming back without a page load keeps it", async () => {
    const { unmount, VideoApp } = await named();

    unmount();
    render(<VideoApp drive={DRIVE} />);

    await expectNameOn();
  });

  it("SPEC-CORE-156 I4 text typed less than 300ms before leaving the Library is the name on return", async () => {
    const { unmount, VideoApp } = await openLibrary();
    await screen.findByText("folder card");

    await typeName(NAME);
    unmount();
    render(<VideoApp drive={DRIVE} />);

    await expectNameOn();
  });

  it("SPEC-CORE-156 I4 text typed less than 300ms before a tab switch is the name on return", async () => {
    await openLibrary();
    await screen.findByText("folder card");

    await typeName(NAME);
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await screen.findByText("Resume me");
    fireEvent.click(screen.getByRole("tab", { name: "Library" }));

    await expectNameOn();
  });

  it("SPEC-CORE-156 I4 a full page load empties it", async () => {
    const { unmount } = await named();
    unmount();

    vi.resetModules();
    const { VideoApp } = await load();
    render(<VideoApp drive={DRIVE} />);

    await screen.findByText("folder card");
    await expectNameOff();
  });

  it("SPEC-CORE-156 I4 opening the app on another drive and coming back does not bring it back", async () => {
    const { unmount, VideoApp, prefs } = await named();
    unmount();

    prefs.writeAppPrefs("other", { face: "library" });
    const other = render(<VideoApp drive="other" />);
    await screen.findByText("folder card");
    expect(queryNameInput()).toBeNull();
    other.unmount();

    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("folder card");
    await expectNameOff();
  });

  it("SPEC-CORE-156 I4 choosing another Target empties it", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-movies", "Trips", "path:Movies")]);
    await named();

    await chooseTarget("Trips");

    await expectNameOff();
  });

  it("SPEC-CORE-156 I4 re-choosing the Target in force keeps it", async () => {
    await named();

    await chooseTarget("All videos");
    await act(async () => {});

    await expectNameOn();
  });

  it("SPEC-CORE-156 I4 clearing the profile keeps it", async () => {
    const { rerender, VideoApp } = await named();

    nickname = null;
    rerender(<VideoApp drive={DRIVE} />);
    await act(async () => {});

    await expectNameOn();
  });
});
