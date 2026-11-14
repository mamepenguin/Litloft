/**
 * SPEC-CORE-101 (with SPEC-CORE-100's GET): the drive's Home shortcuts in the
 * entry row, driven through `DriveHome`. The request is answered at `fetch`, so
 * the test does not depend on what `lib/api` names its wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { Folder, Library, ListFilter } from "lucide-react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { builtinApps } from "@/lib/builtinApps";
import { collectionHref, driveHref, smartFolderHref } from "@/lib/driveViews";
import { pinHrefFor } from "@/components/sidebar/libraryRowActive";
import type { AddonMeta } from "@/lib/addons";
import type { FileItem, WatchHistoryItem, WebSocketEvent } from "@/types";
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

// ---- the shortcuts endpoint, answered at fetch ---------------------------------

interface Shortcut {
  kind: "smart_folder" | "pin" | "collection";
  id: string;
  name: string;
  query: string | null;
  file_type: string | null;
}

interface Deferred {
  resolve: (items: Shortcut[]) => void;
  fail: (status?: number) => void;
}

type Answer = Shortcut[] | "fail" | "network" | "pending";

/** Requests to `.../home-shortcuts`, by the drive named in the URL. */
const shortcutCalls: { drive: string; method: string }[] = [];
let answerFor: (drive: string) => Answer = () => [];
const pending: { drive: string; d: Deferred }[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function shortcutsDrive(url: string): string | null {
  const path = new URL(url, "http://x").pathname;
  const m = /^\/api\/drives\/([^/]+)\/home-shortcuts$/.exec(path);
  return m ? decodeURIComponent(m[1]) : null;
}

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const drive = shortcutsDrive(url);
  if (drive === null) throw new TypeError(`unexpected fetch ${url}`);
  const method = (init?.method ?? "GET").toUpperCase();
  shortcutCalls.push({ drive, method });
  const answer = answerFor(drive);
  if (answer === "fail") return jsonResponse({ detail: "boom" }, 500);
  if (answer === "network") throw new TypeError("Failed to fetch");
  if (answer === "pending") {
    return new Promise<Response>((resolve) => {
      pending.push({
        drive,
        d: {
          resolve: (items) => resolve(jsonResponse(items)),
          fail: (status = 500) => resolve(jsonResponse({ detail: "boom" }, status)),
        },
      });
    });
  }
  return jsonResponse(answer);
});

const getsFor = (drive: string) => shortcutCalls.filter((c) => c.drive === drive && c.method === "GET");

// ---- fixtures ---------------------------------------------------------------

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

const BUNDLED: Record<string, AddonMeta> = {
  knowledge: addon({ label: "Notes", placement: "primary", priority: 20, icon: "notebook-pen" }),
  intelligence: addon({ label: "Ask", placement: "primary", priority: 10, icon: "message-circle-question" }),
};

const SF: Shortcut = { kind: "smart_folder", id: "sf0000000001", name: "Lectures", query: "lecture tag:math", file_type: "video" };
const SF_NO_TYPE: Shortcut = { kind: "smart_folder", id: "sf0000000002", name: "Everything", query: "x", file_type: null };
const PIN: Shortcut = { kind: "pin", id: "Projects/Alpha & Beta/papers", name: "papers", query: null, file_type: null };
const COL: Shortcut = { kind: "collection", id: "col000000001", name: "Reading list", query: null, file_type: null };
const OTHER_COL: Shortcut = { kind: "collection", id: "col000000099", name: "Archive picks", query: null, file_type: null };

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
  (globalThis as Record<string, unknown>).__emitShortcutHomeEvent = setLastEvent;
  return (
    <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
      <DriveHome driveName={drive} />
    </WebSocketContext.Provider>
  );
}
function emit(event: string, drive: string) {
  const send = (globalThis as Record<string, unknown>).__emitShortcutHomeEvent as (e: WebSocketEvent) => void;
  act(() => send({ event, data: { drive } } as WebSocketEvent));
}

const appsNav = () => screen.getByRole("navigation", { name: "Apps" });
const findAppsNav = () => screen.findByRole("navigation", { name: "Apps" });
const entryLinks = (nav: HTMLElement) => within(nav).getAllByRole("link") as HTMLAnchorElement[];
const compact = (el: Element) => (el.textContent ?? "").replace(/\s+/g, "");
const labels = () => entryLinks(appsNav()).map(compact);
/** The URL an href opens from Home, so relative and absolute spellings compare equal. */
const normal = (href: string, drive = DRIVE) => {
  const u = new URL(href, `http://x${enc(drive)}?view=home`);
  return `${u.pathname}${u.search}`;
};
const iconOf = (el: Element) =>
  (el.querySelector("svg")?.getAttribute("class") ?? "").split(/\s+/).filter((c) => c.startsWith("lucide-") && c !== "lucide-icon");
function iconClass(Icon: typeof ListFilter): string[] {
  const { container, unmount } = render(<Icon />);
  const classes = iconOf(container);
  unmount();
  return classes;
}

const hrefFor = (s: Shortcut, drive = DRIVE) =>
  s.kind === "smart_folder"
    ? smartFolderHref({ drive, id: s.id, query: s.query!, file_type: s.file_type })
    : s.kind === "pin"
      ? pinHrefFor(enc(drive), s.id)
      : collectionHref({ drive, id: s.id });

const CORE = ["Library", "Video", "Reading"];
const name = (s: Shortcut) => s.name.replace(/\s+/g, "");

beforeEach(() => {
  vi.clearAllMocks();
  mockProfile.nickname = "Alice";
  catalogue = {};
  catalogueDrive = DRIVE;
  shortcutCalls.length = 0;
  pending.length = 0;
  answerFor = () => [];
  mockGetDriveFiles.mockResolvedValue(page([file("a")]));
  mockGetWatchHistory.mockResolvedValue([watched("v1")]);
  mockGetInboxCount.mockResolvedValue(0);
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-101 I4 I5 the shortcuts in the entry row", () => {
  it("SPEC-CORE-101 I4 draws the shortcuts after every addon entry and before the Inbox, in response order", async () => {
    catalogue = BUNDLED;
    catalogueDrive = DRIVE;
    mockGetInboxCount.mockResolvedValue(3);
    answerFor = () => [COL, SF, PIN];
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();
    await waitFor(() => expect(labels()).toContain(name(COL)));
    await waitFor(() => expect(labels().at(-1)).toBe("Inbox3"));

    expect(labels()).toEqual([...CORE, "Ask", "Notes", name(COL), name(SF), name(PIN), "Inbox3"]);
    expect(within(nav).queryAllByRole("heading")).toEqual([]);
    expect(within(nav).queryAllByRole("separator")).toEqual([]);
    expect(nav.querySelectorAll("hr")).toHaveLength(0);
    expect(entryLinks(nav).slice(0, 5).map((a) => normal(a.getAttribute("href")!))).toEqual([
      driveHref(DRIVE, "library"),
      builtinApps[0].route(DRIVE),
      builtinApps[1].route(DRIVE),
      `${enc(DRIVE)}/addons/intelligence`,
      `${enc(DRIVE)}/addons/knowledge`,
    ]);
  });

  it("SPEC-CORE-101 I4 keeps the response's order rather than sorting by name or kind", async () => {
    const zeta = { ...COL, id: "col0000000zz", name: "Zeta" };
    const alpha = { ...SF, id: "sf000000000a", name: "Alpha" };
    const mid = { ...PIN, id: "m/Mid", name: "Mid" };
    answerFor = () => [zeta, mid, alpha];
    render(<Live drive={DRIVE} />);
    await findAppsNav();

    await waitFor(() => expect(labels()).toEqual([...CORE, "Zeta", "Mid", "Alpha"]));
  });

  it("SPEC-CORE-101 I5 links each shortcut to the sidebar's destination for it", async () => {
    answerFor = () => [SF, SF_NO_TYPE, PIN, COL];
    render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(labels()).toHaveLength(7));

    const tiles = entryLinks(appsNav()).slice(3);
    expect(tiles.map((a) => normal(a.getAttribute("href")!))).toEqual(
      [SF, SF_NO_TYPE, PIN, COL].map((s) => normal(hrefFor(s))),
    );
    const sfUrl = new URL(tiles[0].getAttribute("href")!, "http://x");
    expect(sfUrl.pathname).toBe(`${enc(DRIVE)}/search`);
    expect(sfUrl.searchParams.get("q")).toBe(SF.query);
    expect(sfUrl.searchParams.get("type")).toBe("video");
    expect(sfUrl.searchParams.get("smart_folder_id")).toBe(SF.id);
    expect(new URL(tiles[1].getAttribute("href")!, "http://x").searchParams.has("type")).toBe(false);
    expect(normal(tiles[2].getAttribute("href")!)).toBe(
      `${enc(DRIVE)}/Projects/${encodeURIComponent("Alpha & Beta")}/papers`,
    );
    expect(normal(tiles[3].getAttribute("href")!)).toBe(`${enc(DRIVE)}/collections/${COL.id}`);
  });

  it("SPEC-CORE-106 I1 / SPEC-CORE-101 I5 draws each kind with the sidebar's icon, ListFilter for a Smart Collection", async () => {
    answerFor = () => [SF, PIN, COL];
    render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(labels()).toHaveLength(6));
    const tiles = entryLinks(appsNav()).slice(3);

    const expected = [iconClass(ListFilter), iconClass(Folder), iconClass(Library)];
    expect(expected.every((c) => c.length === 1)).toBe(true);
    expect(tiles.map(iconOf)).toEqual(expected);
  });

  it("SPEC-CORE-101 I5 shows the name the response carries, and names the link by it", async () => {
    answerFor = () => [{ ...COL, name: "Renamed list" }, { ...SF, name: "Renamed search" }];
    render(<Live drive={DRIVE} />);
    const nav = await findAppsNav();

    expect(await within(nav).findByRole("link", { name: "Renamed list" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Renamed search" })).toBeInTheDocument();
    expect(nav.textContent).not.toContain(COL.name);
    expect(nav.textContent).not.toContain(SF.name);
  });

  it("SPEC-CORE-101 makes every shortcut tile a next/link", async () => {
    answerFor = () => [SF, PIN, COL];
    render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(labels()).toHaveLength(6));

    for (const a of entryLinks(appsNav()).slice(3)) expect(a.hasAttribute("data-next-link"), compact(a)).toBe(true);
  });

  it.each([
    ["one", 1],
    ["twenty", 20],
  ])("SPEC-CORE-101 draws all of %s shortcuts, with no count limit", async (_, n) => {
    const many = Array.from({ length: n }, (_, i) => ({ ...COL, id: `col${String(i).padStart(9, "0")}`, name: `Set ${i}` }));
    mockGetInboxCount.mockResolvedValue(2);
    answerFor = () => many;
    render(<Live drive={DRIVE} />);
    await findAppsNav();

    await waitFor(() => expect(labels()).toEqual([...CORE, ...many.map(name), "Inbox2"]));
  });
});

describe("SPEC-CORE-101 when the GET is sent", () => {
  it("SPEC-CORE-101 asks for this drive's shortcuts with a GET on mount", async () => {
    render(<Live drive={DRIVE} />);
    await findAppsNav();

    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(1));
    expect(shortcutCalls.every((c) => c.drive === DRIVE && c.method === "GET")).toBe(true);
  });

  it("SPEC-CORE-101 asks again on a nickname change", async () => {
    const view = render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(1));

    mockProfile.nickname = "Bob";
    view.rerender(<Live drive={DRIVE} />);

    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(2));
  });

  it("SPEC-CORE-101 asks again from Try again on home-unavailable", async () => {
    mockGetDriveFiles.mockRejectedValue(new Error("down"));
    mockGetWatchHistory.mockRejectedValue(new Error("down"));
    render(<Live drive={DRIVE} />);
    await screen.findByText(messages.empty.homeUnavailableTitle);
    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(1));

    mockGetDriveFiles.mockResolvedValue(page([file("a")]));
    mockGetWatchHistory.mockResolvedValue([watched("v1")]);
    fireEvent.click(screen.getByRole("button", { name: messages.errors.tryAgain }));

    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(2));
  });

  it.each([
    ["drive.structure_changed"],
    ["drive.file_updated"],
  ])("SPEC-CORE-101 does not ask again when %s refreshes the rows", async (event) => {
    answerFor = () => [COL];
    render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(labels()).toContain(name(COL)));
    expect(getsFor(DRIVE)).toHaveLength(1);
    const rowsAsked = mockGetDriveFiles.mock.calls.length;

    emit(event, DRIVE);
    await waitFor(() => expect(mockGetDriveFiles.mock.calls.length).toBeGreaterThan(rowsAsked));
    await act(async () => {});

    expect(getsFor(DRIVE)).toHaveLength(1);
    expect(labels()).toContain(name(COL));
  });
});

describe("SPEC-CORE-101 I7 a failed GET", () => {
  it.each([
    ["a 5xx", "fail" as const],
    ["a network error", "network" as const],
  ])("SPEC-CORE-101 I7 on %s draws the row without shortcuts and every other entry as before", async (_, how) => {
    catalogue = BUNDLED;
    mockGetInboxCount.mockResolvedValue(3);
    answerFor = () => how;
    render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(1));
    await waitFor(() => expect(labels().at(-1)).toBe("Inbox3"));
    await screen.findAllByText("Clip a");
    await act(async () => {});

    expect(labels()).toEqual([...CORE, "Ask", "Notes", "Inbox3"]);
    expect(screen.queryByText(messages.empty.homeUnavailableTitle)).toBeNull();
  });

  it("SPEC-CORE-101 I7 a failed GET alone never produces home-unavailable", async () => {
    answerFor = () => "fail";
    mockGetWatchHistory.mockRejectedValue(new Error("down"));
    render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(1));
    await screen.findAllByText("Clip a");
    await act(async () => {});

    expect(screen.queryByText(messages.empty.homeUnavailableTitle)).toBeNull();
  });

  it("SPEC-CORE-101 I7 a successful GET does not hold off home-unavailable when every core row failed", async () => {
    answerFor = () => [COL];
    mockGetDriveFiles.mockRejectedValue(new Error("down"));
    mockGetWatchHistory.mockRejectedValue(new Error("down"));
    render(<Live drive={DRIVE} />);
    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(1));

    expect(await screen.findByText(messages.empty.homeUnavailableTitle)).toBeInTheDocument();
  });

  it("SPEC-CORE-101 a failed GET empties the drive's shortcuts, and the next load asks again", async () => {
    answerFor = () => [COL];
    const view = render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(labels()).toContain(name(COL)));

    answerFor = () => "fail";
    mockProfile.nickname = "Bob";
    view.rerender(<Live drive={DRIVE} />);
    await waitFor(() => expect(getsFor(DRIVE)).toHaveLength(2));
    await waitFor(() => expect(labels()).toEqual(CORE));

    answerFor = () => [SF];
    mockProfile.nickname = "Carol";
    view.rerender(<Live drive={DRIVE} />);
    await waitFor(() => expect(labels()).toEqual([...CORE, name(SF)]));
  });
});

describe("SPEC-CORE-101 I6 never another drive's or an older load's shortcuts", () => {
  it("SPEC-CORE-101 I6 draws nothing in the shortcuts' place until the GET lands", async () => {
    answerFor = () => "pending";
    render(<Live drive={DRIVE} />);
    await findAppsNav();
    await screen.findAllByText("Clip a");
    await waitFor(() => expect(pending).toHaveLength(1));

    expect(labels()).toEqual(CORE);

    await act(async () => pending[0].d.resolve([COL]));
    await waitFor(() => expect(labels()).toEqual([...CORE, name(COL)]));
  });

  it("SPEC-CORE-101 I6 on a drive change drops the old drive's shortcuts before the new drive's arrive", async () => {
    answerFor = (d) => (d === DRIVE ? [COL, PIN] : "pending");
    const view = render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(labels()).toEqual([...CORE, name(COL), name(PIN)]));

    view.rerender(<Live drive={OTHER} />);
    await waitFor(() => expect(getsFor(OTHER)).toHaveLength(1));

    await waitFor(() => expect(labels()).toEqual(CORE));
    const hrefs = entryLinks(appsNav()).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes(encodeURIComponent(DRIVE)))).toBe(false);

    const otherPending = pending.find((p) => p.drive === OTHER)!;
    await act(async () => otherPending.d.resolve([OTHER_COL]));
    await waitFor(() => expect(labels()).toEqual([...CORE, name(OTHER_COL)]));
    expect(normal(entryLinks(appsNav()).at(-1)!.getAttribute("href")!, OTHER)).toBe(
      normal(hrefFor(OTHER_COL, OTHER), OTHER),
    );
  });

  it("SPEC-CORE-101 I6 discards a response for a drive Home has left", async () => {
    answerFor = (d) => (d === DRIVE ? "pending" : [OTHER_COL]);
    const view = render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(pending.filter((p) => p.drive === DRIVE)).toHaveLength(1));

    view.rerender(<Live drive={OTHER} />);
    await waitFor(() => expect(labels()).toEqual([...CORE, name(OTHER_COL)]));

    const stale = pending.find((p) => p.drive === DRIVE)!;
    await act(async () => stale.d.resolve([COL, SF]));
    await act(async () => {});

    expect(labels()).toEqual([...CORE, name(OTHER_COL)]);
  });

  it("SPEC-CORE-101 I6 discards a response for an older load of the same drive", async () => {
    answerFor = () => "pending";
    const view = render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(pending).toHaveLength(1));

    mockProfile.nickname = "Bob";
    view.rerender(<Live drive={DRIVE} />);
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => pending[1].d.resolve([SF]));
    await waitFor(() => expect(labels()).toEqual([...CORE, name(SF)]));

    await act(async () => pending[0].d.resolve([COL]));
    await act(async () => {});

    expect(labels()).toEqual([...CORE, name(SF)]);
  });

  it("SPEC-CORE-101 I6 an older load's failure does not empty a newer load's shortcuts", async () => {
    answerFor = () => "pending";
    const view = render(<Live drive={DRIVE} />);
    await findAppsNav();
    await waitFor(() => expect(pending).toHaveLength(1));

    mockProfile.nickname = "Bob";
    view.rerender(<Live drive={DRIVE} />);
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => pending[1].d.resolve([SF]));
    await waitFor(() => expect(labels()).toEqual([...CORE, name(SF)]));

    await act(async () => pending[0].d.fail());
    await act(async () => {});

    expect(labels()).toEqual([...CORE, name(SF)]);
  });
});

describe("SPEC-CORE-102 the failure message", () => {
  it.each([
    ["en", messages, "Couldn't change the Home entry"],
    ["ja", jaMessages, "ホームの入口を変更できませんでした"],
  ])("SPEC-CORE-102 drive.homeShortcutFailed reads as the spec says in %s", (_, m, text) => {
    expect((m as { drive: Record<string, string> }).drive.homeShortcutFailed).toBe(text);
  });
});
