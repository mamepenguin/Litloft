import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Folder as FolderType } from "@/types";

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

const getFolders = vi.fn<(drive: string) => Promise<FolderType[]>>();

vi.mock("@/lib/api", () => ({
  getFolders: (drive: string) => getFolders(drive),
  getDriveFiles: vi.fn(() => Promise.resolve({ data: [], meta: { total: 0 } })),
  getPins: vi.fn(() => Promise.resolve([])),
  getWatchHistory: vi.fn(() => Promise.resolve([])),
  addPin: vi.fn(() => Promise.resolve()),
  removePin: vi.fn(() => Promise.resolve()),
  createFolder: vi.fn(() => Promise.resolve()),
}));

// The sections around the grid are not what this file is about, and each
// drags in its own fetches and providers.
vi.mock("../RootFileListing", () => ({ RootFileListing: () => <div /> }));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => <div /> }));
vi.mock("../CarouselSection", () => ({ CarouselSection: () => <div /> }));
vi.mock("../ContinueWatchingSection", () => ({ ContinueWatchingSection: () => <div /> }));
vi.mock("../PageHeader", () => ({ PageHeader: () => <div /> }));
vi.mock("../TreeToggle", () => ({ TreeToggle: () => <div /> }));
vi.mock("../FolderContextMenu", () => ({ FolderContextMenu: () => null }));

vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));
vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: null }),
}));
vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));

import { DriveHome } from "../DriveHome";

/**
 * The folder grid caps what it draws and reveals the rest in place.
 *
 * **What this file can hold.** Membership: which folder names are in the
 * document before and after the control is used. jsdom lays nothing out,
 * so nothing here is evidence about the grid's columns, its height, or
 * whether a revealed card is on screen — only that it is reachable
 * without leaving the page.
 *
 * **What else it holds.** Which request a folder list belongs to. A
 * fetch outlives the drive it was made for, so both entrances — the
 * page's own fetch effect and `refreshFolders` — are rendered here
 * against a drive change, in both settling orders, and once against a
 * return to the drive the request was made for, where the name is the
 * same on both ends and only the request tells them apart. The
 * same-drive response reaching the screen is covered too, so a guard
 * that discards everything is not mistaken for one that discards the
 * right thing. That is a decision about whose data is written, not a
 * layout property, so jsdom is the right place for it.
 *
 * **Populations are declared, and every one of them has a witness.**
 * Deriving `HIDDEN` as `ALL.slice(CAP)` would make a deletion invisible:
 * the name would leave the fixture and the expectation at the same
 * moment (`review-workflow.md` detector rule 5). Writing a set out is
 * not on its own enough, though — a set whose only consumer is an
 * equality with itself shrinks silently too. Every set below is read by
 * a case that fails when an element leaves it, enumerated rather than
 * counted: `ALL`, `COLLAPSED` and `HIDDEN` check each other; `AT_CAP` is
 * checked by the case one folder past it, where the label counts;
 * `SECOND_DRIVE`, `SECOND_DRIVE_COLLAPSED` and `SECOND_DRIVE_HIDDEN` are
 * checked by the drive-change case and by both outliving-response cases,
 * where each single deletion moves one side of a `toEqual` or the
 * label's declared count. `REVISIT` is checked by the return-visit case,
 * which reads it out of the document twice with a competing list resolved
 * in between, and by the refresh case, which replaces a list of a
 * different length with it. A set drawn by a case that only compares it
 * against itself is not counted as a witness of it.
 */

/** Eleven folders. The names are arbitrary; the count is the point. */
const ALL_FOLDER_NAMES = [
  "alfa",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliett",
  "kilo",
] as const;

/** What the collapsed grid draws — the cap, written out. */
const COLLAPSED_FOLDER_NAMES = [
  "alfa",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
] as const;

/** What the control reveals. Declared, not `ALL.slice(8)`. */
const HIDDEN_FOLDER_NAMES = ["india", "juliett", "kilo"] as const;

/**
 * Exactly the cap, so the control has nothing to reveal.
 *
 * Its witness is the nine-folder case: that drive is this set plus
 * `NINTH_FOLDER_NAME`, and its label reads how many folders are left, so
 * removing a name here drops that drive to the cap, which offers no
 * control at all. Without a witness this set could be walked back to a
 * single folder and a case named "exactly the cap" would stay green,
 * taking the off-by-one it exists to catch with it.
 *
 * The refresh-outliving case draws this set too, but is not a second
 * witness: it reads the set into the fixture and back out of a `toEqual`
 * against what it just rendered, which is an equality with itself
 * (`review-workflow.md` detector rule 5).
 */
const AT_CAP_FOLDER_NAMES = [
  "alfa",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
] as const;

/**
 * The ninth folder. Nine is the smallest population the cap hides
 * anything from, which is what makes this the boundary case; it is not a
 * claim about any real drive's folder count, and no such number belongs
 * in a comment (`review-workflow.md`, "state the mechanism, not the
 * measurement").
 */
const NINTH_FOLDER_NAME = "victor";

/** A second drive, with its own names so a stale grid is visible. */
const SECOND_DRIVE_FOLDER_NAMES = [
  "lima",
  "mike",
  "november",
  "oscar",
  "papa",
  "quebec",
  "romeo",
  "sierra",
  "tango",
  "uniform",
] as const;

/** What the second drive's collapsed grid draws. Declared, not sliced. */
const SECOND_DRIVE_COLLAPSED_NAMES = [
  "lima",
  "mike",
  "november",
  "oscar",
  "papa",
  "quebec",
  "romeo",
  "sierra",
] as const;

/** What the second drive's control has left to reveal. */
const SECOND_DRIVE_HIDDEN_NAMES = ["tango", "uniform"] as const;

/**
 * What this drive holds when it is opened again, after a folder has been
 * renamed or removed elsewhere.
 *
 * Declared, and disjoint from every name above, so a list belonging to
 * an earlier visit or to the other drive is visible the moment it lands.
 * Short of the cap on purpose: the absence of a control is then a second
 * reading of which list the grid is counting, since both of the sets
 * that could displace it are past the cap.
 *
 * Its length carries nothing, and no case here fails if it loses a name
 * — stated rather than dressed up, since the sets above do have
 * witnesses. What the two cases that read it detect with is the
 * enumeration of `ALL_FOLDER_NAMES` being absent from the document, and
 * that set is witnessed by `COLLAPSED` and `HIDDEN`. Membership is what
 * this one has to hold: a name moving out of here and into either of the
 * other drives' sets would break the disjointness both cases rest on.
 */
const REVISIT_FOLDER_NAMES = ["whiskey", "xray", "yankee"] as const;

function folder(name: string): FolderType {
  return { name, path: name, file_count: 1, kind_counts: { video: 1 }, dominant_kind: "video" };
}

/**
 * The Folders section's own element, found from its heading.
 *
 * Reads of this section are scoped through here rather than taken
 * across the document: the carousels, the continue-watching row and the
 * file listing are all stubbed out in this file and all draw cards and
 * skeletons in production, so a document-wide read holds while this
 * section draws nothing at all. The one read not taken through this
 * helper is the grid the control names, looked up by `aria-controls` —
 * that lookup is the assertion, not a way around this one.
 */
function folderSection(): HTMLElement {
  const section = screen.getByRole("heading", { name: "Folders" }).closest("section");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

/**
 * The folder names the grid is drawing, in grid order.
 *
 * Found through the card link's own rename-focus attribute, and read off
 * the card's name element rather than off the attribute: the attribute
 * carries the path, which is what the card is keyed by, not what it
 * shows. `FolderCard` renders the name in the link's only `<span>`.
 *
 * Scoped to the Folders section, which is what makes an empty result
 * mean "the grid drew nothing" rather than "no card is anywhere on the
 * page": the same attribute is on every folder card the file listing
 * draws in production.
 */
function folderNamesOnScreen(): string[] {
  return Array.from(folderSection().querySelectorAll<HTMLElement>("[data-rename-focus]")).map(
    (el) => el.querySelector("span")?.textContent ?? "",
  );
}

/**
 * How many placeholder cards the skeleton draws, declared rather than
 * read off the render. The loading cases assert it so that removing the
 * skeleton — or the section around it — fails something: a case built
 * only out of absences passes when everything is absent.
 */
const SKELETON_CARD_COUNT = 4;

/**
 * The section is on screen and drawing its own skeleton.
 *
 * Membership only. jsdom lays nothing out, so this says the heading and
 * the placeholders are in the document, not that either is visible.
 */
function expectFolderSkeleton(): void {
  expect(folderSection().querySelectorAll(".animate-pulse")).toHaveLength(SKELETON_CARD_COUNT);
}

/**
 * A `getFolders` response the test is holding open, and the assertion
 * that it is still held.
 *
 * The precondition each outliving case rests on is that the response it
 * started has not been applied yet, and that is not readable off the
 * document: a refresh that settled with the list already on screen draws
 * exactly what a held one draws, and a fetch that settled with no
 * folders draws no cards exactly as a held one does. So the response the
 * component was handed is checked against the one this test is holding,
 * and that promise is checked for having gone nowhere. Swapping the held
 * promise for a resolved one in the fixture is the edit that would
 * otherwise turn either case into one the guard is not needed for.
 */
function heldFolderResponse(): {
  promise: Promise<FolderType[]>;
  resolve: (names: readonly string[]) => void;
} {
  let resolve: (names: readonly string[]) => void = () => {};
  const promise = new Promise<FolderType[]>((res) => {
    resolve = (names) => res(names.map(folder));
  });
  return { promise, resolve };
}

async function expectFolderResponseStillHeld(promise: Promise<FolderType[]>): Promise<void> {
  expect(getFolders.mock.results.at(-1)?.value).toBe(promise);

  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(settled).toBe(false);
}

async function renderDriveHome(names: readonly string[]) {
  getFolders.mockResolvedValue(names.map(folder));
  render(<DriveHome driveName="drive-under-test" />);
  await waitFor(() => expect(folderNamesOnScreen().length).toBeTruthy());
}

describe("DriveHome folder grid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("draws the cap and offers the rest, counted from the folders it has", async () => {
    await renderDriveHome(ALL_FOLDER_NAMES);

    expect(folderNamesOnScreen()).toEqual([...COLLAPSED_FOLDER_NAMES]);
    for (const name of HIDDEN_FOLDER_NAMES) {
      expect(screen.queryByText(name)).toBeNull();
    }

    // The label carries how many are hidden, so a grid one folder past
    // the cap and one twenty past it do not read the same.
    const control = screen.getByRole("button", {
      name: `Show more (${HIDDEN_FOLDER_NAMES.length})`,
    });
    expect(control).toHaveAttribute("aria-expanded", "false");

    // The control names the grid it expands, so a screen reader is told
    // what the state it just announced applies to.
    const controlled = document.getElementById(control.getAttribute("aria-controls") ?? "");
    expect(controlled?.querySelectorAll("[data-rename-focus]")).toHaveLength(
      COLLAPSED_FOLDER_NAMES.length,
    );
  });

  it("makes every folder reachable in place, and folds back", async () => {
    await renderDriveHome(ALL_FOLDER_NAMES);

    fireEvent.click(screen.getByRole("button", { name: /Show more/ }));

    // The reachability claim: every declared name, present, without a
    // navigation. The order is the grid's, so this also pins that the
    // revealed folders are appended rather than replacing the cap.
    expect(folderNamesOnScreen()).toEqual([...ALL_FOLDER_NAMES]);
    for (const name of HIDDEN_FOLDER_NAMES) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }

    const collapse = screen.getByRole("button", { name: "Show less" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(collapse);
    expect(folderNamesOnScreen()).toEqual([...COLLAPSED_FOLDER_NAMES]);
  });

  it("folds back when the page changes drive", async () => {
    getFolders.mockResolvedValue(ALL_FOLDER_NAMES.map(folder));
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);
    await waitFor(() => expect(folderNamesOnScreen().length).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Show more/ }));
    expect(folderNamesOnScreen()).toEqual([...ALL_FOLDER_NAMES]);

    // The component is reused across `/drive/[name]`, so the expansion
    // of one drive's grid must not decide how the next one opens.
    getFolders.mockResolvedValue(SECOND_DRIVE_FOLDER_NAMES.map(folder));
    rerender(<DriveHome driveName="second-drive" />);

    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );
    expect(
      screen.getByRole("button", { name: `Show more (${SECOND_DRIVE_HIDDEN_NAMES.length})` }),
    ).toHaveAttribute("aria-expanded", "false");
    for (const name of SECOND_DRIVE_HIDDEN_NAMES) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("offers nothing when the drive has exactly the cap", async () => {
    await renderDriveHome(AT_CAP_FOLDER_NAMES);

    expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show less" })).toBeNull();
  });

  it("offers the ninth folder when the drive has one past the cap", async () => {
    // The boundary from the other side. The literal 1 in the label is
    // declared, not read off the render: it is what makes a folder
    // leaving `AT_CAP` visible.
    await renderDriveHome([...AT_CAP_FOLDER_NAMES, NINTH_FOLDER_NAME]);

    expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]);
    expect(screen.queryByText(NINTH_FOLDER_NAME)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show more (1)" }));

    expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES, NINTH_FOLDER_NAME]);
  });

  it("offers nothing over the next drive's skeleton", async () => {
    getFolders.mockResolvedValue(ALL_FOLDER_NAMES.map(folder));
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...COLLAPSED_FOLDER_NAMES]));

    // The second drive's folders never arrive, so what is asserted below
    // is the whole loading window rather than one frame of it. The
    // control counts the folders the grid is drawing, and the grid is
    // drawing none, so a count belonging to the drive that was left
    // cannot be on screen — nor a reference to a grid element that the
    // skeleton is standing in for.
    getFolders.mockReturnValue(new Promise<FolderType[]>(() => {}));
    rerender(<DriveHome driveName="second-drive" />);

    await waitFor(() => expect(folderNamesOnScreen()).toEqual([]));
    expectFolderSkeleton();
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show less" })).toBeNull();
  });

  it("keeps the drive that was left off the page when its folders land last", async () => {
    // Not the loading window: the resting state past it. Both drives'
    // fetches are in flight across the change and the first drive's
    // settles *after* the second's, so clearing the grid while
    // `foldersLoading` is true does not reach this — by the time the old
    // response arrives the flag is already false and its list would be
    // drawn, cards and label agreeing, with nothing on screen to say the
    // drive it belongs to has been left.
    const firstDrive = heldFolderResponse();
    getFolders.mockReturnValueOnce(firstDrive.promise);
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);

    // The first drive's fetch is still in flight when the page moves on.
    // Without this the case passes vacuously the moment that fetch
    // settles first — which is the ordering the case above already
    // covers, and the one the round-2 repair handles. An empty grid does
    // not say it: a fetch that settled with no folders leaves exactly
    // that, so the response is what is asserted.
    await expectFolderResponseStillHeld(firstDrive.promise);
    expect(folderNamesOnScreen()).toEqual([]);

    getFolders.mockResolvedValue(SECOND_DRIVE_FOLDER_NAMES.map(folder));
    rerender(<DriveHome driveName="second-drive" />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );

    await act(async () => {
      firstDrive.resolve(ALL_FOLDER_NAMES);
    });

    // The page is unmoved: the drive on screen still draws its own cards
    // and its own count, and not one name from the drive that was left
    // is in the document — including the eight the cap would have drawn,
    // which is the shape that would otherwise look correct.
    expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]);
    expect(
      screen.getByRole("button", { name: `Show more (${SECOND_DRIVE_HIDDEN_NAMES.length})` }),
    ).toBeInTheDocument();
    for (const name of ALL_FOLDER_NAMES) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("drops a refresh that was started on the drive that was left", async () => {
    // The second entrance into the same resting state. `refreshFolders`
    // is not tied to the fetch effect's lifetime — a drag-and-drop's
    // `loft-move-complete` or a WS `drive.structure_changed` starts it —
    // so its request outlives the drive change on its own, and guarding
    // only the effect would leave this one open.
    getFolders.mockResolvedValue(AT_CAP_FOLDER_NAMES.map(folder));
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    const refresh = heldFolderResponse();
    getFolders.mockReturnValueOnce(refresh.promise);
    await act(async () => {
      window.dispatchEvent(new Event("loft-move-complete"));
    });

    // The refresh is still in flight when the page moves on. Nothing on
    // screen can say so — a refresh that settled with the list already
    // drawn draws what a held one draws, whatever payload the fixture
    // picks — so the precondition is read off the response instead.
    await expectFolderResponseStillHeld(refresh.promise);
    expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();

    getFolders.mockResolvedValue(SECOND_DRIVE_FOLDER_NAMES.map(folder));
    rerender(<DriveHome driveName="second-drive" />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );

    await act(async () => {
      refresh.resolve(ALL_FOLDER_NAMES);
    });

    expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]);
    expect(
      screen.getByRole("button", { name: `Show more (${SECOND_DRIVE_HIDDEN_NAMES.length})` }),
    ).toBeInTheDocument();
    for (const name of ALL_FOLDER_NAMES) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("keeps a list from an earlier visit to this drive off the grid", async () => {
    // The drive name is the same on both ends of the trip, so nothing
    // that compares names can separate these two requests. This
    // component is not remounted between them: `/drive/[name]` renders
    // it with no `key`, so one instance carries the first visit's fetch
    // through the whole A -> B -> A trip.
    const firstVisit = heldFolderResponse();
    getFolders.mockReturnValueOnce(firstVisit.promise);
    const { rerender } = render(<DriveHome driveName="drive-under-test" />);

    await expectFolderResponseStillHeld(firstVisit.promise);
    expect(folderNamesOnScreen()).toEqual([]);

    getFolders.mockResolvedValue(SECOND_DRIVE_FOLDER_NAMES.map(folder));
    rerender(<DriveHome driveName="second-drive" />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );

    // Back to the drive we started on, which has since lost folders.
    getFolders.mockResolvedValue(REVISIT_FOLDER_NAMES.map(folder));
    rerender(<DriveHome driveName="drive-under-test" />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...REVISIT_FOLDER_NAMES]));

    await act(async () => {
      firstVisit.resolve(ALL_FOLDER_NAMES);
    });

    // The grid still draws this visit's list, and offers nothing: both
    // sets that could have displaced it run past the cap, so a control
    // appearing would say one of them had landed.
    expect(folderNamesOnScreen()).toEqual([...REVISIT_FOLDER_NAMES]);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    for (const name of ALL_FOLDER_NAMES) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("draws a refresh started on the drive it is showing", async () => {
    // The positive half of the two cases above. A guard that is only
    // ever read for what it discards cannot tell "correctly dropped"
    // from "never applied at all": inverting it would leave the folder
    // grid frozen after every create, rename and move, and nothing else
    // in the suite asks whether a refresh reaches the screen.
    await renderDriveHome(AT_CAP_FOLDER_NAMES);
    expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]);

    getFolders.mockResolvedValue(REVISIT_FOLDER_NAMES.map(folder));
    await act(async () => {
      window.dispatchEvent(new Event("loft-move-complete"));
    });

    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...REVISIT_FOLDER_NAMES]));
  });

  it("offers nothing over the skeleton when a refresh lands under it", async () => {
    // The other way into the same window: the first fetch has not
    // settled, and an out-of-band refresh (a drag-and-drop or a WS
    // event) puts folders into state while the grid is still a
    // skeleton. Nothing is drawn, so nothing is offered.
    getFolders.mockReturnValueOnce(new Promise<FolderType[]>(() => {}));
    getFolders.mockResolvedValue(ALL_FOLDER_NAMES.map(folder));
    render(<DriveHome driveName="drive-under-test" />);

    await act(async () => {
      window.dispatchEvent(new Event("loft-move-complete"));
    });

    // The precondition, witnessed. Without this the case holds for a
    // bare skeleton that no refresh ever reached, which is what the
    // drive-change case beside it already covers — and it would degrade
    // into a copy of that one the moment the `loft-move-complete`
    // listener regressed, silently, since nothing else covers it.
    expect(getFolders).toHaveBeenCalledTimes(2);
    expect(getFolders).toHaveBeenLastCalledWith("drive-under-test");

    expect(folderNamesOnScreen()).toEqual([]);
    expectFolderSkeleton();
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show less" })).toBeNull();
  });

  it("does not link the grid at the flat every-file view", async () => {
    await renderDriveHome(ALL_FOLDER_NAMES);

    // `?view=all` lists every file and no folders, so a folder past the
    // cap is not reachable through it. The sidebar's own "All Files"
    // link is a different surface and keeps that destination.
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.filter((href) => href?.includes("view=all"))).toEqual([]);
  });
});
