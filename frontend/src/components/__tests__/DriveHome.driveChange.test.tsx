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

vi.mock("../RootFileListing", () => ({ RootFileListing: () => <div /> }));
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

/**
 * A folder path both drives have.
 *
 * `file_path` is drive-relative and its UNIQUE constraint is per-drive
 * (`design-decisions.md`, "Drive-partitioned tables"), so the same
 * string is a different folder on each of them — which is what makes a
 * pin from the drive that was left land on something here.
 */
const SHARED_FOLDER_NAME = "alfa";

/** A folder only the second drive has, so its grid says it has landed. */
const SECOND_DRIVE_FOLDER_NAME = "lima";

/**
 * How many folder cards the grid is drawing **that are not being
 * renamed**.
 *
 * Read off the card's own rename-focus attribute rather than off its
 * name: the context-menu stub reports its target's path too, so a search
 * by text matches both. `FolderCard` puts that attribute on its
 * non-editing branch only, so a card with the inline editor open is not
 * counted. Inert while no case in this file starts a rename, and the
 * first one that does is the case this would mislead — which is why the
 * name says what it counts rather than what it is used for.
 *
 * **Why document-wide is sound here**, and it is not "everything else is
 * stubbed": `CarouselSection` and `FolderContextMenu` both draw real
 * elements in this file, and `FolderCard`, `InlineNameEditor` and
 * `Button` are not stubbed at all. It is that the attribute has one
 * producer, `FolderCard`, and the only other host that draws folder
 * cards — `RootFileListing` — is stubbed to a `<div />` here. Give that
 * stub a card carrying the attribute and the case below goes red, which
 * is the property this rests on rather than a convention.
 *
 * `DriveHome.folderGrid.test.tsx` takes the other choice for the same
 * hazard: it scopes to the Folders section because `RootFileListing` is
 * live in production. Its declared survivor records that the scoping is
 * unwitnessed *there* — so it is a precedent for naming the hazard, not
 * authority for reading unscoped.
 */
function folderCardCount(): number {
  return document.querySelectorAll("[data-rename-focus]").length;
}

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

  it("marks a folder pinned on the drive it was pinned on", async () => {
    // The positive half of the case below. A guard read only for what
    // it discards cannot tell "correctly dropped" from "never applied":
    // inverted, every pin made on the drive in front of you would leave
    // the menu still offering Pin, and nothing else in the suite asks.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    driveHasFolders(DRIVE_UNDER_TEST, [SHARED_FOLDER_NAME]);
    render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(screen.getByText(SHARED_FOLDER_NAME)).toBeInTheDocument());

    fireEvent.contextMenu(screen.getByText(SHARED_FOLDER_NAME));
    expect(screen.getByTestId("pin-state")).toHaveTextContent("not pinned");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle pin" }));
    });

    expect(addPin).toHaveBeenCalledWith(DRIVE_UNDER_TEST, SHARED_FOLDER_NAME);
    // Anchored: "pinned" is a substring of "not pinned", so an
    // unanchored read of this element holds in both states.
    expect(screen.getByTestId("pin-state")).toHaveTextContent(/^pinned$/);
  });

  it("keeps a pin set fetched for the drive that was left out of this drive's", async () => {
    // The pin set is fetched only by the page's own effect, so this
    // covers the tail of an effect whose page load has been superseded —
    // the writes that have no request of their own to answer to.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    driveHasFolders(DRIVE_UNDER_TEST, [SHARED_FOLDER_NAME]);

    let resolveFirstPins: (pins: { path: string }[]) => void = () => {};
    heldPinFetches.set(
      DRIVE_UNDER_TEST,
      () =>
        new Promise<{ path: string }[]>((resolve) => {
          resolveFirstPins = resolve;
        }),
    );
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);

    // The first drive's pin fetch is still in flight when the page moves
    // on, so what lands below is its effect's tail and not a second
    // copy of the case above.
    await expectStillHeld([getPins.mock.results[0]?.value as Promise<unknown>]);

    driveHasPins(SECOND_DRIVE, [SHARED_FOLDER_NAME]);
    driveHasFolders(SECOND_DRIVE, [SHARED_FOLDER_NAME, SECOND_DRIVE_FOLDER_NAME]);
    driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() => expect(screen.getByText(SECOND_DRIVE_FOLDER_NAME)).toBeInTheDocument());

    // This drive's own pin set reached the screen: the positive half.
    fireEvent.contextMenu(screen.getByText(SHARED_FOLDER_NAME));
    expect(screen.getByTestId("pin-state")).toHaveTextContent(/^pinned$/);

    await act(async () => {
      resolveFirstPins([]);
    });

    // The drive that was left has no pins, and saying so here would
    // unmark a folder this drive does pin.
    expect(screen.getByTestId("pin-state")).toHaveTextContent(/^pinned$/);
  });

  it("closes a folder context menu when the page changes drive", async () => {
    // `menuTarget` is a `Folder` from the drive it was opened on, and
    // `handleTogglePin` closes over the *current* `driveName` — so a menu
    // that survives a navigation offers Pin on a folder the page has
    // left, and toggling it would call `addPin` with this drive and that
    // folder's path. Measured before the fix: the menu stayed open.
    //
    // Scoped by the reset rather than by a check at each of the two call
    // sites that open it, which is the same move the folder list itself
    // now takes.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    driveHasFolders(DRIVE_UNDER_TEST, [SHARED_FOLDER_NAME]);
    driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
    driveHasFolders(SECOND_DRIVE, [SECOND_DRIVE_FOLDER_NAME]);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(screen.getByText(SHARED_FOLDER_NAME)).toBeInTheDocument());

    fireEvent.contextMenu(screen.getByText(SHARED_FOLDER_NAME));
    // The precondition: the menu really is open on this drive, so the
    // assertion below cannot pass on a menu that never opened.
    expect(screen.getByTestId("pin-state")).toBeInTheDocument();

    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(screen.getByText(SECOND_DRIVE_FOLDER_NAME)).toBeInTheDocument(),
    );

    expect(screen.queryByTestId("pin-state")).toBeNull();
  });

  it("marks a pin that spans a re-run of the fetch effect on this drive", async () => {
    // The pin write answers to the **drive**, not to the page load. That
    // id bumps for every dependency the fetch effect has — `nickname`
    // among them — so gating on it dropped a pin made on the drive in
    // front of you whenever the nickname settled mid-request, leaving
    // the folder marked unpinned against a server that had pinned it.
    //
    // The effect's own re-fetch is allowed to land completely before the
    // pin does, so this measures the guard rather than the order the two
    // writes happened to arrive in — and *that* is waited on rather than
    // assumed. Waiting on `getPins` having been called is a wait on the
    // request, not on the write it dispatches (detector rule 3): with the
    // second `getPins` held so the tail could never run, this case stayed
    // green while declaring the opposite.
    //
    // What is waited on instead is the grid coming back. The re-run swaps
    // it for the skeleton synchronously, and the cards return only in the
    // effect's gated tail — the same synchronous block, and so the same
    // React commit, as the `setPinnedPaths` this case is about.
    //
    // The other interleaving is a real defect and is not this case's:
    // released the other way round, the pin lands and the tail then
    // *replaces* the set with the pre-pin one it was dispatched with. It
    // reproduces on `origin/develop`, so it is written up as F-3 rather
    // than fixed here.
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    driveHasFolders(DRIVE_UNDER_TEST, [SHARED_FOLDER_NAME]);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(screen.getByText(SHARED_FOLDER_NAME)).toBeInTheDocument());

    fireEvent.contextMenu(screen.getByText(SHARED_FOLDER_NAME));
    expect(screen.getByTestId("pin-state")).toHaveTextContent("not pinned");

    let finishPin: () => void = () => {};
    addPin.mockReturnValue(
      new Promise<void>((resolve) => {
        finishPin = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "toggle pin" }));

    profile.nickname = "someone";
    rerender(<DriveHome driveName={DRIVE_UNDER_TEST} />);

    // The re-run blanks the grid to its skeleton...
    await waitFor(() => expect(folderCardCount()).toBe(0));
    // ...and the cards come back only when the effect's tail runs, which
    // is the write this case needs to have landed.
    await waitFor(() => expect(folderCardCount()).toBe(1));

    await act(async () => {
      finishPin();
    });

    expect(addPin).toHaveBeenCalledWith(DRIVE_UNDER_TEST, SHARED_FOLDER_NAME);
    expect(screen.getByTestId("pin-state")).toHaveTextContent(/^pinned$/);
  });

  it("draws nothing when a long-press begun on the drive that was left fires after the change", async () => {
    // The witness `setMenuTarget(null)` did not have, and the reason
    // that line rather than `closeFolderMenu()` is the one carrying the
    // risk: `useContextMenu.handleTouchStart` arms a 500 ms timer that
    // opens the menu, and nothing cancels it on a drive change. So a
    // long-press begun before the navigation re-opens the menu after it,
    // and only a null target keeps it from drawing the previous drive's
    // folder — with `onTogglePin` closed over the drive in front of you.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
      driveHasFolders(DRIVE_UNDER_TEST, [SHARED_FOLDER_NAME]);
      driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
      driveHasFolders(SECOND_DRIVE, [SECOND_DRIVE_FOLDER_NAME]);
      const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
      await waitFor(() => expect(screen.getByText(SHARED_FOLDER_NAME)).toBeInTheDocument());

      // Begun, not completed: the timer is armed and the menu is not open.
      fireEvent.touchStart(screen.getByText(SHARED_FOLDER_NAME), {
        touches: [{ clientX: 10, clientY: 10 }],
      });
      expect(screen.queryByTestId("pin-state")).toBeNull();

      rerender(<DriveHome driveName={SECOND_DRIVE} />);
      await waitFor(() =>
        expect(screen.getByText(SECOND_DRIVE_FOLDER_NAME)).toBeInTheDocument(),
      );

      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      // The precondition, and it has to be read off the parent's own
      // state: the timer really did fire and really did ask for the menu
      // to open. Without this the case passes on a press that never
      // happened, which is what it did when first written.
      expect(screen.getByTestId("menu-open")).toHaveTextContent("true");

      // And nothing is drawn, because the target is gone.
      expect(screen.queryByTestId("menu-target")).toBeNull();
      expect(screen.queryByTestId("pin-state")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a pin made on the drive that was left out of this drive's pin set", async () => {
    driveHasFiles(DRIVE_UNDER_TEST, DRIVE_A_FILES);
    driveHasFolders(DRIVE_UNDER_TEST, [SHARED_FOLDER_NAME]);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(screen.getByText(SHARED_FOLDER_NAME)).toBeInTheDocument());

    fireEvent.contextMenu(screen.getByText(SHARED_FOLDER_NAME));
    expect(screen.getByTestId("pin-state")).toHaveTextContent("not pinned");

    let resolvePin: () => void = () => {};
    addPin.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePin = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "toggle pin" }));
    expect(addPin).toHaveBeenCalledWith(DRIVE_UNDER_TEST, SHARED_FOLDER_NAME);
    await expectStillHeld([addPin.mock.results.at(-1)?.value as Promise<void>]);

    // The second drive has a folder of the same path, and one of its own
    // so that the grid can say the change has landed.
    driveHasFolders(SECOND_DRIVE, [SHARED_FOLDER_NAME, SECOND_DRIVE_FOLDER_NAME]);
    driveHasFiles(SECOND_DRIVE, DRIVE_B_FILES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() => expect(screen.getByText(SECOND_DRIVE_FOLDER_NAME)).toBeInTheDocument());

    // The menu is reopened on *this* drive's folder of that path, so
    // what is read below is whether this drive's folder is pinned — not
    // whether the card the pin was made on still points at a pinned
    // path.
    fireEvent.contextMenu(screen.getByText(SHARED_FOLDER_NAME));

    await act(async () => {
      resolvePin();
    });

    expect(screen.getByTestId("pin-state")).toHaveTextContent("not pinned");
  });
});
