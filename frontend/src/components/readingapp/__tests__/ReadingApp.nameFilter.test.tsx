/**
 * SPEC-CORE-156: the name filter in Reading's Library. The Library requests
 * carry the name as `search`; the folder-chip request and the header count do
 * not; the name lives while the page is open.
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
    const prefix = params.search ? `${String(params.search)} ` : "";
    return {
      by: "all",
      total_shelves: 1,
      shelves: [{ key: "all", label: "", count: 2, items: [book("f1", `${prefix}Flat one`), book("f2", `${prefix}Flat two`)] }],
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

const NAME = "kyoto";

const nameIcon = () => screen.getByRole("button", { name: "Filter by name" });
const queryNameIcon = () => screen.queryByRole("button", { name: "Filter by name" });
const nameInput = () => screen.getByRole("searchbox", { name: "Filter by name" }) as HTMLInputElement;
const queryNameInput = () => screen.queryByRole("searchbox", { name: "Filter by name" });

async function typeName(text: string) {
  if (!queryNameInput()) fireEvent.click(await screen.findByRole("button", { name: "Filter by name" }));
  fireEvent.change(nameInput(), { target: { value: text } });
}

async function applyName(text: string) {
  await typeName(text);
  await waitFor(() => expect(lastLibrary().search).toBe(text.trim()));
}

const chipCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.by === "folder" && p.per_shelf === 1);

const carriesName = (args: unknown[]) => JSON.stringify(args).includes(NAME);

describe("SPEC-CORE-156 I12 where Reading's field is drawn", () => {
  it("SPEC-CORE-156 I12 on the Library, the icon sits after the tabs and outside the tablist", async () => {
    await openLibrary();
    await screen.findByText("Flat one");

    expect(screen.getByRole("tablist").contains(nameIcon())).toBe(false);
  });

  it("SPEC-CORE-156 I2 I12 Discover draws no field, and the name comes back with the Library", async () => {
    await openLibrary();
    await screen.findByText("Flat one");
    await applyName(NAME);

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "true"));
    expect(queryNameIcon()).toBeNull();
    expect(queryNameInput()).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    await waitFor(() => expect(nameInput().value).toBe(NAME));
  });
});

describe("SPEC-CORE-156 I1 I2 which of Reading's requests carry the name", () => {
  it("SPEC-CORE-156 I1 the Library grid sends search=N and draws its answer", async () => {
    await openLibrary();
    await screen.findByText("Flat one");

    await applyName(NAME);

    expect(await screen.findByText(`${NAME} Flat one`)).toBeInTheDocument();
  });

  it("SPEC-CORE-156 I1 the tag menu's tag-counts sends search=N", async () => {
    await openLibrary();
    await screen.findByText("Flat one");
    await applyName(NAME);

    fireEvent.click(tagButton());

    await waitFor(() => expect(tagCountCalls.length).toBeGreaterThan(0));
    expect(tagCountCalls.at(-1)!.url.searchParams.get("search")).toBe(NAME);
  });

  it("SPEC-CORE-156 I2 the folder-chip request and the header count never carry the name, and the chips stay", async () => {
    await openLibrary();
    await screen.findByText("Flat one");
    expect(chipCalls().length).toBeGreaterThan(0);

    await applyName(NAME);
    await screen.findByText(`${NAME} Flat one`);

    for (const p of chipCalls()) expect(p.search).toBeUndefined();
    for (const call of getDriveFiles.mock.calls) expect(carriesName(call)).toBe(false);
    expect(within(screen.getByTestId("reading-chips")).getByRole("button", { name: "Comics" })).toBeInTheDocument();
  });

  it("SPEC-CORE-156 I1 a chosen chip and the name go together on the grid request", async () => {
    await openLibrary();
    await screen.findByText("Flat one");
    fireEvent.click(within(screen.getByTestId("reading-chips")).getByRole("button", { name: "Comics" }));

    await applyName(NAME);

    expect(lastLibrary()).toMatchObject({ folder: ["Books/Comics"], search: NAME });
  });

  it("SPEC-CORE-156 I2 Discover's requests carry no name", async () => {
    await openLibrary();
    await screen.findByText("Flat one");
    await applyName(NAME);
    const before = getShelves.mock.calls.length;
    const beforeFiles = getDriveFiles.mock.calls.length;

    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "true"));
    await act(async () => {});

    for (const call of getShelves.mock.calls.slice(before)) expect(carriesName(call)).toBe(false);
    for (const call of getDriveFiles.mock.calls.slice(beforeFiles)) expect(carriesName(call)).toBe(false);
  });
});

describe("SPEC-CORE-156 I9 Reading's filtered empty state", () => {
  it("SPEC-CORE-156 I9 a name that leaves nothing says Nothing matches these filters, not No books", async () => {
    getShelves.mockImplementation(async (d: string, p: Params) =>
      p.by === "all" && p.search !== undefined
        ? { by: "all", total_shelves: 1, shelves: [{ key: "all", label: "", count: 0, items: [] }] }
        : shelves(d, p),
    );
    await openLibrary();
    await screen.findByText("Flat one");

    await applyName("nothing-like-this");

    expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
    expect(screen.queryByText("No books")).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-156 I4 where Reading's name lives", () => {
  async function named() {
    const view = await openLibrary();
    await screen.findByText("Flat one");
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

  it("SPEC-CORE-156 I4 a See all round trip keeps it", async () => {
    const { unmount, ReadingApp } = await named();

    unmount();
    render(<ReadingApp drive={DRIVE} />);

    await expectNameOn();
  });

  it("SPEC-CORE-156 I4 text typed less than 300ms before leaving the Library is the name on return", async () => {
    const { unmount, ReadingApp } = await openLibrary();
    await screen.findByText("Flat one");

    await typeName(NAME);
    unmount();
    render(<ReadingApp drive={DRIVE} />);

    await expectNameOn();
  });

  it("SPEC-CORE-156 I4 a full page load empties it", async () => {
    const { unmount } = await named();
    unmount();

    vi.resetModules();
    const { ReadingApp } = await load();
    render(<ReadingApp drive={DRIVE} />);

    await screen.findByText("Flat one");
    await expectNameOff();
  });

  it("SPEC-CORE-156 I4 opening the app on another drive and coming back does not bring it back", async () => {
    const { unmount, ReadingApp, prefs } = await named();
    unmount();

    prefs.writeAppPrefs("other", { face: "library" }, "reading");
    const other = render(<ReadingApp drive="other" />);
    await screen.findByText("Flat one");
    other.unmount();

    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Flat one");
    await expectNameOff();
  });

  it("SPEC-CORE-156 I4 choosing another Target empties it", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-books", "Books", "path:Books")]);
    await named();

    await chooseTarget("Books");

    await expectNameOff();
  });

  it("SPEC-CORE-156 I4 re-choosing the Target in force keeps it", async () => {
    await named();

    await chooseTarget("All books");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    await expectNameOn();
  });
});
