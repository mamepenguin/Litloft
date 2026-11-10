/**
 * Home's entry row: SPEC-CORE-073, invariants I1–I3, I9, I11 and I12 of
 * docs/specs/home-app-entries.md. Driven through `DriveHome`, which owns the
 * catalogue guard and the Inbox count. Labels are the English messages.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { builtinApps } from "@/lib/builtinApps";
import { driveHref } from "@/lib/driveViews";
import type { AddonMeta } from "@/lib/addons";
import type { FileItem, WatchHistoryItem, WebSocketEvent } from "@/types";
import messages from "@/messages-core/en.json";

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

// A marker on every `next/link`, so a plain `<a>` (a full document load) is told apart.
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

function addon(navigation: AddonMeta["navigation"], extra: Partial<AddonMeta> = {}): AddonMeta {
  return {
    label: "Product name",
    icon: "package",
    href: "/drive/{drive}/addons/x",
    scope: "drive",
    navigation,
    ...extra,
  };
}

/** Declared out of order, with entries that are not `primary`, so only a sorted, filtered row matches. */
const BUNDLED: Record<string, AddonMeta> = {
  zeta: addon({ label: "Zeta tools", placement: "utility", priority: 5 }),
  photo_diary: addon({ label: "Photo Diary", placement: "primary", priority: 30, icon: "images" }),
  knowledge: addon({ label: "Notes", placement: "primary", priority: 20, icon: "notebook-pen" }),
  media_import: addon({ label: "YouTube & Feeds", placement: "sources", priority: 10, icon: "rss" }),
  intelligence: addon({ label: "Ask", placement: "primary", priority: 10, icon: "message-circle-question" }),
};

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
  }) satisfies FileItem;

const watched = (id: string) =>
  ({ ...file(id), watch_progress: { position: 1, duration: 10 } }) satisfies WatchHistoryItem;

const page = (data: FileItem[]) => ({ data, meta: { total: data.length, page: 1, limit: 12 } });

function Live({ drive }: { drive: string }) {
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  (globalThis as Record<string, unknown>).__emitHomeEvent = setLastEvent;
  return (
    <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
      <DriveHome driveName={drive} />
    </WebSocketContext.Provider>
  );
}
function emit(event: string, drive: string) {
  const send = (globalThis as Record<string, unknown>).__emitHomeEvent as (e: WebSocketEvent) => void;
  act(() => send({ event, data: { drive } } as WebSocketEvent));
}

const appsNav = () => screen.getByRole("navigation", { name: "Apps" });
const findAppsNav = () => screen.findByRole("navigation", { name: "Apps" });
const entryLinks = (nav: HTMLElement) => within(nav).getAllByRole("link") as HTMLAnchorElement[];
const compact = (el: Element) => (el.textContent ?? "").replace(/\s+/g, "");
/** The URL a link opens from Home, so a relative `?view=inbox` and its absolute spelling compare equal. */
const opens = (a: HTMLAnchorElement, drive = DRIVE) => {
  const u = new URL(a.getAttribute("href")!, `http://x${enc(drive)}?view=home`);
  return `${u.pathname}${u.search}`;
};
const iconOf = (a: Element) =>
  (a.querySelector("svg")?.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.startsWith("lucide-") && c !== "lucide-icon");

const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  vi.clearAllMocks();
  mockProfile.nickname = "Alice";
  catalogue = {};
  catalogueDrive = DRIVE;
  mockGetDriveFiles.mockResolvedValue(page([file("a")]));
  mockGetWatchHistory.mockResolvedValue([watched("v1")]);
  mockGetInboxCount.mockResolvedValue(0);
});

describe("SPEC-CORE-073 I1 the entry row's place", () => {
  it("SPEC-CORE-073 I1 sits under the page header and above every row, with a profile", async () => {
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await screen.findAllByText("Clip a");

    const h1 = document.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(before(h1!, nav)).toBe(true);
    const rowHeadings = screen.getAllByRole("heading", { level: 2 });
    expect(rowHeadings.length).toBeGreaterThan(0);
    for (const h of rowHeadings) expect(before(nav, h), h.textContent ?? "").toBe(true);
  });

  it("SPEC-CORE-073 I1 is drawn without a profile", async () => {
    mockProfile.nickname = null;
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await screen.findAllByText("Clip a");

    for (const h of screen.getAllByRole("heading", { level: 2 })) expect(before(nav, h)).toBe(true);
  });

  it.each([
    ["the drive has nothing to show", "resolve", messages.empty.noHomeActivityTitle],
    ["every core request failed", "reject", messages.empty.homeUnavailableTitle],
  ])("SPEC-CORE-073 I1 stays above the empty state when %s", async (_, how, title) => {
    if (how === "resolve") {
      mockGetDriveFiles.mockResolvedValue(page([]));
      mockGetWatchHistory.mockResolvedValue([]);
    } else {
      mockGetDriveFiles.mockRejectedValue(new Error("down"));
      mockGetWatchHistory.mockRejectedValue(new Error("down"));
    }
    render(<Live drive={DRIVE} />);

    const empty = await screen.findByText(title);
    expect(before(appsNav(), empty)).toBe(true);
  });
});

describe("SPEC-CORE-073 I2 I3 the entries", () => {
  it("SPEC-CORE-073 I2 lists Library, the built-in apps, the primary addon entries by priority, then the Inbox, each to the sidebar's href", async () => {
    catalogue = BUNDLED;
    mockGetInboxCount.mockResolvedValue(3);
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(compact(entryLinks(nav).at(-1)!)).toBe("Inbox3"));

    const base = enc(DRIVE);
    expect(entryLinks(nav).map((a) => [compact(a), opens(a)])).toEqual([
      ["Library", driveHref(DRIVE, "library")],
      ["Video", builtinApps[0].route(DRIVE)],
      ["Reading", builtinApps[1].route(DRIVE)],
      ["Ask", `${base}/addons/intelligence`],
      ["Notes", `${base}/addons/knowledge`],
      ["PhotoDiary", `${base}/addons/photo_diary`],
      ["Inbox3", `${base}?view=inbox`],
    ]);
    expect(builtinApps.map((a) => a.id)).toEqual(["video", "reading"]);
  });

  it("SPEC-CORE-073 I2 draws each entry with the sidebar's icon", async () => {
    catalogue = BUNDLED;
    mockGetInboxCount.mockResolvedValue(1);
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(entryLinks(nav)).toHaveLength(7));

    expect(entryLinks(nav).map(iconOf)).toEqual([
      ["lucide-folder-tree"],
      ["lucide-film"],
      ["lucide-book-open"],
      ["lucide-message-circle-question-mark"],
      ["lucide-notebook-pen"],
      ["lucide-images"],
      ["lucide-inbox"],
    ]);
  });

  it("SPEC-CORE-073 I2 names an addon entry by its resolved key, and by its label when the key does not resolve", async () => {
    catalogue = {
      knowledge: addon({ label: "Notes", placement: "primary", priority: 1, i18n_key: "knowledge.createNote.button" }),
      intelligence: addon({ label: "Ask", placement: "primary", priority: 2, i18n_key: "intelligence.nav.missing" }),
    };
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(entryLinks(nav)).toHaveLength(5));

    expect(entryLinks(nav).slice(3).map(compact)).toEqual(["Createnote", "Ask"]);
    expect(nav.textContent).not.toContain("Product name");
    expect(nav.textContent).not.toContain("intelligence.nav.missing");
  });

  it.each([
    ["the images token", "images", "lucide-images"],
    ["an unknown token", "no-such-icon", "lucide-package"],
    ["no token", undefined, "lucide-package"],
  ])("SPEC-CORE-073 I9 draws an addon entry with %s", async (_, icon, expected) => {
    catalogue = { intelligence: addon({ label: "Ask", placement: "primary", priority: 1, icon }) };
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    const ask = await within(nav).findByRole("link", { name: "Ask" });

    expect(iconOf(ask)).toEqual([expected]);
  });

  it("SPEC-CORE-073 I2 holds only Library and the built-in apps with an empty catalogue and an empty Inbox", async () => {
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await screen.findAllByText("Clip a");
    await act(async () => {});

    expect(entryLinks(nav).map(compact)).toEqual(["Library", "Video", "Reading"]);
  });

  it.each([
    [1, "Inbox1"],
    [99, "Inbox99"],
    [100, "Inbox99+"],
    [2140, "Inbox99+"],
  ])("SPEC-CORE-073 I3 shows an Inbox count of %i as %s", async (count, text) => {
    mockGetInboxCount.mockResolvedValue(count);
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();

    await waitFor(() => expect(entryLinks(nav).map(compact)).toEqual(["Library", "Video", "Reading", text]));
  });

  it("SPEC-CORE-073 I3 asks for this drive's Inbox count", async () => {
    mockGetInboxCount.mockResolvedValue(2);
    render(<Live drive={DRIVE} />);
    await findAppsNav();

    await waitFor(() => expect(mockGetInboxCount).toHaveBeenCalled());
    expect(mockGetInboxCount.mock.calls.every(([d]) => d === DRIVE)).toBe(true);
  });

  it("SPEC-CORE-073 I3 puts the count in the Inbox link's accessible name", async () => {
    mockGetInboxCount.mockResolvedValue(3);
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();

    const inbox = await within(nav).findByRole("link", { name: /Inbox\s*3/ });
    expect(opens(inbox as HTMLAnchorElement)).toBe(`${enc(DRIVE)}?view=inbox`);
  });

  it("SPEC-CORE-073 I3 follows the count up and down on inbox.updated and drive.structure_changed", async () => {
    mockGetInboxCount.mockResolvedValue(2);
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(entryLinks(nav).map(compact)).toContain("Inbox2"));

    mockGetInboxCount.mockResolvedValue(0);
    emit("inbox.updated", DRIVE);
    await waitFor(() => expect(entryLinks(nav).map(compact)).toEqual(["Library", "Video", "Reading"]));

    mockGetInboxCount.mockResolvedValue(5);
    emit("drive.structure_changed", DRIVE);
    await waitFor(() => expect(entryLinks(nav).map(compact)).toContain("Inbox5"));
  });

  it("SPEC-CORE-073 I3 keeps the last count when a refresh of it fails", async () => {
    mockGetInboxCount.mockResolvedValue(3);
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(entryLinks(nav).map(compact)).toContain("Inbox3"));
    const asked = mockGetInboxCount.mock.calls.length;

    mockGetInboxCount.mockRejectedValue(new Error("down"));
    emit("inbox.updated", DRIVE);
    await waitFor(() => expect(mockGetInboxCount.mock.calls.length).toBeGreaterThan(asked));
    await act(async () => {});

    expect(entryLinks(nav).map(compact)).toContain("Inbox3");
  });

  it("SPEC-CORE-073 I3 draws no Inbox entry when the first count request fails", async () => {
    mockGetInboxCount.mockRejectedValue(new Error("down"));
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(mockGetInboxCount).toHaveBeenCalled());
    await act(async () => {});

    expect(entryLinks(nav).map(compact)).toEqual(["Library", "Video", "Reading"]);
  });
});

describe("SPEC-CORE-073 I3 the catalogue guard", () => {
  it.each([
    ["not loaded yet", undefined],
    ["another drive's", OTHER],
  ])("SPEC-CORE-073 I3 draws no addon entry from a catalogue that is %s", async (_, owner) => {
    catalogue = BUNDLED;
    catalogueDrive = owner;
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await screen.findAllByText("Clip a");

    expect(entryLinks(nav).map(compact)).toEqual(["Library", "Video", "Reading"]);
    expect(entryLinks(nav).some((a) => (a.getAttribute("href") ?? "").includes("/addons/"))).toBe(false);
  });

  it("SPEC-CORE-073 I3 on a drive change, drops the old drive's addon entries and Inbox until the new drive's arrive", async () => {
    catalogue = BUNDLED;
    mockGetInboxCount.mockImplementation(async (d: string) => (d === DRIVE ? 4 : new Promise<never>(() => {})));
    const view = render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(entryLinks(nav)).toHaveLength(7));

    view.rerender(<Live drive={OTHER} />);

    await waitFor(() => expect(entryLinks(appsNav()).map(compact)).toEqual(["Library", "Video", "Reading"]));
    expect(entryLinks(appsNav()).map((a) => opens(a, OTHER))).toEqual([
      driveHref(OTHER, "library"),
      builtinApps[0].route(OTHER),
      builtinApps[1].route(OTHER),
    ]);

    catalogueDrive = OTHER;
    catalogue = { knowledge: BUNDLED.knowledge };
    view.rerender(<Live drive={OTHER} />);

    await waitFor(() =>
      expect(entryLinks(appsNav()).map((a) => [compact(a), opens(a, OTHER)])).toEqual([
        ["Library", driveHref(OTHER, "library")],
        ["Video", builtinApps[0].route(OTHER)],
        ["Reading", builtinApps[1].route(OTHER)],
        ["Notes", `${enc(OTHER)}/addons/knowledge`],
      ]),
    );
  });
});

describe("SPEC-CORE-073 I11 I12 the row as navigation", () => {
  it("SPEC-CORE-073 I11 is a nav named Apps with no visible heading", async () => {
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();

    expect(nav.tagName).toBe("NAV");
    expect(nav.getAttribute("aria-label")).toBe("Apps");
    expect(within(nav).queryAllByRole("heading")).toEqual([]);
    expect(nav.textContent).not.toMatch(/\bApps\b/);
  });

  it("SPEC-CORE-073 I11 marks no entry current or selected on Home", async () => {
    catalogue = BUNDLED;
    mockGetInboxCount.mockResolvedValue(2);
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(entryLinks(nav)).toHaveLength(7));

    expect(within(nav).queryAllByRole("tab")).toEqual([]);
    for (const a of entryLinks(nav)) {
      expect(a.hasAttribute("aria-current"), compact(a)).toBe(false);
      expect(a.hasAttribute("aria-selected"), compact(a)).toBe(false);
    }
    const accentClasses = Array.from(nav.querySelectorAll<HTMLElement>("*"))
      .concat(nav)
      .flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/))
      .filter((c) => /(^|:)(bg|ring|border)-accent/.test(c));
    expect(accentClasses).toEqual([]);
  });

  it("SPEC-CORE-073 I12 makes every entry a next/link", async () => {
    catalogue = BUNDLED;
    mockGetInboxCount.mockResolvedValue(2);
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(entryLinks(nav)).toHaveLength(7));

    for (const a of entryLinks(nav)) expect(a.hasAttribute("data-next-link"), compact(a)).toBe(true);
  });
});
