/**
 * SPEC-CORE-153: app shortcuts (`kind: "app_target"`) on Home's entry row, with
 * SPEC-CORE-073 I2, SPEC-CORE-100 I5 and SPEC-CORE-114 I2 as SPEC-CORE-153
 * revises them. Driven through `DriveHome`; the shortcuts and the entry
 * visibility are answered at `fetch`. Labels are the English messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { BookOpen, Film, Library, Newspaper, NotebookPen } from "lucide-react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { builtinApps } from "@/lib/builtinApps";
import { collectionHref } from "@/lib/driveViews";
import type { AddonMeta } from "@/lib/addons";
import type { FileItem } from "@/types";
import messages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";

const DRIVE = "家族ビデオ & co";
const OTHER = "archive";
const enc = (drive: string) => `/drive/${encodeURIComponent(drive)}`;

const mockProfile = { nickname: "Alice" as string | null, setNickname: vi.fn(), clearNickname: vi.fn() };
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => mockProfile,
  ProfileProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

let catalogue: Record<string, AddonMeta> = {};
let catalogueDrive: string | null | undefined = DRIVE;
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: catalogue,
    catalogueDrive,
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams("view=home"),
  usePathname: () => enc(DRIVE),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}));

const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
const mockGetInboxCount = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
  getInboxCount: (...args: unknown[]) => mockGetInboxCount(...args),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DriveHome } from "@/components/DriveHome";

// ---- the wire ---------------------------------------------------------------

interface Shortcut {
  kind: "smart_folder" | "pin" | "collection" | "app_target";
  id: string;
  name: string;
  query: string | null;
  file_type: string | null;
  app: string | null;
}

let shortcuts: Shortcut[] = [];
let hidden: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, "http://x").pathname;
  if (/^\/api\/drives\/[^/]+\/home-shortcuts$/.test(path)) return jsonResponse(shortcuts);
  if (/\/drives\/[^/]+\/entry-visibility/.test(path)) return jsonResponse({ hidden });
  throw new TypeError(`unexpected fetch ${url}`);
});

// ---- fixtures ---------------------------------------------------------------

function addon(navigation: unknown, extra: Partial<AddonMeta> = {}): AddonMeta {
  return {
    label: "Product name",
    icon: "package",
    href: "/drive/{drive}/addons/x",
    scope: "drive",
    navigation: navigation as AddonMeta["navigation"],
    ...extra,
  };
}

/** Notes and Clips, the two entrances of one addon. */
const KNOWLEDGE: Record<string, AddonMeta> = {
  knowledge: addon([
    { label: "Notes", placement: "primary", priority: 20, icon: "notebook-pen" },
    { label: "Clips", placement: "primary", priority: 21, icon: "newspaper", path: "clips" },
  ]),
};

const appShortcut = (app: string, id: string, name: string): Shortcut => ({
  kind: "app_target",
  id,
  name,
  app,
  query: null,
  file_type: null,
});

const COL: Shortcut = { kind: "collection", id: "col000000001", name: "Reading list", query: null, file_type: null, app: null };

const file = (id: string) =>
  ({
    id,
    filename: `${id}.mp4`,
    title: `Clip ${id}`,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 120,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified" as const,
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
    modified_at: null,
  }) satisfies FileItem;

const page = (data: FileItem[]) => ({ data, meta: { total: data.length, page: 1, limit: 12 } });

function Home({ drive }: { drive: string }) {
  return (
    <WebSocketContext.Provider value={{ lastEvent: null, connected: true }}>
      <DriveHome driveName={drive} />
    </WebSocketContext.Provider>
  );
}

const appsNav = () => screen.getByRole("navigation", { name: "Apps" });
const findAppsNav = () => screen.findByRole("navigation", { name: "Apps" });
const entryLinks = (nav: HTMLElement) => within(nav).getAllByRole("link") as HTMLAnchorElement[];
const compact = (el: Element) => (el.textContent ?? "").replace(/\s+/g, "");
const labels = () => entryLinks(appsNav()).map(compact);
const opens = (a: HTMLAnchorElement, drive = DRIVE) => {
  const u = new URL(a.getAttribute("href")!, `http://x${enc(drive)}?view=home`);
  return `${u.pathname}${u.search}`;
};
const iconOf = (el: Element) =>
  (el.querySelector("svg")?.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.startsWith("lucide-") && c !== "lucide-icon");
function iconClass(Icon: typeof Film): string[] {
  const { container, unmount } = render(<Icon />);
  const classes = iconOf(container);
  unmount();
  return classes;
}

const withTarget = (href: string, id: string) => `${href}?target=${encodeURIComponent(id)}`;
const tileFor = (label: string) => within(appsNav()).getByRole("link", { name: label }) as HTMLAnchorElement;

/** Waits until the row holds Reading, which appears once the visibility list has arrived. */
async function loadedRow() {
  const nav = await findAppsNav();
  await waitFor(() => expect(within(nav).getAllByRole("link").map(compact)).toContain("Reading"));
  await screen.findAllByText("Clip a");
  await act(async () => {});
  return nav;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProfile.nickname = "Alice";
  catalogue = {};
  catalogueDrive = DRIVE;
  shortcuts = [];
  hidden = [];
  mockGetDriveFiles.mockResolvedValue(page([file("a")]));
  mockGetWatchHistory.mockResolvedValue([]);
  mockGetInboxCount.mockResolvedValue(0);
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-153 I3 I9 an app shortcut tile", () => {
  it("SPEC-CORE-153 I9 labels the tile with the entry's label and the target's name, and names the link by it", async () => {
    shortcuts = [appShortcut("video", "sf0000000001", "Recipes")];
    render(<Home drive={DRIVE} />);
    await loadedRow();

    const tile = await within(appsNav()).findByRole("link", { name: "Video · Recipes" });
    expect(tile.textContent?.replace(/\s+/g, " ").trim()).toBe("Video · Recipes");
  });

  it("SPEC-CORE-153 I3 links each built-in app's shortcut to its entry's href with the target, URL-encoded", async () => {
    shortcuts = [
      appShortcut("video", "collection:ab12cd34", "Trip"),
      appShortcut("reading", "sf0000000002", "Novels"),
      appShortcut("video", "sf a&b=c", "Odd"),
    ];
    render(<Home drive={DRIVE} />);
    await loadedRow();
    await within(appsNav()).findByRole("link", { name: "Video · Trip" });

    expect(opens(tileFor("Video · Trip"))).toBe(`${builtinApps[0].route(DRIVE)}?target=collection%3Aab12cd34`);
    expect(opens(tileFor("Reading · Novels"))).toBe(withTarget(builtinApps[1].route(DRIVE), "sf0000000002"));
    const odd = new URL(tileFor("Video · Odd").getAttribute("href")!, "http://x");
    expect(odd.pathname).toBe(builtinApps[0].route(DRIVE));
    expect([...odd.searchParams.keys()]).toEqual(["target"]);
    expect(odd.searchParams.get("target")).toBe("sf a&b=c");
  });

  it("SPEC-CORE-153 I3 links Notes' and Clips' shortcuts to their own entries", async () => {
    catalogue = KNOWLEDGE;
    shortcuts = [
      appShortcut("knowledge", "collection:c1", "レシピ"),
      appShortcut("knowledge/clips", "sf0000000003", "Cooking"),
    ];
    render(<Home drive={DRIVE} />);
    await loadedRow();
    await within(appsNav()).findByRole("link", { name: "Notes · レシピ" });

    expect(opens(tileFor("Notes · レシピ"))).toBe(withTarget(`${enc(DRIVE)}/addons/knowledge`, "collection:c1"));
    expect(opens(tileFor("Clips · Cooking"))).toBe(withTarget(`${enc(DRIVE)}/addons/knowledge/clips`, "sf0000000003"));
  });

  it("SPEC-CORE-153 I3 draws each tile with its entry's icon", async () => {
    catalogue = KNOWLEDGE;
    shortcuts = [
      appShortcut("video", "sf1", "A"),
      appShortcut("reading", "sf2", "B"),
      appShortcut("knowledge", "sf3", "C"),
      appShortcut("knowledge/clips", "sf4", "D"),
    ];
    render(<Home drive={DRIVE} />);
    await loadedRow();
    await within(appsNav()).findByRole("link", { name: "Clips · D" });

    const expected = [Film, BookOpen, NotebookPen, Newspaper].map(iconClass);
    expect(expected.every((c) => c.length === 1)).toBe(true);
    expect(["Video · A", "Reading · B", "Notes · C", "Clips · D"].map((l) => iconOf(tileFor(l)))).toEqual(expected);
  });

  it("SPEC-CORE-153 I9 draws two tiles for the same id in two apps", async () => {
    catalogue = KNOWLEDGE;
    shortcuts = [
      appShortcut("knowledge", "collection:c1", "Shared"),
      appShortcut("knowledge/clips", "collection:c1", "Shared"),
    ];
    render(<Home drive={DRIVE} />);
    await loadedRow();
    await within(appsNav()).findByRole("link", { name: "Clips · Shared" });

    expect(within(appsNav()).getAllByRole("link", { name: /Shared/ })).toHaveLength(2);
    expect(opens(tileFor("Notes · Shared"))).not.toBe(opens(tileFor("Clips · Shared")));
  });

  it("SPEC-CORE-153 I9 uses the entry's current label and the name the response carries", async () => {
    catalogue = {
      knowledge: addon([
        { label: "Memo", placement: "primary", priority: 20, icon: "notebook-pen" },
        { label: "Clips", placement: "primary", priority: 21, icon: "newspaper", path: "clips" },
      ]),
    };
    shortcuts = [appShortcut("knowledge", "sf1", "Renamed target")];
    render(<Home drive={DRIVE} />);
    await loadedRow();

    expect(await within(appsNav()).findByRole("link", { name: "Memo · Renamed target" })).toBeInTheDocument();
  });

  it("SPEC-CORE-153 makes the app shortcut tile a next/link", async () => {
    shortcuts = [appShortcut("video", "sf1", "A")];
    render(<Home drive={DRIVE} />);
    await loadedRow();

    expect((await within(appsNav()).findByRole("link", { name: "Video · A" })).hasAttribute("data-next-link")).toBe(true);
  });

  it("SPEC-CORE-153 drive.appShortcutLabel puts the app first in en and ja, joined as the spec says", () => {
    const en = (messages as { drive: Record<string, string> }).drive.appShortcutLabel;
    const ja = (jaMessages as { drive: Record<string, string> }).drive.appShortcutLabel;
    expect(en).toMatch(/^\{\w+\} · \{\w+\}$/);
    expect(ja).toBe(en.replace(" · ", "・"));
  });
});

describe("SPEC-CORE-073 I2 / SPEC-CORE-100 I4 as revised: the tile among the shortcuts", () => {
  it("SPEC-CORE-153 keeps the response's order among the other shortcuts, after the addon entries", async () => {
    catalogue = KNOWLEDGE;
    shortcuts = [COL, appShortcut("video", "sf1", "Recipes"), { ...COL, id: "col2", name: "Later" }];
    render(<Home drive={DRIVE} />);
    await loadedRow();
    await within(appsNav()).findByRole("link", { name: "Video · Recipes" });

    expect(labels()).toEqual(["Library", "Video", "Reading", "Notes", "Clips", "Readinglist", "Video·Recipes", "Later"]);
    expect(opens(entryLinks(appsNav())[5])).toBe(collectionHref({ drive: DRIVE, id: COL.id }));
    expect(iconOf(entryLinks(appsNav())[5])).toEqual(iconClass(Library));
  });
});

describe("SPEC-CORE-153 I3 a shortcut whose entry is not drawn", () => {
  it("SPEC-CORE-153 I3 draws no tile for a key no drawn entry has, and draws the others", async () => {
    shortcuts = [
      appShortcut("knowledge", "sf1", "Notes target"),
      appShortcut("knowledge/clips", "sf2", "Clips target"),
      appShortcut("photo_diary", "sf3", "Diary target"),
      appShortcut("video", "sf4", "Kept"),
    ];
    render(<Home drive={DRIVE} />);
    await loadedRow();

    await within(appsNav()).findByRole("link", { name: "Video · Kept" });
    expect(labels()).toEqual(["Library", "Video", "Reading", "Video·Kept"]);
  });

  it.each([
    ["not loaded yet", undefined],
    ["another drive's", OTHER],
  ])("SPEC-CORE-153 I3 draws no addon app tile from a catalogue that is %s", async (_, owner) => {
    catalogue = KNOWLEDGE;
    catalogueDrive = owner;
    shortcuts = [appShortcut("knowledge", "sf1", "Notes target"), appShortcut("reading", "sf2", "Kept")];
    render(<Home drive={DRIVE} />);
    await loadedRow();

    await within(appsNav()).findByRole("link", { name: "Reading · Kept" });
    expect(labels()).toEqual(["Library", "Video", "Reading", "Reading·Kept"]);
  });

  it("SPEC-CORE-114 I2 as revised: a hidden built-in removes its entry and its app shortcuts", async () => {
    hidden = ["video"];
    shortcuts = [appShortcut("video", "sf1", "Gone"), appShortcut("reading", "sf2", "Kept")];
    render(<Home drive={DRIVE} />);
    await loadedRow();

    await within(appsNav()).findByRole("link", { name: "Reading · Kept" });
    expect(labels()).toEqual(["Library", "Reading", "Reading·Kept"]);
  });

  it("SPEC-CORE-114 I2 as revised: hiding Clips removes Clips' shortcuts and keeps Notes'", async () => {
    catalogue = KNOWLEDGE;
    hidden = ["knowledge/clips"];
    shortcuts = [appShortcut("knowledge/clips", "sf1", "Gone"), appShortcut("knowledge", "sf1", "Kept")];
    render(<Home drive={DRIVE} />);
    await loadedRow();

    await within(appsNav()).findByRole("link", { name: "Notes · Kept" });
    expect(labels()).toEqual(["Library", "Video", "Reading", "Notes", "Notes·Kept"]);
  });
});
