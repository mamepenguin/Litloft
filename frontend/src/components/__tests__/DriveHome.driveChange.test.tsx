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
vi.mock("../CarouselSection", () => ({
  CarouselSection: ({
    title,
    files,
    onFileAction,
  }: {
    title: string;
    files: FileItem[];
    onFileAction?: () => void;
  }) => (
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
  ),
}));

vi.mock("../FolderContextMenu", () => ({
  FolderContextMenu: ({
    isPinned,
    onTogglePin,
  }: {
    isPinned: boolean;
    onTogglePin?: () => void;
  }) => (
    <div>
      <span data-testid="pin-state">{isPinned ? "pinned" : "not pinned"}</span>
      <button type="button" onClick={onTogglePin}>
        toggle pin
      </button>
    </div>
  ),
}));

vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));
vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: null }),
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

function respondWith(files: SectionFiles): void {
  getDriveFiles.mockImplementation((_drive, params) => Promise.resolve(page(files[sectionOf(params)])));
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
 */
function heldRowResponses(): {
  responseFor: (params: Record<string, unknown>) => Promise<PaginatedResponse>;
  resolve: (files: SectionFiles) => void;
  promises: Record<SectionKey, Promise<PaginatedResponse>>;
} {
  const resolvers = {} as Record<SectionKey, (response: PaginatedResponse) => void>;
  const promises = {} as Record<SectionKey, Promise<PaginatedResponse>>;
  for (const key of SECTION_KEYS) {
    promises[key] = new Promise<PaginatedResponse>((resolve) => {
      resolvers[key] = resolve;
    });
  }
  return {
    responseFor: (params) => promises[sectionOf(params)],
    resolve: (files) => {
      for (const key of SECTION_KEYS) resolvers[key](page(files[key]));
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
    getFolders.mockResolvedValue([]);
    getPins.mockResolvedValue([]);
    addPin.mockResolvedValue(undefined);
  });

  it("keeps the drive that was left out of the rows when its batch lands last", async () => {
    respondWith(DRIVE_A_FILES);
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_A_FILES)));

    // The rows refetch themselves after any file action on one of them,
    // so this entrance is reached by trashing or favouriting a file with
    // no WebSocket involved at all.
    const held = heldRowResponses();
    getDriveFiles.mockImplementation((_drive, params) => held.responseFor(params));
    fireEvent.click(screen.getByRole("button", { name: `act on ${SECTION_TITLES.recentAdded}` }));

    await expectRowBatchStillHeld(held.promises);

    respondWith(DRIVE_B_FILES);
    rerender(<DriveHome driveName="second-drive" />);
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
    const firstVisit = heldRowResponses();
    getDriveFiles.mockImplementation((_drive, params) => firstVisit.responseFor(params));
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);
    await expectRowBatchStillHeld(firstVisit.promises);

    respondWith(DRIVE_B_FILES);
    rerender(<DriveHome driveName="second-drive" />);
    await waitFor(() => expect(rowsOnScreen()).toEqual(expectedRows(DRIVE_B_FILES)));

    respondWith(DRIVE_A_REVISIT_FILES);
    rerender(<DriveHome driveName="drive-under-test" />);
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

  it("marks a folder pinned on the drive it was pinned on", async () => {
    // The positive half of the case below. A guard read only for what
    // it discards cannot tell "correctly dropped" from "never applied":
    // inverted, every pin made on the drive in front of you would leave
    // the menu still offering Pin, and nothing else in the suite asks.
    respondWith(DRIVE_A_FILES);
    getFolders.mockResolvedValue([folder(SHARED_FOLDER_NAME)]);
    render(<DriveHome driveName="drive-under-test" />);
    await waitFor(() => expect(screen.getByText(SHARED_FOLDER_NAME)).toBeInTheDocument());

    fireEvent.contextMenu(screen.getByText(SHARED_FOLDER_NAME));
    expect(screen.getByTestId("pin-state")).toHaveTextContent("not pinned");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "toggle pin" }));
    });

    expect(addPin).toHaveBeenCalledWith("drive-under-test", SHARED_FOLDER_NAME);
    // Anchored: "pinned" is a substring of "not pinned", so an
    // unanchored read of this element holds in both states.
    expect(screen.getByTestId("pin-state")).toHaveTextContent(/^pinned$/);
  });

  it("keeps a pin set fetched for the drive that was left out of this drive's", async () => {
    // The pin set is fetched only by the page's own effect, so this
    // covers the tail of an effect whose page load has been superseded —
    // the writes that have no request of their own to answer to.
    respondWith(DRIVE_A_FILES);
    getFolders.mockResolvedValue([folder(SHARED_FOLDER_NAME)]);

    let resolveFirstPins: (pins: { path: string }[]) => void = () => {};
    getPins.mockReturnValueOnce(
      new Promise<{ path: string }[]>((resolve) => {
        resolveFirstPins = resolve;
      }),
    );
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);

    // The first drive's pin fetch is still in flight when the page moves
    // on, so what lands below is its effect's tail and not a second
    // copy of the case above.
    await expectStillHeld([getPins.mock.results[0]?.value as Promise<unknown>]);

    getPins.mockResolvedValue([{ path: SHARED_FOLDER_NAME }]);
    getFolders.mockResolvedValue([folder(SHARED_FOLDER_NAME), folder(SECOND_DRIVE_FOLDER_NAME)]);
    respondWith(DRIVE_B_FILES);
    rerender(<DriveHome driveName="second-drive" />);
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

  it("keeps a pin made on the drive that was left out of this drive's pin set", async () => {
    respondWith(DRIVE_A_FILES);
    getFolders.mockResolvedValue([folder(SHARED_FOLDER_NAME)]);
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);
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
    expect(addPin).toHaveBeenCalledWith("drive-under-test", SHARED_FOLDER_NAME);
    await expectStillHeld([addPin.mock.results.at(-1)?.value as Promise<void>]);

    // The second drive has a folder of the same path, and one of its own
    // so that the grid can say the change has landed.
    getFolders.mockResolvedValue([folder(SHARED_FOLDER_NAME), folder(SECOND_DRIVE_FOLDER_NAME)]);
    respondWith(DRIVE_B_FILES);
    rerender(<DriveHome driveName="second-drive" />);
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
