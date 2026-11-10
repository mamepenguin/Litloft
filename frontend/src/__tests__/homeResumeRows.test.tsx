/**
 * Home's rows around resuming: SPEC-CORE-074, invariants I5, I7 and I8 of
 * docs/specs/home-app-entries.md. Labels are the English messages.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastProvider";
import type { FileItem, WatchHistoryItem } from "@/types";
import messages from "@/messages-core/en.json";

const DRIVE = "media";
const OTHER = "archive";

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

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: undefined,
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) =>
    id === "drive-home-sections" ? (
      <section>
        <h2>Pickup</h2>
      </section>
    ) : null,
}));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

type Watch = (drive: string, limit?: number, filter?: string) => Promise<WatchHistoryItem[]>;
type Files = (drive: string, params: Record<string, unknown>) => Promise<unknown>;

const mockGetDriveFiles = vi.fn<Files>();
const mockGetWatchHistory = vi.fn<Watch>();
const mockDismiss = vi.fn();
const mockDeleteProgress = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: (drive: string, params: Record<string, unknown>) => mockGetDriveFiles(drive, params),
  getWatchHistory: (drive: string, limit?: number, filter?: string) => mockGetWatchHistory(drive, limit, filter),
  getInboxCount: async () => 0,
  dismissContinueItem: (...args: unknown[]) => mockDismiss(...args),
  deleteWatchProgress: (...args: unknown[]) => mockDeleteProgress(...args),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DriveHome } from "@/components/DriveHome";

const file = (id: string, drive = DRIVE) =>
  ({
    id,
    filename: `${id}.mp4`,
    title: `Video ${id}`,
    description: "",
    drive,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 300,
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

const item = (id: string, drive = DRIVE): WatchHistoryItem => ({
  ...file(id, drive),
  watch_progress: { position: 60, duration: 300 },
});

const page = (data: FileItem[]) => ({ data, meta: { total: data.length, page: 1, limit: 12 } });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Live({ drive }: { drive: string }) {
  return (
    <ToastProvider>
      <DriveHome driveName={drive} />
    </ToastProvider>
  );
}

const notContinueCalls = () => mockGetWatchHistory.mock.calls.filter(([, , f]) => f === "not_continue");

const sectionOf = (name: string) =>
  (screen.queryByRole("heading", { level: 2, name })?.closest("section") ?? null) as HTMLElement | null;
async function section(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { level: 2, name });
  return heading.closest("section") as HTMLElement;
}
const titlesIn = (name: string) => {
  const s = sectionOf(name);
  if (!s) return null;
  return Array.from(new Set((s.textContent ?? "").match(/Video [\w-]+/g) ?? []));
};

async function menuOn(row: string, title: string) {
  fireEvent.contextMenu(within(await section(row)).getByText(title));
  await screen.findAllByRole("menuitem");
}
async function setAside(title: string) {
  await menuOn("Continue", title);
  fireEvent.click(screen.getByRole("menuitem", { name: /Remove from Continue/ }));
}
async function removeFromHistory(row: string, title: string) {
  await menuOn(row, title);
  fireEvent.click(screen.getByRole("menuitem", { name: /Remove from history/ }));
}

const noToast = () => expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();

/**
 * Answers the page load with `continue` and the first `not_continue` list, and every later
 * `not_continue` request with the next entry of `refetches`.
 */
function watchScript(opts: {
  continue: WatchHistoryItem[];
  recent: WatchHistoryItem[] | Error;
  refetches?: Array<Promise<WatchHistoryItem[]>>;
  byDrive?: Record<string, { continue: WatchHistoryItem[]; recent: WatchHistoryItem[] }>;
}) {
  const queue = [...(opts.refetches ?? [])];
  let loads = 0;
  mockGetWatchHistory.mockImplementation(async (drive, _limit, filter) => {
    const other = opts.byDrive?.[drive];
    if (other) return filter === "continue" ? other.continue : filter === "not_continue" ? other.recent : [];
    if (filter === "continue") return opts.continue;
    if (filter === "not_continue") {
      loads += 1;
      if (loads === 1) {
        if (opts.recent instanceof Error) throw opts.recent;
        return opts.recent;
      }
      const next = queue.shift();
      if (!next) throw new Error(`unexpected not_continue request #${loads}`);
      return next;
    }
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProfile.nickname = "Alice";
  mockGetDriveFiles.mockResolvedValue(page([]));
  mockDismiss.mockResolvedValue(undefined);
  mockDeleteProgress.mockResolvedValue(undefined);
});

describe("SPEC-CORE-074 I5 I7 the rows and their requests", () => {
  it("SPEC-CORE-074 I7 Recently Viewed asks for not_continue, 12 at most, and its See all opens ?view=recent", async () => {
    watchScript({ continue: [item("c1")], recent: [item("r1")] });
    render(<Live drive={DRIVE} />);

    const recent = await section("Recently Viewed");
    await within(recent).findByText("Video r1");
    const calls = mockGetWatchHistory.mock.calls;
    expect(calls.some(([d, limit, f]) => d === DRIVE && limit === 12 && f === "not_continue")).toBe(true);
    expect(calls.some(([d, limit, f]) => d === DRIVE && limit === 12 && f === "continue")).toBe(true);
    expect(calls.every(([, , f]) => f === "continue" || f === "not_continue")).toBe(true);
    const seeAll = within(recent).getByRole("link", { name: /See all/ });
    expect(new URL(seeAll.getAttribute("href")!, "http://x").searchParams.get("view")).toBe("recent");
  });

  it("SPEC-CORE-074 I5 sends no liked=true request, draws no Liked row, and each row shows its own request's files", async () => {
    mockGetDriveFiles.mockImplementation(async (_d, params) => {
      if (params.liked) return page([file("liked")]);
      if (params.favorite) return page([file("fav")]);
      return page([file("new")]);
    });
    watchScript({ continue: [item("c1")], recent: [item("r1")] });
    render(<Live drive={DRIVE} />);

    await within(await section("Recently Added")).findByText("Video new");
    await within(await section("Favorites")).findByText("Video fav");
    await within(await section("Recently Viewed")).findByText("Video r1");

    expect(mockGetDriveFiles.mock.calls.some(([, p]) => p.liked === true)).toBe(false);
    expect(screen.queryByRole("heading", { level: 2, name: "Liked" })).toBeNull();
    expect(screen.queryAllByText("Video liked")).toHaveLength(0);
    expect(titlesIn("Continue")).toEqual(["Video c1"]);
    expect(titlesIn("Recently Viewed")).toEqual(["Video r1"]);
    expect(titlesIn("Favorites")).toEqual(["Video fav"]);
    expect(titlesIn("Recently Added")).toEqual(["Video new"]);
  });

  it("SPEC-CORE-074 shows the empty state on a drive whose only listed content is liked files", async () => {
    mockGetDriveFiles.mockImplementation(async (_d, params) => page(params.liked ? [file("liked")] : []));
    watchScript({ continue: [], recent: [] });
    render(<Live drive={DRIVE} />);

    expect(await screen.findByText(messages.empty.noHomeActivityTitle)).toBeInTheDocument();
    expect(screen.queryAllByText("Video liked")).toHaveLength(0);
  });

  it("SPEC-CORE-074 hides Recently Viewed when not_continue fails on the page load, and keeps the other rows", async () => {
    mockGetDriveFiles.mockResolvedValue(page([file("new")]));
    watchScript({ continue: [item("c1")], recent: new Error("down") });
    render(<Live drive={DRIVE} />);

    await within(await section("Continue")).findByText("Video c1");
    await within(await section("Recently Added")).findAllByText("Video new");
    await waitFor(() => expect(sectionOf("Recently Viewed")).toBeNull());
    expect(notContinueCalls().length).toBe(1);
  });
});

describe("SPEC-CORE-074 I8 Recently Viewed after a set-aside", () => {
  it("SPEC-CORE-074 I8 takes the card out of Continue and sends exactly one not_continue request", async () => {
    const refetch = deferred<WatchHistoryItem[]>();
    watchScript({ continue: [item("c1"), item("c2")], recent: [item("r1")], refetches: [refetch.promise] });
    render(<Live drive={DRIVE} />);
    await within(await section("Recently Viewed")).findByText("Video r1");
    expect(notContinueCalls()).toHaveLength(1);

    await setAside("Video c1");

    await waitFor(() => expect(mockDismiss).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(titlesIn("Continue")).toEqual(["Video c2"]));
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));
    expect(notContinueCalls()[1]).toEqual([DRIVE, 12, "not_continue"]);

    await act(async () => refetch.resolve([item("c1"), item("r1")]));
    await waitFor(() => expect(titlesIn("Recently Viewed")).toEqual(["Video c1", "Video r1"]));
    await act(async () => {});
    expect(notContinueCalls()).toHaveLength(2);
    expect(titlesIn("Continue")).toEqual(["Video c2"]);
    expect(mockDeleteProgress).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-074 I8 keeps showing the old cards, never the skeleton, while the refetch is out", async () => {
    const refetch = deferred<WatchHistoryItem[]>();
    watchScript({ continue: [item("c1"), item("c2")], recent: [item("r1"), item("r2")], refetches: [refetch.promise] });
    render(<Live drive={DRIVE} />);
    await within(await section("Recently Viewed")).findByText("Video r2");

    await setAside("Video c1");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));
    await act(async () => {});

    const recent = sectionOf("Recently Viewed");
    expect(recent).not.toBeNull();
    expect(titlesIn("Recently Viewed")).toEqual(["Video r1", "Video r2"]);
    expect(recent!.querySelector(".animate-pulse")).toBeNull();

    await act(async () => refetch.resolve([item("c1"), item("r1"), item("r2")]));
    await waitFor(() => expect(titlesIn("Recently Viewed")).toEqual(["Video c1", "Video r1", "Video r2"]));
  });

  it("SPEC-CORE-074 I8 draws a row that was empty on the page load when the refetch holds rows", async () => {
    const refetch = deferred<WatchHistoryItem[]>();
    watchScript({ continue: [item("c1"), item("c2")], recent: [], refetches: [refetch.promise] });
    render(<Live drive={DRIVE} />);
    await within(await section("Continue")).findByText("Video c1");
    await waitFor(() => expect(sectionOf("Recently Viewed")).toBeNull());

    await setAside("Video c1");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));
    await act(async () => {});
    expect(sectionOf("Recently Viewed")).toBeNull();

    await act(async () => refetch.resolve([item("c1")]));
    await waitFor(() => expect(titlesIn("Recently Viewed")).toEqual(["Video c1"]));
    expect(sectionOf("Recently Viewed")!.querySelector(".animate-pulse")).toBeNull();
  });

  it("SPEC-CORE-074 I8 draws a row that failed on the page load when the refetch holds rows", async () => {
    const refetch = deferred<WatchHistoryItem[]>();
    watchScript({ continue: [item("c1"), item("c2")], recent: new Error("down"), refetches: [refetch.promise] });
    render(<Live drive={DRIVE} />);
    await within(await section("Continue")).findByText("Video c1");
    await waitFor(() => expect(sectionOf("Recently Viewed")).toBeNull());

    await setAside("Video c1");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));
    await act(async () => refetch.resolve([item("c1")]));

    await waitFor(() => expect(titlesIn("Recently Viewed")).toEqual(["Video c1"]));
    expect(titlesIn("Continue")).toEqual(["Video c2"]);
  });

  it("SPEC-CORE-074 I8 hides the row when the refetch comes back empty", async () => {
    const refetch = deferred<WatchHistoryItem[]>();
    watchScript({ continue: [item("c1"), item("c2")], recent: [item("r1")], refetches: [refetch.promise] });
    render(<Live drive={DRIVE} />);
    await within(await section("Recently Viewed")).findByText("Video r1");

    await setAside("Video c1");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));
    await act(async () => refetch.resolve([]));

    await waitFor(() => expect(sectionOf("Recently Viewed")).toBeNull());
    expect(titlesIn("Continue")).toEqual(["Video c2"]);
  });

  it("SPEC-CORE-074 I8 changes neither row and shows no toast when the refetch fails", async () => {
    const refetch = deferred<WatchHistoryItem[]>();
    watchScript({ continue: [item("c1"), item("c2")], recent: [item("r1")], refetches: [refetch.promise] });
    render(<Live drive={DRIVE} />);
    await within(await section("Recently Viewed")).findByText("Video r1");

    await setAside("Video c1");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));
    await waitFor(() => expect(titlesIn("Continue")).toEqual(["Video c2"]));
    await act(async () => refetch.reject(new Error("down")));
    await act(async () => {});

    expect(titlesIn("Recently Viewed")).toEqual(["Video r1"]);
    expect(titlesIn("Continue")).toEqual(["Video c2"]);
    noToast();
  });

  it("SPEC-CORE-074 I8 sends no refetch, changes neither row and says so when the dismiss fails", async () => {
    mockDismiss.mockRejectedValue(new Error("network"));
    watchScript({ continue: [item("c1"), item("c2")], recent: [item("r1")] });
    render(<Live drive={DRIVE} />);
    await within(await section("Recently Viewed")).findByText("Video r1");

    await setAside("Video c1");

    expect(await screen.findByText(messages.drive.couldNotRemoveFromContinue)).toBeInTheDocument();
    await act(async () => {});
    expect(notContinueCalls()).toHaveLength(1);
    expect(titlesIn("Continue")).toEqual(["Video c1", "Video c2"]);
    expect(titlesIn("Recently Viewed")).toEqual(["Video r1"]);
  });

  it("SPEC-CORE-074 I8 discards a refetch that lands after Home moved to another drive", async () => {
    const refetch = deferred<WatchHistoryItem[]>();
    watchScript({
      continue: [item("c1"), item("c2")],
      recent: [item("r1")],
      refetches: [refetch.promise],
      byDrive: { [OTHER]: { continue: [item("o1", OTHER)], recent: [item("o2", OTHER)] } },
    });
    const view = render(<Live drive={DRIVE} />);
    await within(await section("Recently Viewed")).findByText("Video r1");

    await setAside("Video c1");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));

    view.rerender(<Live drive={OTHER} />);
    await waitFor(() => expect(titlesIn("Recently Viewed")).toEqual(["Video o2"]));
    await act(async () => refetch.resolve([item("stale")]));
    await act(async () => {});

    expect(titlesIn("Recently Viewed")).toEqual(["Video o2"]);
    expect(screen.queryAllByText("Video stale")).toHaveLength(0);
  });

  it("SPEC-CORE-074 I8 discards an older refetch that lands after a newer one", async () => {
    const first = deferred<WatchHistoryItem[]>();
    const second = deferred<WatchHistoryItem[]>();
    watchScript({
      continue: [item("c1"), item("c2"), item("c3")],
      recent: [item("r1")],
      refetches: [first.promise, second.promise],
    });
    render(<Live drive={DRIVE} />);
    await within(await section("Recently Viewed")).findByText("Video r1");

    await setAside("Video c1");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));
    await waitFor(() => expect(titlesIn("Continue")).toEqual(["Video c2", "Video c3"]));
    await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));
    await setAside("Video c2");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(3));

    await act(async () => second.resolve([item("c2"), item("c1"), item("r1")]));
    await waitFor(() => expect(titlesIn("Recently Viewed")).toEqual(["Video c2", "Video c1", "Video r1"]));
    await act(async () => first.resolve([item("c1"), item("r1")]));
    await act(async () => {});

    expect(titlesIn("Recently Viewed")).toEqual(["Video c2", "Video c1", "Video r1"]);
    expect(titlesIn("Continue")).toEqual(["Video c3"]);
  });

  it("SPEC-CORE-074 I8 leaves out a card removed from history after the refetch was sent", async () => {
    const refetch = deferred<WatchHistoryItem[]>();
    watchScript({
      continue: [item("c1"), item("c2")],
      recent: [item("r1"), item("r2")],
      refetches: [refetch.promise],
    });
    render(<Live drive={DRIVE} />);
    await within(await section("Recently Viewed")).findByText("Video r2");

    await setAside("Video c1");
    await waitFor(() => expect(notContinueCalls()).toHaveLength(2));
    await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));

    await removeFromHistory("Recently Viewed", "Video r1");
    await waitFor(() => expect(mockDeleteProgress).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryAllByText("Video r1")).toHaveLength(0));

    await act(async () => refetch.resolve([item("c1"), item("r1"), item("r2")]));

    await waitFor(() => expect(titlesIn("Recently Viewed")).toEqual(["Video c1", "Video r2"]));
    expect(screen.queryAllByText("Video r1")).toHaveLength(0);
  });
});
