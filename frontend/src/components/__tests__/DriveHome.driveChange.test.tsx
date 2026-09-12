import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FileItem, Folder as FolderType, PaginatedResponse } from "@/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const getDriveFiles = vi.fn<(drive: string, params: Record<string, unknown>) => Promise<PaginatedResponse>>();
const getFolders = vi.fn<(drive: string) => Promise<FolderType[]>>();
const addPin = vi.fn<(drive: string, path: string) => Promise<void>>();
const getPins = vi.fn<(drive: string) => Promise<{ path: string }[]>>();

vi.mock("@/lib/api", () => ({
  getDriveFiles: (drive: string, params: Record<string, unknown>) => getDriveFiles(drive, params),
  getFolders: (drive: string) => getFolders(drive),
  addPin: (drive: string, path: string) => addPin(drive, path),
  getPins: (drive: string) => getPins(drive),
  getWatchHistory: vi.fn(() => Promise.resolve([])),
  removePin: vi.fn(() => Promise.resolve()),
  createFolder: vi.fn(() => Promise.resolve()),
}));

vi.mock("../AddonSlot", () => ({ AddonSlot: () => <div /> }));
vi.mock("../ContinueWatchingSection", () => ({ ContinueWatchingSection: () => <div /> }));
vi.mock("../PageHeader", () => ({ PageHeader: () => <div /> }));
vi.mock("../TreeToggle", () => ({ TreeToggle: () => <div /> }));

// The rows and the folder context menu are the two surfaces this file
// reads state through, so both are stood in for by something that draws
// what it was handed and nothing else.
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

// **Both halves of the real gate.** `FolderContextMenu` returns null
// unless `open` *and* `target` are set, and a stand-in that honours one
// of them measures half the component: with only `open` modelled, the
// case below passes on `closeFolderMenu()` alone and `setMenuTarget(null)`
// — the line that carries the production risk — has no witness at all.
// Fixing a stub for one prop of a two-prop gate is the same error one
// prop over.
vi.mock("../FolderContextMenu", () => ({
  FolderContextMenu: ({
    open,
    target,
    isPinned,
    onTogglePin,
  }: {
    open: boolean;
    target: { path: string } | null;
    isPinned: boolean;
    onTogglePin?: () => void;
  }) =>
    (
      <div>
        {/* The parent's own `open` state, reported whether or not the
            menu draws. Not part of the gate — it is how a case can say
            "the long-press timer fired" at all, which is otherwise
            invisible precisely because the target is null. */}
        <span data-testid="menu-open">{String(open)}</span>
        {open && target ? (
          <>
            <span data-testid="pin-state">{isPinned ? "pinned" : "not pinned"}</span>
            <span data-testid="menu-target">{target.path}</span>
            <button type="button" onClick={onTogglePin}>
              toggle pin
            </button>
          </>
        ) : null}
      </div>
    ),
}));

vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));
// Mutable: the fetch effect depends on `hasProfile` / `nickname`, so a
// nickname settling re-runs it on one drive with no navigation. One case
// below is about a write that spans exactly that.
const profile: { nickname: string | null } = { nickname: null };
vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: profile.nickname }),
}));
vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));

import { DriveHome } from "../DriveHome";

/**
 * What a response that outlived the drive it was made for may write.
 *
 * The folder grid's two entrances are covered next door in
 * `DriveHome.folderGrid.test.tsx`; this file covers the rest of the page
 * — the Recently Added / Favorites / Liked rows, and the pin set — where
 * the same request outliving the same drive change writes the drive that
 * was left under this drive's links. Both are also taken across a return
 * to the drive the request was made for, where the name is the same on
 * both ends and only the request tells the two apart, and both have a
 * case where the response does reach the screen, so a guard that
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


function folder(name: string): FolderType {
  return { name, path: name, file_count: 1, kind_counts: { video: 1 }, dominant_kind: "video" };
}

function page(title: string): PaginatedResponse {
  return { data: [{ id: title, title } as FileItem], meta: { total: 1 } as PaginatedResponse["meta"] };
}

/** Which row a `getDriveFiles` call is for, read off its query. */
function sectionOf(params: Record<string, unknown>): SectionKey {
  if (params.favorite === true) return "favorites";
  if (params.liked === true) return "liked";
  return "recentAdded";
}

const DRIVE_UNDER_TEST = "drive-under-test";
const SECOND_DRIVE = "second-drive";

/**
 * Every read answers according to the drive it is asked for.
 *
 * Before this, `getDriveFiles`, `getFolders` and `getPins` all ignored
 * their `drive` argument — `(_drive, params) => …`, `mockResolvedValue` —
 * so "drive A's response" and "drive B's response" were the same object
 * universe, distinguished only by when the fixture was armed. A
 * population that cannot tell a request for A from a request for B
 * cannot witness a guard whose whole job is telling them apart, and this
 * file proved it: rewiring the page to fetch a hardcoded foreign drive
 * for its three rows, or for its pin set, left all seventeen cases green.
 * That is `review-workflow.md` detector rule 5 sitting in the guard's own
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

const filesByDrive = new Map<string, SectionFiles>();
const foldersByDrive = new Map<string, readonly string[]>();
const pinsByDrive = new Map<string, readonly string[]>();
const heldRowBatches = new Map<string, (params: Record<string, unknown>) => Promise<PaginatedResponse>>();
const heldPinFetches = new Map<string, () => Promise<{ path: string }[]>>();

function installResponders(): void {
  getDriveFiles.mockImplementation((drive, params) => {
    const held = heldRowBatches.get(drive);
    if (held) return held(params);
    return Promise.resolve(page((filesByDrive.get(drive) ?? foreignFiles(drive))[sectionOf(params)]));
  });
  getFolders.mockImplementation((drive) =>
    Promise.resolve((foldersByDrive.get(drive) ?? [`wrong-drive(${drive})`]).map(folder)),
  );
  getPins.mockImplementation((drive) => {
    const held = heldPinFetches.get(drive);
    if (held) {
      heldPinFetches.delete(drive);
      return held();
    }
    // An undeclared drive answers with a readable path, for the reason
    // the other two responders do. Answering `[]` was the outcome the
    // docstring above rejects for them: a wrong-drive pin fetch would
    // then be detectable only where the correct drive has a *non-empty*
    // declared set, which is one of the three pin cases.
    return Promise.resolve(
      (pinsByDrive.get(drive) ?? [`wrong-drive(${drive})`]).map((path) => ({ path })),
    );
  });
}

/** What a drive answers with from now on. */
function driveHasFiles(drive: string, files: SectionFiles): void {
  filesByDrive.set(drive, files);
}

function driveHasFolders(drive: string, names: readonly string[]): void {
  foldersByDrive.set(drive, names);
}

function driveHasPins(drive: string, paths: readonly string[]): void {
  pinsByDrive.set(drive, paths);
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

describe("DriveHome across a drive change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filesByDrive.clear();
    foldersByDrive.clear();
    pinsByDrive.clear();
    heldRowBatches.clear();
    heldPinFetches.clear();
    fileActionCallbacks.length = 0;
    profile.nickname = null;
    // Neither drive has folders unless a case says so, and neither has
    // pins. Declared per drive rather than globally, so a read for a
    // third drive is still the foreign answer.
    driveHasFolders(DRIVE_UNDER_TEST, []);
    driveHasFolders(SECOND_DRIVE, []);
    driveHasPins(DRIVE_UNDER_TEST, []);
    driveHasPins(SECOND_DRIVE, []);
    installResponders();
    addPin.mockResolvedValue(undefined);
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

});
