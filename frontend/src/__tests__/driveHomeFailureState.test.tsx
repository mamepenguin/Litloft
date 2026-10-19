import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { useState } from "react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import type { WebSocketEvent } from "@/types";

const mockProfile = { nickname: null as string | null, setNickname: vi.fn(), clearNickname: vi.fn() };
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

// The addon row is deliberately absent from every case below. What this
// screen does when an addon draws something is not core's to assert, and
// the states under test are computed without asking.
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
  initUpload: vi.fn(),
  completeUpload: vi.fn().mockResolvedValue(undefined),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DriveHome } from "@/components/DriveHome";
import messages from "@/messages-core/en.json";
import type { FileItem, WatchHistoryItem } from "@/types";

const FAILED_TITLE = messages.empty.homeUnavailableTitle;
const EMPTY_TITLE = messages.empty.noHomeActivityTitle;
const RETRY = messages.errors.tryAgain;
const OPEN_LIBRARY = messages.empty.openLibraryAction;

const aFile = (id: string): FileItem => ({
  id,
  filename: `${id}.mp4`,
  title: `Clip ${id}`,
  description: "",
  drive: "media",
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
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
});

const aWatchItem = (id: string): WatchHistoryItem => ({
  ...aFile(id),
  watch_progress: { position: 60, duration: 300 },
});

const page = (files: FileItem[]) => ({
  data: files,
  meta: { total: files.length, page: 1, limit: 12 },
});

/**
 * What the page says about itself, as a set.
 *
 * Declared per state rather than asked one question at a time: the two
 * states are alternatives in one place, so "the failure copy is on
 * screen" is only half of what each case means — the other half is that
 * the copy it replaces is not.
 */
function pageWideState(): string[] {
  return [FAILED_TITLE, EMPTY_TITLE].filter((text) => screen.queryByText(text) !== null);
}

function Live() {
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  (globalThis as Record<string, unknown>).__emit = setLastEvent;
  return (
    <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
      <DriveHome driveName="media" />
    </WebSocketContext.Provider>
  );
}

function emit(event: string, drive: string) {
  act(() => {
    (globalThis as unknown as { __emit: (e: WebSocketEvent) => void }).__emit({
      event,
      data: { drive },
    });
  });
}

/**
 * Run a refresh to the end of whatever it does, rather than to the end of
 * a fixed number of ticks.
 *
 * Both cases below assert that the screen did *not* change, so there is no
 * edge to wait on: a `waitFor` cannot tell "still correct" from "not
 * applied yet", and it passes on its first look either way. Draining the
 * timer queue as well as the microtask queue makes the answer independent
 * of how many awaits sit between the socket event and the rows.
 */
async function settleRefresh(release: () => void) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    release();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  } finally {
    vi.useRealTimers();
  }
}

describe("what the drive home says when its rows have nothing to show", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile.nickname = null;
    mockGetDriveFiles.mockResolvedValue(page([]));
    mockGetWatchHistory.mockResolvedValue([]);
  });
  afterEach(cleanup);

  it("offers a retry when every request it made was refused, and does not call the drive empty", async () => {
    mockGetDriveFiles.mockRejectedValue(new Error("network"));

    render(<DriveHome driveName="media" />);

    expect(await screen.findByText(FAILED_TITLE)).not.toBeNull();
    expect(pageWideState()).toEqual([FAILED_TITLE]);
    expect(screen.getByRole("button", { name: RETRY })).not.toBeNull();
  });

  it("offers it for a reader with a profile too, whose page load is five requests and not three", async () => {
    // The two watch requests were swallowed by a `catch` that turned a
    // rejection into an empty row, so with a profile the page could tell
    // that its file rows had failed and nothing about the rest.
    mockProfile.nickname = "Alice";
    mockGetDriveFiles.mockRejectedValue(new Error("network"));
    mockGetWatchHistory.mockRejectedValue(new Error("network"));

    render(<DriveHome driveName="media" />);

    expect(await screen.findByText(FAILED_TITLE)).not.toBeNull();
    expect(pageWideState()).toEqual([FAILED_TITLE]);
  });

  it("says nothing page-wide when the file rows failed but the history answered", async () => {
    // The case that separates "every request failed" from "the requests
    // I happened to look at failed". A page keyed on the file rows alone
    // claims a total failure over a screen with a row on it.
    mockProfile.nickname = "Alice";
    mockGetDriveFiles.mockRejectedValue(new Error("network"));
    mockGetWatchHistory.mockResolvedValue([aWatchItem("v1")]);

    render(<DriveHome driveName="media" />);

    await waitFor(() => expect(screen.queryAllByText("Clip v1")).toHaveLength(2));
    expect(pageWideState()).toEqual([]);
  });

  it("calls the drive empty when the file rows failed and the history simply had nothing", async () => {
    // The other side of the case above, and what separates "every
    // request failed" from "the file rows failed": the history answered,
    // so the drive is reachable and the page must not say it is not.
    mockProfile.nickname = "Alice";
    mockGetDriveFiles.mockRejectedValue(new Error("network"));
    mockGetWatchHistory.mockResolvedValue([]);

    render(<DriveHome driveName="media" />);

    expect(await screen.findByText(EMPTY_TITLE)).not.toBeNull();
    expect(pageWideState()).toEqual([EMPTY_TITLE]);
  });

  // One row at a time: the three are fetched together but land in three
  // pieces of state, so a page that reads only some of them still hides
  // its empty state for the right reason in the cases it happens to
  // read, and claims an empty drive over a row with files in the rest.
  it.each([
    [0, "Recently Added"],
    [1, "Favorites"],
    [2, "Liked"],
  ])("says nothing page-wide when the row at %i came back with files", async (withFiles, heading) => {
    let call = 0;
    mockGetDriveFiles.mockImplementation(() =>
      call++ === withFiles
        ? Promise.resolve(page([aFile("f1")]))
        : Promise.reject(new Error("network")),
    );

    render(<DriveHome driveName="media" />);

    const row = await screen.findByText(heading as string);
    await waitFor(() =>
      expect(row.closest("section")!.textContent).toContain("Clip f1"),
    );
    expect(pageWideState()).toEqual([]);
  });

  it("calls the drive empty only when it was answered and had nothing", async () => {
    render(<DriveHome driveName="media" />);

    expect(await screen.findByText(EMPTY_TITLE)).not.toBeNull();
    expect(pageWideState()).toEqual([EMPTY_TITLE]);
    expect(screen.queryByRole("button", { name: RETRY })).toBeNull();

    const library = screen.getByRole("link", { name: OPEN_LIBRARY });
    expect(library.getAttribute("href")).toBe("/drive/media");
  });

  it("says neither on the frame before any request has been made", async () => {
    // `render` flushes effects inside `act`, so the first paint is out
    // of reach of every case in this file. A server render is the frame
    // where the rows are empty and nothing has been asked yet.
    // Read as text rather than matched against the markup: React
    // escapes an apostrophe, so one of these two titles is never a
    // substring of the serialised HTML whether it rendered or not.
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<DriveHome driveName="media" />);
    expect(host.textContent).not.toContain(EMPTY_TITLE);
    expect(host.textContent).not.toContain(FAILED_TITLE);
    // The population: this is the page and not an early return.
    expect(host.textContent).toContain("Recently Added");
  });

  it("says neither while every request is still out", async () => {
    mockGetDriveFiles.mockReturnValue(new Promise<never>(() => {}));

    render(<DriveHome driveName="media" />);

    // The population: the rows are on screen as skeletons, so this is a
    // page mid-fetch rather than one that never started.
    await screen.findByText("Recently Added");
    expect(pageWideState()).toEqual([]);
  });

  it("says neither while the drive it has just moved to is still out", async () => {
    // The rows are blanked at the start of a load, so between a drive
    // change and its answer the page looks exactly like a drive with
    // nothing in it — and it has not asked yet.
    mockGetDriveFiles.mockResolvedValue(page([aFile("f1")]));

    const { rerender } = render(<DriveHome driveName="media" />);
    // Three, because all three rows read the same mock.
    await waitFor(() => expect(screen.queryAllByText("Clip f1")).toHaveLength(3));

    mockGetDriveFiles.mockReturnValue(new Promise<never>(() => {}));
    rerender(<DriveHome driveName="archive" />);

    await waitFor(() => expect(screen.queryAllByText("Clip f1")).toHaveLength(0));
    expect(pageWideState()).toEqual([]);
  });

  // One request answering and the other not, in both orientations. The
  // cases either side of this resolve both or reject both, and a page
  // that reads the pair with `every` instead of `some` is the same page
  // in all of those.
  it.each([
    ["the resumable history", undefined],
    ["the whole history", "all"],
  ])("does not call the drive unreachable when %s answered alone", async (_label, answered) => {
    mockProfile.nickname = "Alice";
    mockGetDriveFiles.mockRejectedValue(new Error("network"));
    mockGetWatchHistory.mockImplementation((...args: unknown[]) =>
      args[2] === answered ? Promise.resolve([]) : Promise.reject(new Error("network")),
    );

    render(<DriveHome driveName="media" />);

    expect(await screen.findByText(EMPTY_TITLE)).not.toBeNull();
    expect(pageWideState()).toEqual([EMPTY_TITLE]);
  });

  // Each row in turn, because they are three separate requests and any
  // one of them can be the one that fails. The three cases above give
  // the surviving row files, which keeps the page out of both states
  // however the batch is read; here the survivors answer with nothing,
  // which is the population the two states are decided on.
  it.each([[0], [1], [2]])(
    "does not call the drive unreachable when the row at %i refused and the others answered empty",
    async (refused) => {
      let call = 0;
      mockGetDriveFiles.mockImplementation(() =>
        call++ === refused
          ? Promise.reject(new Error("network"))
          : Promise.resolve(page([])),
      );

      render(<DriveHome driveName="media" />);

      expect(await screen.findByText(EMPTY_TITLE)).not.toBeNull();
      expect(pageWideState()).toEqual([EMPTY_TITLE]);
    },
  );

  it("keeps the empty state when a background refresh fails over a drive that did answer", async () => {
    mockGetDriveFiles.mockResolvedValue(page([]));

    render(<Live />);
    expect(await screen.findByText(EMPTY_TITLE)).not.toBeNull();

    // The refresh is refused by hand and drained inside `act`, so the
    // assertion below runs after it has been applied. A `waitFor` on a
    // value that is already on screen cannot tell "still correct" from
    // "not yet".
    const rejects: ((reason: unknown) => void)[] = [];
    mockGetDriveFiles.mockImplementation(
      () => new Promise((_resolve, reject) => rejects.push(reject)),
    );
    emit("drive.structure_changed", "media");
    await waitFor(() => expect(rejects).toHaveLength(3));
    await settleRefresh(() => rejects.forEach((reject) => reject(new Error("network"))));

    expect(pageWideState()).toEqual([EMPTY_TITLE]);
  });

  it("leaves the failure state where it was when a refresh fails too", async () => {
    // The branch that writes nothing: a batch that neither delivered nor
    // came from a load. Clearing the flag here would replace Try again
    // with "Nothing here yet" over a drive that has never answered.
    mockGetDriveFiles.mockRejectedValue(new Error("network"));

    render(<Live />);
    expect(await screen.findByText(FAILED_TITLE)).not.toBeNull();

    const rejects: ((reason: unknown) => void)[] = [];
    mockGetDriveFiles.mockImplementation(
      () => new Promise((_resolve, reject) => rejects.push(reject)),
    );
    emit("drive.structure_changed", "media");
    await waitFor(() => expect(rejects).toHaveLength(3));
    await settleRefresh(() => rejects.forEach((reject) => reject(new Error("network"))));

    expect(pageWideState()).toEqual([FAILED_TITLE]);
  });

  it("leaves the failure state when a background refresh answers with nothing", async () => {
    // The mirror. A refresh that delivers is the drive answering, and
    // the page has no business still saying it could not be reached.
    mockGetDriveFiles.mockRejectedValue(new Error("network"));

    render(<Live />);
    expect(await screen.findByText(FAILED_TITLE)).not.toBeNull();

    mockGetDriveFiles.mockResolvedValue(page([]));
    const before = mockGetDriveFiles.mock.calls.length;
    emit("drive.structure_changed", "media");
    await waitFor(() =>
      expect(mockGetDriveFiles.mock.calls.length).toBeGreaterThan(before),
    );

    await waitFor(() => expect(pageWideState()).toEqual([EMPTY_TITLE]));
  });

  it("does not mark a drive loaded from a request made for the one before it", async () => {
    const deferred: ((value: unknown) => void)[] = [];
    mockGetDriveFiles.mockImplementation(
      () => new Promise((resolve) => deferred.push(resolve)),
    );

    const { rerender } = render(<DriveHome driveName="media" />);
    await waitFor(() => expect(deferred).toHaveLength(3));
    rerender(<DriveHome driveName="archive" />);
    await waitFor(() => expect(deferred).toHaveLength(6));

    // The drive that was left answers; the one on screen still has not.
    await act(async () => {
      deferred.slice(0, 3).forEach((resolve) => resolve(page([])));
      await Promise.resolve();
    });

    expect(pageWideState()).toEqual([]);
  });

  // The two watch rows are two requests and two pieces of state, so
  // either can carry the only thing on the page.
  it.each([
    ["Continue Watching", undefined],
    ["Recently Viewed", "all"],
  ])("says nothing page-wide when only %s came back with items", async (heading, kind) => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockImplementation((...args: unknown[]) =>
      Promise.resolve(args[2] === kind ? [aWatchItem("v1")] : []),
    );

    render(<DriveHome driveName="media" />);

    const row = await screen.findByText(heading as string);
    await waitFor(() =>
      expect(row.closest("section")!.textContent).toContain("Clip v1"),
    );
    expect(pageWideState()).toEqual([]);
  });

  it("says neither while only the history is still out", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockReturnValue(new Promise<never>(() => {}));

    render(<DriveHome driveName="media" />);

    await screen.findByText("Continue Watching");
    expect(pageWideState()).toEqual([]);
  });

  it("asks for everything again when the retry is pressed, history included", async () => {
    // A retry wired to the file rows' own refetch leaves the watch rows
    // holding the failure they were loaded with, and nothing on the page
    // asks for them a second time.
    mockProfile.nickname = "Alice";
    mockGetDriveFiles.mockRejectedValue(new Error("network"));
    mockGetWatchHistory.mockRejectedValue(new Error("network"));

    render(<DriveHome driveName="media" />);
    await screen.findByText(FAILED_TITLE);

    mockGetDriveFiles.mockResolvedValue(page([aFile("f1")]));
    mockGetWatchHistory.mockResolvedValue([aWatchItem("v1")]);
    expect(mockGetWatchHistory).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: RETRY }));

    await waitFor(() => expect(pageWideState()).toEqual([]));
    expect(mockGetWatchHistory).toHaveBeenCalledTimes(4);
    await screen.findByText("Continue Watching");
  });

  it("retries the drive in front of the reader, not the one the button was drawn on", async () => {
    mockGetDriveFiles.mockRejectedValue(new Error("network"));

    const { rerender } = render(<DriveHome driveName="media" />);
    await screen.findByText(FAILED_TITLE);

    rerender(<DriveHome driveName="archive" />);
    await screen.findByText(FAILED_TITLE);

    mockGetDriveFiles.mockClear();
    fireEvent.click(screen.getByRole("button", { name: RETRY }));

    await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
    expect([...new Set(mockGetDriveFiles.mock.calls.map(([drive]) => drive))]).toEqual(["archive"]);
  });

  it("drops the history of the drive that was left when the new drive refuses to give its own", async () => {
    // A rejected watch fetch empties its row rather than leaving the
    // items it had. The rows are fetched only on a page load, and a
    // drive change is one, so holding on to the previous items would
    // draw one drive's history under another drive's name.
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([aWatchItem("v1")]);

    const { rerender } = render(<DriveHome driveName="media" />);
    // Two: both watch rows read the same history, which is also why
    // neither of them going quiet on its own would be visible below.
    // Waited for, not read off the heading — a row draws its heading
    // while it is still a row of skeletons.
    await waitFor(() => expect(screen.queryAllByText("Clip v1")).toHaveLength(2));

    mockGetWatchHistory.mockRejectedValue(new Error("network"));
    rerender(<DriveHome driveName="archive" />);

    await waitFor(() => expect(screen.queryByText("Continue Watching")).toBeNull());
    expect(screen.queryAllByText("Clip v1")).toHaveLength(0);
  });

  it("does not turn a failed background refresh into a page-wide failure", async () => {
    // A refresh that delivers nothing leaves what is already drawn
    // alone. The rows keep their files, so the page has something to
    // show and has no business claiming otherwise.
    mockGetDriveFiles.mockResolvedValue(page([aFile("f1")]));

    render(<Live />);
    await screen.findByText("Recently Added");

    mockGetDriveFiles.mockRejectedValue(new Error("network"));
    const before = mockGetDriveFiles.mock.calls.length;
    emit("drive.structure_changed", "media");
    // The refresh has to have been made and refused before the screen
    // says anything about it — waiting on the event that starts it would
    // assert over the page as it was.
    await waitFor(() =>
      expect(mockGetDriveFiles.mock.calls.length).toBeGreaterThan(before),
    );

    await waitFor(() => expect(pageWideState()).toEqual([]));
    expect(screen.getByText("Recently Added")).not.toBeNull();
  });
});
