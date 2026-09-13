import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FileItem, PaginatedResponse, WatchHistoryItem } from "@/types";


const getDriveFiles = vi.fn<(drive: string, params: Record<string, unknown>) => Promise<PaginatedResponse>>();
const getWatchHistory = vi.fn<(drive: string, limit: number, scope?: string) => Promise<WatchHistoryItem[]>>();

// Everything `DriveHome` reads from `@/lib/api`. A binding the component
// does not import is a claim that it does, and this file has been read
// that way before.
vi.mock("@/lib/api", () => ({
  getDriveFiles: (drive: string, params: Record<string, unknown>) => getDriveFiles(drive, params),
  getWatchHistory: (drive: string, limit: number, scope?: string) => getWatchHistory(drive, limit, scope),
}));

// The header, stood in for as a unit. Nothing it would draw — the tree
// toggle, the trail, the links inside it — is reached from here, so none
// of those needs a stand-in of its own, and one for any of them would be
// a claim that this file exercises it.
vi.mock("../PageHeader", () => ({ PageHeader: () => <div /> }));

// The two watch rows are the same component twice, told apart by
// `title`: the first is rendered without one and falls back to the
// component's own default, so the stand-in restates that default. This
// file does not hold that the two spellings agree — a default renamed in
// the component and not here would leave these cases green on a row
// labelled with the old name.
vi.mock("../ContinueWatchingSection", () => ({
  ContinueWatchingSection: ({ title, items }: { title?: string; items: WatchHistoryItem[] }) => (
    <section aria-label={title ?? WATCH_TITLES.continueWatching}>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </section>
  ),
}));

// The rows are the surface this file reads state through, so they are
// stood in for by something that draws what it was handed and nothing
// else.
// The callbacks each row was rendered with, in order. A real carousel
// calls `onFileAction` *after* the trash or favourite it started has
// come back, so the callback it invokes is the one it captured when the
// action began — which may be several renders old. Keeping them lets a
// case invoke the callback a row held on the drive that was left.
const fileActionCallbacks: (() => void)[] = [];

vi.mock("../CarouselSection", () => ({
  CarouselSection: ({
    title,
    files,
    onFileAction,
  }: {
    title: string;
    files: FileItem[];
    onFileAction?: () => void;
  }) => {
    if (onFileAction && !fileActionCallbacks.includes(onFileAction)) {
      fileActionCallbacks.push(onFileAction);
    }
    return (
      <section aria-label={title}>
        <ul>
          {files.map((file) => (
            <li key={file.id}>{file.title}</li>
          ))}
        </ul>
        <button type="button" onClick={onFileAction}>
          {`act on ${title}`}
        </button>
      </section>
    );
  },
}));

// Mutable, because `hasProfile` gates the watch rows and the fetch
// effect depends on it: a case that wants those rows on screen gives
// the page a nickname before rendering.
const profile: { nickname: string | null } = { nickname: null };
vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: profile.nickname }),
}));
vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));

import { DriveHome } from "../DriveHome";

/**
 * What a response that outlived the drive it was made for may write.
 *
 * This page fetches on two streams, and they answer to different
 * things. The Recently Added / Favorites / Liked rows carry their
 * identity on the response (`ResponseIdentity`), because a row can
 * refetch itself with no page load involved. The watch rows are fetched
 * by the page load alone, so a page load is the unit of identity for
 * them (`pageLoadRef`). Each stream is taken across a drive change here,
 * where a response outliving the change would write the drive that was
 * left under this drive's links; the row stream is also taken across a
 * return to the drive the request was made for, where the name is the
 * same on both ends and only the request tells the two apart. Cases
 * where the response does reach the screen are here too, so a guard that
 * discards everything is not read as one that discards the right thing.
 *
 * **What this file can hold.** Which drive's data is in state after a
 * response settles late. jsdom lays nothing out, so nothing here is
 * evidence about how any of it is drawn; it is a decision about whose
 * data is written, which is the right thing to ask jsdom.
 *
 * **Populations are declared.** The rows on screen are read out of the
 * document and compared against a literal written per drive, so a
 * section leaving the page moves one side of the `toEqual` on its own
 * (`review-workflow.md` detector rule 5).
 */

const SECTION_KEYS = ["recentAdded", "favorites", "liked"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
type SectionFiles = Record<SectionKey, string>;

/** The row titles, as `messages-core/en.json` spells them. */
const SECTION_TITLES: Record<SectionKey, string> = {
  recentAdded: "Recently Added",
  favorites: "Favorites",
  liked: "Liked",
};

const WATCH_KEYS = ["continueWatching", "recentlyPlayed"] as const;
type WatchKey = (typeof WATCH_KEYS)[number];
type WatchRowItems = Record<WatchKey, string>;

/** The watch row titles, as `messages-core/en.json` spells them. */
const WATCH_TITLES: Record<WatchKey, string> = {
  continueWatching: "Continue Watching",
  recentlyPlayed: "Recently Viewed",
};

/** One file per row, named for its drive so a stale row is readable. */
const DRIVE_A_FILES: SectionFiles = {
  recentAdded: "alfa-added",
  favorites: "alfa-favorite",
  liked: "alfa-liked",
};

const DRIVE_B_FILES: SectionFiles = {
  recentAdded: "bravo-added",
  favorites: "bravo-favorite",
  liked: "bravo-liked",
};

/**
 * What the first drive holds when it is opened again — after the file
 * the trip started with was trashed, say. Its own names, disjoint from
 * the first visit's, so a batch belonging to that visit is readable on
 * screen rather than hiding behind an identical row.
 */
const DRIVE_A_REVISIT_FILES: SectionFiles = {
  recentAdded: "alfa-added-after",
  favorites: "alfa-favorite-after",
  liked: "alfa-liked-after",
};

/** One item per watch row, named for its drive for the same reason. */
const DRIVE_A_WATCH: WatchRowItems = {
  continueWatching: "alfa-continuing",
  recentlyPlayed: "alfa-played",
};

const DRIVE_B_WATCH: WatchRowItems = {
  continueWatching: "bravo-continuing",
  recentlyPlayed: "bravo-played",
};

/** What the first drive's history holds when it is opened again. */
const DRIVE_A_REVISIT_WATCH: WatchRowItems = {
  continueWatching: "alfa-continuing-after",
  recentlyPlayed: "alfa-played-after",
};

function page(title: string): PaginatedResponse {
  return { data: [{ id: title, title } as FileItem], meta: { total: 1 } as PaginatedResponse["meta"] };
}

/** Which row a `getDriveFiles` call is for, read off its query. */
function sectionOf(params: Record<string, unknown>): SectionKey {
  if (params.favorite === true) return "favorites";
  if (params.liked === true) return "liked";
  return "recentAdded";
}

/** Which watch row a `getWatchHistory` call is for, read off its scope. */
function watchRowOf(scope: string | undefined): WatchKey {
  return scope === "all" ? "recentlyPlayed" : "continueWatching";
}

function watchItem(title: string): WatchHistoryItem {
  return { id: title, title } as WatchHistoryItem;
}

const DRIVE_UNDER_TEST = "drive-under-test";
const SECOND_DRIVE = "second-drive";

/**
 * Every read answers according to the drive it is asked for.
 *
 * Before this, the readers here ignored their `drive` argument —
 * `(_drive, params) => …`, `mockResolvedValue` — so "drive A's response"
 * and "drive B's response" were the same object universe, distinguished
 * only by when the fixture was armed. A population that cannot tell a
 * request for A from a request for B cannot witness a guard whose whole
 * job is telling them apart, and this file proved it: rewiring the page
 * to fetch a hardcoded foreign drive left every case in it green. That
 * is `review-workflow.md` detector rule 5 sitting in the guard's own
 * fixture rather than in what the guard guards, and it is why five
 * consecutive rounds shipped a drive mix-up.
 *
 * A drive with no entry answers with names that are in none of the
 * declared sets, so a request made for the wrong drive is *readable on
 * screen* rather than indistinguishable from an empty row. Rejecting
 * would not do that: a failed fetch draws an empty row, which several
 * other things also produce.
 */
function foreignFiles(drive: string): SectionFiles {
  return {
    recentAdded: `wrong-drive(${drive}):added`,
    favorites: `wrong-drive(${drive}):favorite`,
    liked: `wrong-drive(${drive}):liked`,
  };
}

function foreignWatch(drive: string): WatchRowItems {
  return {
    continueWatching: `wrong-drive(${drive}):continuing`,
    recentlyPlayed: `wrong-drive(${drive}):played`,
  };
}

const filesByDrive = new Map<string, SectionFiles>();
const watchByDrive = new Map<string, WatchRowItems>();
const heldRowBatches = new Map<string, (params: Record<string, unknown>) => Promise<PaginatedResponse>>();
const heldWatchFetches = new Map<string, (scope?: string) => Promise<WatchHistoryItem[]>>();

function installResponders(): void {
  getDriveFiles.mockImplementation((drive, params) => {
    const held = heldRowBatches.get(drive);
    if (held) return held(params);
    return Promise.resolve(page((filesByDrive.get(drive) ?? foreignFiles(drive))[sectionOf(params)]));
  });
  getWatchHistory.mockImplementation((drive, _limit, scope) => {
    const held = heldWatchFetches.get(drive);
    if (held) return held(scope);
    return Promise.resolve([
      watchItem((watchByDrive.get(drive) ?? foreignWatch(drive))[watchRowOf(scope)]),
    ]);
  });
}

/** What a drive answers with from now on. */
function driveHasFiles(drive: string, files: SectionFiles): void {
  filesByDrive.set(drive, files);
}

function driveHasWatchHistory(drive: string, items: WatchRowItems): void {
  watchByDrive.set(drive, items);
}

/**
 * The rows on screen, by title, with the files each is drawing.
 *
 * Built from the document rather than from the fixture, and compared
 * against a literal, so a row that stops being drawn — or one that draws
 * a file belonging to another drive — moves this side of the equality
 * without the expectation moving with it.
 */
function rowsOnScreen(): Record<string, string[]> {
  return Object.fromEntries(
    screen.getAllByRole("region").map((section) => [
      section.getAttribute("aria-label") ?? "",
      Array.from(section.querySelectorAll("li")).map((item) => item.textContent ?? ""),
    ]),
  );
}

function expectedRows(files: SectionFiles): Record<string, string[]> {
  return {
    [SECTION_TITLES.recentAdded]: [files.recentAdded],
    [SECTION_TITLES.favorites]: [files.favorites],
    [SECTION_TITLES.liked]: [files.liked],
  };
}

/**
 * A batch of row responses the test is holding open, one per row, and
 * the assertion that they are still held.
 *
 * The precondition is that the batch has not been applied yet, and that
 * is not readable off the document: a batch that settled before the page
 * moved draws exactly what one still in flight draws, since the rows
 * keep the files they already had. `expectRowBatchStillHeld` is what
 * reads it, off the responses the component was handed.
 *
 * Held **for one drive and for one batch**: once all three rows have
 * been handed their promise the hold is released, so a return visit and
 * a retry both fall through to the drive's declared list. That is what
 * lets a case hold the first visit's batch and still see the third
 * render fetch normally.
 */
function holdRowBatch(drive: string): {
  resolve: (files: SectionFiles) => void;
  reject: () => void;
  promises: Record<SectionKey, Promise<PaginatedResponse>>;
} {
  const resolvers = {} as Record<SectionKey, (response: PaginatedResponse) => void>;
  const rejecters = {} as Record<SectionKey, () => void>;
  const promises = {} as Record<SectionKey, Promise<PaginatedResponse>>;
  for (const key of SECTION_KEYS) {
    promises[key] = new Promise<PaginatedResponse>((resolve, rej) => {
      resolvers[key] = resolve;
      rejecters[key] = () => rej(new Error(`getDriveFiles failed for ${key}`));
    });
  }
  const pending = new Set<SectionKey>(SECTION_KEYS);
  heldRowBatches.set(drive, (params) => {
    const key = sectionOf(params);
    pending.delete(key);
    if (pending.size === 0) heldRowBatches.delete(drive);
    return promises[key];
  });
  return {
    resolve: (files) => {
      for (const key of SECTION_KEYS) resolvers[key](page(files[key]));
    },
    reject: () => {
      for (const key of SECTION_KEYS) rejecters[key]();
    },
    promises,
  };
}

/**
 * The watch fetches this test is holding open, one per watch row.
 *
 * Same shape and same precondition problem as `holdRowBatch`: a fetch
 * that settled before the page moved draws what one still in flight
 * draws, because the rows keep what they had. Released once both rows
 * have been handed their promise, so a later visit fetches normally.
 */
function holdWatchFetches(drive: string): {
  resolve: (items: WatchRowItems) => void;
  promises: Record<WatchKey, Promise<WatchHistoryItem[]>>;
} {
  const resolvers = {} as Record<WatchKey, (items: WatchHistoryItem[]) => void>;
  const promises = {} as Record<WatchKey, Promise<WatchHistoryItem[]>>;
  for (const key of WATCH_KEYS) {
    promises[key] = new Promise<WatchHistoryItem[]>((resolve) => {
      resolvers[key] = resolve;
    });
  }
  const pending = new Set<WatchKey>(WATCH_KEYS);
  heldWatchFetches.set(drive, (scope) => {
    const key = watchRowOf(scope);
    pending.delete(key);
    if (pending.size === 0) heldWatchFetches.delete(drive);
    return promises[key];
  });
  return {
    resolve: (items) => {
      for (const key of WATCH_KEYS) resolvers[key]([watchItem(items[key])]);
    },
    promises,
  };
}

async function expectStillHeld(promises: Promise<unknown>[]): Promise<void> {
  let settled = false;
  const mark = () => {
    settled = true;
  };
  for (const promise of promises) void promise.then(mark, mark);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(settled).toBe(false);
}

/**
 * The batch the component was handed is the one this test is holding.
 *
 * Identity, with `toBe`. `toEqual` cannot tell two Promises apart: a
 * Promise has no own enumerable properties, so a deep equality between
 * any two of them holds — including between a held one and one that
 * resolved before the assertion ran, which is the ordering these cases
 * do not need a guard for. And the promises checked for having gone
 * nowhere are the ones read back out of the mock, not the fixture's own
 * copies, which nothing would resolve either way.
 */
async function expectRowBatchStillHeld(
  held: Record<SectionKey, Promise<PaginatedResponse>>,
): Promise<void> {
  const calls = getDriveFiles.mock.calls.slice(-SECTION_KEYS.length);
  const received = getDriveFiles.mock.results
    .slice(-SECTION_KEYS.length)
    .map((result) => result.value as Promise<PaginatedResponse>);

  // One request per row, declared rather than counted: a row that stops
  // being fetched drops out of this set instead of shortening a length.
  expect(new Set(calls.map(([, params]) => sectionOf(params)))).toEqual(new Set(SECTION_KEYS));
  calls.forEach(([, params], index) => {
    expect(received[index]).toBe(held[sectionOf(params)]);
  });

  await expectStillHeld(received);
}

/**
 * The watch fetches the component was handed are the ones being held.
 *
 * Identity with `toBe`, for the reason `expectRowBatchStillHeld` gives.
 * The promises read back are the mock's own returns; the component holds
 * a `.catch()` derivative of each, which is a different object and not
 * what this is about.
 */
async function expectWatchFetchesStillHeld(
  held: Record<WatchKey, Promise<WatchHistoryItem[]>>,
): Promise<void> {
  const calls = getWatchHistory.mock.calls.slice(-WATCH_KEYS.length);
  const received = getWatchHistory.mock.results
    .slice(-WATCH_KEYS.length)
    .map((result) => result.value as Promise<WatchHistoryItem[]>);

  // One request per watch row, declared rather than counted: a row that
  // stops being fetched drops out of this set instead of shortening a
  // length.
  expect(new Set(calls.map(([, , scope]) => watchRowOf(scope)))).toEqual(new Set(WATCH_KEYS));
  calls.forEach(([, , scope], index) => {
    expect(received[index]).toBe(held[watchRowOf(scope)]);
  });

  await expectStillHeld(received);
}

/** The whole page's rows when the viewer has a profile. */
function expectedPageWithWatchRows(
  files: SectionFiles,
  watch: WatchRowItems,
): Record<string, string[]> {
  return {
    [WATCH_TITLES.continueWatching]: [watch.continueWatching],
    [WATCH_TITLES.recentlyPlayed]: [watch.recentlyPlayed],
    ...expectedRows(files),
  };
}

describe("DriveHome across a drive change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filesByDrive.clear();
    watchByDrive.clear();
    heldRowBatches.clear();
    heldWatchFetches.clear();
    fileActionCallbacks.length = 0;
    // No profile unless a case gives one, so the watch rows are off the
    // page and `getWatchHistory` is not reached at all.
    profile.nickname = null;
    installResponders();
  });

  it("keeps the drive that was left out of the rows when its batch lands last", async () => {
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_A_FILES)));

    // The rows refetch themselves after any file action on one of them,
    // so this entrance is reached by trashing or favouriting a file with
    // no WebSocket involved at all.
    const held = holdRowBatch(DRIVE_UNDER_TEST);
    fireEvent.click(screen.getByRole("button", { name: `act on ${SECTION_TITLES.recentAdded}` }));

    await expectRowBatchStillHeld(held.promises);

    driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_B_FILES)));

    await act(async () => {
      held.resolve(DRIVE_A_FILES);
    });

    // Every row still reads this drive. The failure this covers is a
    // resting state, not a flicker: the rows would keep the drive that
    // was left, under this drive's "See all" links, with nothing on
    // screen saying where the files came from.
    expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_B_FILES));
    for (const name of Object.values(DRIVE_A_FILES)) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("keeps a batch from an earlier visit to this drive out of the rows", async () => {
    // The same drive name at both ends of the trip, so nothing that
    // compares names can separate the two requests made for it. The
    // component is not remounted in between: `/drive/[name]` renders it
    // with no `key`, so the first visit's batch is still in flight when
    // the third render arrives.
    const firstVisit = holdRowBatch(DRIVE_UNDER_TEST);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await expectRowBatchStillHeld(firstVisit.promises);

    driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_B_FILES)));

    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_REVISIT_FILES);
    rerender(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_A_REVISIT_FILES)));

    await act(async () => {
      firstVisit.resolve(DRIVE_A_FILES);
    });

    // The rows read this visit. The failure this covers is what a user
    // sees after trashing a file here, stepping to another drive and
    // coming back: the pre-action batch would put the file back into
    // Recently Added, Favorites and Liked and leave it there.
    expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_A_REVISIT_FILES));
    for (const name of Object.values(DRIVE_A_FILES)) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("keeps a refetch a row captured on the drive that was left out of the rows", async () => {
    // The entrance a per-request identity cannot see. A carousel calls
    // `onFileAction` when the trash or favourite it started comes back,
    // on the callback it captured when the action began — so a file
    // trashed on this drive, with the page moved on before the request
    // returns, issues a **brand-new** batch for the drive that was left.
    // That batch is the newest on the stream and would pass any test of
    // "is this the latest request"; only the drive it was made for tells
    // it apart from a legitimate refetch.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_A_FILES)));

    // The callback this drive's rows are holding, taken before the page
    // moves. Invoking the *button* after the rerender would call the
    // second drive's callback, which is a different case entirely.
    const capturedOnThisDrive = fileActionCallbacks.at(-1)!;

    driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_B_FILES)));

    // The drive that was left has since changed, so if its batch landed
    // the rows would say so with names from neither of the sets above.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_REVISIT_FILES);
    await act(async () => {
      capturedOnThisDrive();
    });

    // The new batch really was fetched for the drive that was left: the
    // precondition, witnessed. Without it this case passes on a callback
    // that fetched nothing at all.
    expect(getDriveFiles.mock.calls.at(-1)?.[0]).toBe(DRIVE_UNDER_TEST);

    expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_B_FILES));
    for (const name of Object.values(DRIVE_A_REVISIT_FILES)) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("keeps the rows when a same-drive refetch fails under the page load", async () => {
    // No drive change here at all. Both batches are for the drive in
    // front of you: the page load's own, and a refetch started under it
    // — `onFileAction` here, and a WS `drive.structure_changed` reaches
    // the same `refetchAllSections` with no user action at all. The
    // refetch fails.
    //
    // A guard that drops everything but the newest request in flight
    // throws the good batch away before the refetch is known to have
    // failed. `Promise.allSettled` means the failed one still arrives,
    // so instead of vanishing the three rows are written empty and stay
    // there for the rest of the visit.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    const pageLoad = holdRowBatch(DRIVE_UNDER_TEST);
    render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await expectRowBatchStillHeld(pageLoad.promises);

    const refetch = holdRowBatch(DRIVE_UNDER_TEST);
    fireEvent.click(screen.getByRole("button", { name: `act on ${SECTION_TITLES.recentAdded}` }));
    await expectRowBatchStillHeld(refetch.promises);

    // The page load's own batch lands first and is good; the refetch
    // that superseded it then fails.
    await act(async () => {
      pageLoad.resolve(DRIVE_A_FILES);
    });
    await act(async () => {
      refetch.reject();
    });

    expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_A_FILES));
  });

  it("keeps the rows when the failed refetch lands before the page load", async () => {
    // The other settling order. Here the failed batch is applied first,
    // so what has to hold is that a batch which delivered nothing did
    // not claim the stream — `Promise.allSettled` resolves whether or
    // not anything came back, so "arrived" and "delivered" are two
    // different things and only one of them may supersede.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    const pageLoad = holdRowBatch(DRIVE_UNDER_TEST);
    render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await expectRowBatchStillHeld(pageLoad.promises);

    const refetch = holdRowBatch(DRIVE_UNDER_TEST);
    fireEvent.click(screen.getByRole("button", { name: `act on ${SECTION_TITLES.recentAdded}` }));
    await expectRowBatchStillHeld(refetch.promises);

    await act(async () => {
      refetch.reject();
    });
    await act(async () => {
      pageLoad.resolve(DRIVE_A_FILES);
    });

    expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_A_FILES));
  });

  it("keeps the drive that was left out of the rows when this drive's batch fails", async () => {
    // The rows' half of the same structural claim the grid now makes.
    // `applyFileSections` keeps a row's files when its request fails, so
    // across a drive change "what it had" would be the previous drive's
    // files — and nothing in that function can tell the two apart,
    // because the failure branch is reached with the drive already
    // checked. What scopes it is the fetch effect emptying all three
    // rows on every drive change, which is what the grid did not do for
    // six rounds.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_A_FILES)));

    const failing = holdRowBatch(SECOND_DRIVE);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await act(async () => {
      failing.reject();
    });

    // Three rows, all empty — the same thing a drive with no files
    // draws. Not the drive that was left.
    expect(rowsOnScreen()).toEqual({
      [SECTION_TITLES.recentAdded]: [],
      [SECTION_TITLES.favorites]: [],
      [SECTION_TITLES.liked]: [],
    });
    for (const name of Object.values(DRIVE_A_FILES)) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("keeps the watch rows fetched for the drive that was left off this drive's page", async () => {
    // The other stream. Nothing on a `getWatchHistory` response says
    // which drive it was made for — the component throws the request
    // away and keeps only the array — so the rows cannot be guarded the
    // way the carousels are. What separates them is the page load that
    // asked: the fetch effect mints an id, and a run whose id is no
    // longer current writes nothing.
    profile.nickname = "someone";
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    driveHasWatchHistory(DRIVE_UNDER_TEST, DRIVE_A_WATCH);

    const leftBehind = holdWatchFetches(DRIVE_UNDER_TEST);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await expectWatchFetchesStillHeld(leftBehind.promises);

    driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
    driveHasWatchHistory(SECOND_DRIVE, DRIVE_B_WATCH);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(rowsOnScreen()).toEqual(expectedPageWithWatchRows(DRIVE_B_FILES, DRIVE_B_WATCH)),
    );

    await act(async () => {
      leftBehind.resolve(DRIVE_A_WATCH);
    });

    // Both watch rows still read this drive. Unguarded, the drive that
    // was left would put its half-finished videos under this drive's
    // links, and "remove from history" on one of them would act on a
    // file this drive may not even hold.
    expect(rowsOnScreen()).toEqual(expectedPageWithWatchRows(DRIVE_B_FILES, DRIVE_B_WATCH));
    for (const name of Object.values(DRIVE_A_WATCH)) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("keeps a watch fetch from an earlier visit to this drive off the revisit", async () => {
    // The axis the case above cannot reach. There the two runs were made
    // for different drives, so a guard comparing drive names satisfies it
    // by construction; here the same drive is on both ends of the trip and
    // only the page load tells the two runs apart. The component is not
    // remounted in between — `/drive/[name]` renders it with no `key` — so
    // the first visit's fetches are still in flight on this instance when
    // the third render arrives.
    profile.nickname = "someone";
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    driveHasWatchHistory(DRIVE_UNDER_TEST, DRIVE_A_WATCH);

    const firstVisit = holdWatchFetches(DRIVE_UNDER_TEST);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await expectWatchFetchesStillHeld(firstVisit.promises);

    driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
    driveHasWatchHistory(SECOND_DRIVE, DRIVE_B_WATCH);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(rowsOnScreen()).toEqual(expectedPageWithWatchRows(DRIVE_B_FILES, DRIVE_B_WATCH)),
    );

    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_REVISIT_FILES);
    driveHasWatchHistory(DRIVE_UNDER_TEST, DRIVE_A_REVISIT_WATCH);
    rerender(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() =>
      expect(rowsOnScreen()).toEqual(
        expectedPageWithWatchRows(DRIVE_A_REVISIT_FILES, DRIVE_A_REVISIT_WATCH),
      ),
    );

    await act(async () => {
      firstVisit.resolve(DRIVE_A_WATCH);
    });

    // The revisit's rows survive. What a user does to reach this is press
    // the drive switcher twice: the first visit's history comes back after
    // the second one's is already on screen, and puts a file they have
    // since finished back into Continue watching.
    expect(rowsOnScreen()).toEqual(
      expectedPageWithWatchRows(DRIVE_A_REVISIT_FILES, DRIVE_A_REVISIT_WATCH),
    );
    for (const name of Object.values(DRIVE_A_WATCH)) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

});
