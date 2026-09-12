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
const createFolder = vi.fn<(drive: string, path: string, name: string) => Promise<void>>();

vi.mock("@/lib/api", () => ({
  getFolders: (drive: string) => getFolders(drive),
  createFolder: (drive: string, path: string, name: string) => createFolder(drive, path, name),
  getDriveFiles: vi.fn(() => Promise.resolve({ data: [], meta: { total: 0 } })),
  getPins: vi.fn(() => Promise.resolve([])),
  getWatchHistory: vi.fn(() => Promise.resolve([])),
  addPin: vi.fn(() => Promise.resolve()),
  removePin: vi.fn(() => Promise.resolve()),
}));

// The sections around the grid are not what this file is about, and each
// drags in its own fetches and providers.
vi.mock("../AddonSlot", () => ({ AddonSlot: () => <div /> }));
vi.mock("../CarouselSection", () => ({ CarouselSection: () => <div /> }));
vi.mock("../ContinueWatchingSection", () => ({ ContinueWatchingSection: () => <div /> }));
// The header is stood in for by something that draws its actions and
// nothing else: the Add menu is how the create-folder field is opened,
// and a header stubbed to `<div />` puts that entrance out of reach.
vi.mock("../PageHeader", () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));
vi.mock("../AddButton", () => ({
  AddButton: ({ onCreateFolder }: { onCreateFolder?: () => void }) => (
    <button type="button" onClick={onCreateFolder}>
      new folder
    </button>
  ),
}));
vi.mock("../TreeToggle", () => ({ TreeToggle: () => <div /> }));
vi.mock("../FolderContextMenu", () => ({ FolderContextMenu: () => null }));

vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));
// Mutable, because the fetch effect depends on `hasProfile` / `nickname`
// and `ProfileProvider` reports `null` on its first pass and the cookie
// on its second — so a profiled user's hard load re-runs that effect on
// one drive, with no navigation. One case below is about exactly that.
const profile: { nickname: string | null } = { nickname: null };
vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: profile.nickname }),
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

const DRIVE_UNDER_TEST = "drive-under-test";
const SECOND_DRIVE = "second-drive";

/**
 * `getFolders` answers according to the drive it is asked for.
 *
 * Before this it answered by call order — `mockResolvedValue` /
 * `mockReturnValueOnce` — so "drive A's folders" and "drive B's folders"
 * were the same object universe, distinguished only by when the fixture
 * was armed. A population that cannot tell a request for A from a
 * request for B cannot witness a guard whose whole job is telling them
 * apart, and a round that deleted this file's only drive comparison
 * moved not one test. (`review-workflow.md` detector rule 5, in the
 * guard's own fixture rather than in what the guard guards.)
 *
 * A drive with no entry answers with `FOREIGN_FOLDER_NAME`, which is in
 * none of the declared sets — so a request made for the wrong drive is
 * *readable on screen* rather than indistinguishable from an empty grid.
 * A rejection would not do: the grid keeps what it had on a same-drive
 * failure, so a foreign request would look exactly like no request.
 *
 * **This covers `getFolders` and nothing else in this file.**
 * `getDriveFiles` and `getPins` are still argument-less stubs here,
 * because the rows and the pin menu are stubbed out of this file
 * entirely and a drive mix-up in either draws nothing to read. Their
 * drive is held next door in `DriveHome.driveChange.test.tsx`, which
 * renders both. An earlier version of this comment reported a
 * measurement across both suites as though it had been taken in this
 * one, and got the figure wrong as well; measurements belong in the PR
 * body, where they are dated.
 */
const FOREIGN_FOLDER_NAME = "fetched-for-the-wrong-drive";

const foldersByDrive = new Map<string, readonly string[]>();
const heldFolderFetches = new Map<string, () => Promise<FolderType[]>>();

function installFolderResponder(): void {
  getFolders.mockImplementation((drive) => {
    const held = heldFolderFetches.get(drive);
    if (held) {
      heldFolderFetches.delete(drive);
      return held();
    }
    return Promise.resolve((foldersByDrive.get(drive) ?? [FOREIGN_FOLDER_NAME]).map(folder));
  });
}

/** What a drive answers with from now on. */
function driveHasFolders(drive: string, names: readonly string[]): void {
  foldersByDrive.set(drive, names);
}

/**
 * The Folders section's own element, found from its heading.
 *
 * `folderNamesOnScreen()` reads through here rather than across the
 * document because `data-rename-focus` has three producers —
 * `FolderCard`, `FolderListRow` and `FolderTreeRow` (`useInlineRename`
 * declares the attribute) — and a document-wide read would hold on any
 * of them while this section drew nothing at all.
 *
 * **That scoping has no witness here, and cannot have one.** Only the
 * card is reachable from this render, so document-wide and
 * section-scoped are the same set and always will be: reverting
 * `folderNamesOnScreen()` to `document.querySelectorAll` leaves every
 * case in this file green (measured). It is hardening against a second
 * producer arriving on this screen, not a property this suite can hold —
 * `review-workflow.md`, "the honest response is to narrow what the test
 * claims".
 *
 * So this is not a rule the file follows. Most reads here are
 * deliberately document-wide: `screen.queryByText(name)` for a name that
 * must be absent, which is the stronger read taken across the whole page,
 * and `screen.getByRole` for the Show more / Show less control, which
 * nothing else in this file draws. Two earlier versions of this comment
 * each claimed a completeness about that split — "every count is scoped
 * through here", then "the one read not taken through this helper" — and
 * both were false when written. This one claims none: which reads are
 * scoped is decided case by case, and the rule is the mechanism above,
 * not a tally.
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
 * Scoped to the Folders section for the reason `folderSection()` above
 * gives: the attribute has three producers, so an unscoped read would
 * answer "the grid drew nothing" with a card drawn by one of the other
 * two.
 */
function folderNamesOnScreen(): string[] {
  return Array.from(folderSection().querySelectorAll<HTMLElement>("[data-rename-focus]")).map(
    (el) => el.querySelector("span")?.textContent ?? "",
  );
}

/**
 * The Folders section is not on the page at all.
 *
 * Its render gate is `(foldersLoading || folders.length > 0)`, so this is
 * what an empty list at rest looks like — a drive with no folders, and a
 * drive whose `getFolders` failed with nothing already drawn for it.
 * Asserted through the heading rather than through `folderSection()`,
 * which throws when there is nothing to scope to.
 */
function expectNoFolderSection(): void {
  expect(screen.queryByRole("heading", { name: "Folders" })).toBeNull();
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
function holdFolderFetch(drive: string): {
  promise: Promise<FolderType[]>;
  resolve: (names: readonly string[]) => void;
  reject: () => void;
} {
  let resolve: (names: readonly string[]) => void = () => {};
  let reject: () => void = () => {};
  const promise = new Promise<FolderType[]>((res, rej) => {
    resolve = (names) => res(names.map(folder));
    reject = () => rej(new Error("getFolders failed"));
  });
  // One shot, for the drive asked for. The next request for that drive
  // falls through to its declared list, which is what a return visit and
  // a retry both need.
  heldFolderFetches.set(drive, () => promise);
  return { promise, resolve, reject };
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

async function expectFolderResponseStillHeld(promise: Promise<FolderType[]>): Promise<void> {
  expect(getFolders.mock.results.at(-1)?.value).toBe(promise);
  await expectStillHeld([promise]);
}

async function renderDriveHome(names: readonly string[]) {
  driveHasFolders(DRIVE_UNDER_TEST, names);
  render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
  await waitFor(() => expect(folderNamesOnScreen().length).toBeTruthy());
}

describe("DriveHome folder grid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    foldersByDrive.clear();
    heldFolderFetches.clear();
    profile.nickname = null;
    installFolderResponder();
    createFolder.mockResolvedValue(undefined);
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
    driveHasFolders(DRIVE_UNDER_TEST, ALL_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen().length).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Show more/ }));
    expect(folderNamesOnScreen()).toEqual([...ALL_FOLDER_NAMES]);

    // The component is reused across `/drive/[name]`, so the expansion
    // of one drive's grid must not decide how the next one opens.
    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);

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
    driveHasFolders(DRIVE_UNDER_TEST, ALL_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...COLLAPSED_FOLDER_NAMES]));

    // The second drive's folders never arrive, so what is asserted below
    // is the whole loading window rather than one frame of it. The
    // control counts the folders the grid is drawing, and the grid is
    // drawing none, so a count belonging to the drive that was left
    // cannot be on screen — nor a reference to a grid element that the
    // skeleton is standing in for.
    heldFolderFetches.set(SECOND_DRIVE, () => new Promise<FolderType[]>(() => {}));
    rerender(<DriveHome driveName={SECOND_DRIVE} />);

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
    const firstDrive = holdFolderFetch(DRIVE_UNDER_TEST);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);

    // The first drive's fetch is still in flight when the page moves on.
    // Without this the case passes vacuously the moment that fetch
    // settles first — which is the ordering the case above already
    // covers, and the one the round-2 repair handles. An empty grid does
    // not say it: a fetch that settled with no folders leaves exactly
    // that, so the response is what is asserted.
    await expectFolderResponseStillHeld(firstDrive.promise);
    expect(folderNamesOnScreen()).toEqual([]);

    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
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
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    const refresh = holdFolderFetch(DRIVE_UNDER_TEST);
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

    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
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
    const firstVisit = holdFolderFetch(DRIVE_UNDER_TEST);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);

    await expectFolderResponseStillHeld(firstVisit.promise);
    expect(folderNamesOnScreen()).toEqual([]);

    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );

    // Back to the drive we started on, which has since lost folders.
    driveHasFolders(DRIVE_UNDER_TEST, REVISIT_FOLDER_NAMES);
    rerender(<DriveHome driveName={DRIVE_UNDER_TEST} />);
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

    driveHasFolders(DRIVE_UNDER_TEST, REVISIT_FOLDER_NAMES);
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
    heldFolderFetches.set(DRIVE_UNDER_TEST, () => new Promise<FolderType[]>(() => {}));
    driveHasFolders(DRIVE_UNDER_TEST, ALL_FOLDER_NAMES);
    render(<DriveHome driveName={DRIVE_UNDER_TEST} />);

    await act(async () => {
      window.dispatchEvent(new Event("loft-move-complete"));
    });

    // The precondition, witnessed. Without this the case holds for a
    // bare skeleton that no refresh ever reached, which is what the
    // drive-change case beside it already covers — and it would degrade
    // into a copy of that one the moment the `loft-move-complete`
    // listener regressed, silently, since nothing else covers it.
    expect(getFolders).toHaveBeenCalledTimes(2);
    expect(getFolders).toHaveBeenLastCalledWith(DRIVE_UNDER_TEST);

    expect(folderNamesOnScreen()).toEqual([]);
    expectFolderSkeleton();
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show less" })).toBeNull();
  });

  it("keeps a refresh a captured callback made for the drive that was left off the grid", async () => {
    // The entrance a per-request identity cannot see on its own.
    // `handleCreateFolder` awaits `createFolder` and then calls a
    // `refreshFolders` still closed over the drive it was armed on, so
    // what lands is a **brand-new** `getFolders` for the drive that was
    // left — the newest request on the stream, and therefore the one any
    // "is this the latest" test would admit. Only the drive it was made
    // for separates it from a legitimate refresh.
    //
    // The other entrances have this shape and none of them is in this
    // file: the rename commit, the drag `onComplete`,
    // `FolderContextMenu.onUpdate`, and `onFileAction` on the carousels.
    // They are covered by the same guard rather than by a case each,
    // because the guard is in `applyFolders` and none of them can reach
    // the grid past it.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    let finishCreate: () => void = () => {};
    createFolder.mockReturnValue(
      new Promise<void>((resolve) => {
        finishCreate = resolve;
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "november" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(createFolder).toHaveBeenCalledWith(DRIVE_UNDER_TEST, "", "november");

    // The create is still in flight when the page moves on, so what runs
    // below is its continuation on the old closure and not a second copy
    // of the drive-change case. Read off the response, because nothing on
    // screen says it: a create that had already settled leaves the same
    // grid.
    await expectStillHeld([createFolder.mock.results.at(-1)?.value as Promise<void>]);

    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );

    // The drive that was left has since gained folders past the cap, so
    // if its list landed the grid would say so twice — with its names and
    // with a control counting them.
    driveHasFolders(DRIVE_UNDER_TEST, ALL_FOLDER_NAMES);
    await act(async () => {
      finishCreate();
    });

    // The new request really was made for the drive that was left: the
    // precondition, witnessed. Without it this case would pass on a
    // continuation that never ran at all.
    expect(getFolders).toHaveBeenLastCalledWith(DRIVE_UNDER_TEST);

    expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]);
    expect(
      screen.getByRole("button", { name: `Show more (${SECOND_DRIVE_HIDDEN_NAMES.length})` }),
    ).toBeInTheDocument();
    for (const name of ALL_FOLDER_NAMES) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("keeps the section when a same-drive refresh fails under the page load", async () => {
    // No drive change here at all. Both requests are for the drive in
    // front of you: the page load's own fetch, and an out-of-band refresh
    // that a backend scan's `drive.structure_changed` — or any
    // drag-and-drop — starts under it. The refresh fails.
    //
    // A guard that drops everything but the newest request in flight
    // throws the good response away before the refresh is known to have
    // failed, and then the failure writes nothing. That leaves
    // `foldersLoading === false` with an empty list, which the section's
    // own render gate reads as "this drive has no folders" — so the
    // Folders section leaves a page whose drive has folders, and nothing
    // re-requests them.
    const pageLoad = holdFolderFetch(DRIVE_UNDER_TEST);
    render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await expectFolderResponseStillHeld(pageLoad.promise);

    const refresh = holdFolderFetch(DRIVE_UNDER_TEST);
    await act(async () => {
      window.dispatchEvent(new Event("loft-move-complete"));
    });
    await expectFolderResponseStillHeld(refresh.promise);

    // The page load's own response lands first and is good; the refresh
    // that superseded it then fails. Both orders are reachable, and the
    // one that loses the good response is this one.
    await act(async () => {
      pageLoad.resolve(AT_CAP_FOLDER_NAMES);
    });
    await act(async () => {
      refresh.reject();
    });

    expect(folderSection()).toBeInTheDocument();
    expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]);
  });

  it("keeps the section when the failed refresh lands before the page load", async () => {
    // The other settling order, and it is a different mechanism rather
    // than a second copy: here the failure is applied *first*, so what
    // has to hold is that a response which wrote nothing did not claim
    // the stream on its way past. If it did, the page load's own good
    // response arrives second and is dropped as stale.
    const pageLoad = holdFolderFetch(DRIVE_UNDER_TEST);
    render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await expectFolderResponseStillHeld(pageLoad.promise);

    const refresh = holdFolderFetch(DRIVE_UNDER_TEST);
    await act(async () => {
      window.dispatchEvent(new Event("loft-move-complete"));
    });
    await expectFolderResponseStillHeld(refresh.promise);

    await act(async () => {
      refresh.reject();
    });
    await act(async () => {
      pageLoad.resolve(AT_CAP_FOLDER_NAMES);
    });

    expect(folderSection()).toBeInTheDocument();
    expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]);
  });

  it("keeps the drive that was left off the grid when this drive's fetch fails", async () => {
    // The half of the failure pair that was missing, and the one that
    // decides whether "a failure keeps what it found" is scoped.
    //
    // Across a drive change, "what it had" belongs to a *different*
    // drive. `applyFolders` returns on a failed response before it
    // writes, so nothing in that function can tell the two apart — the
    // scoping has to be in the state, and it is: the reset effect
    // empties `folders` when the drive changes. (Not the fetch effect,
    // which also runs when the nickname settles; the case below about a
    // re-run on one drive is why that distinction is load-bearing.)
    // Without the reset, this drive draws the previous drive's cards at
    // rest, with a control counting a folder that is not there.
    driveHasFolders(DRIVE_UNDER_TEST, [...AT_CAP_FOLDER_NAMES, NINTH_FOLDER_NAME]);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));
    expect(screen.getByRole("button", { name: "Show more (1)" })).toBeInTheDocument();

    const failing = holdFolderFetch(SECOND_DRIVE);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await act(async () => {
      failing.reject();
    });

    // The section is gone, which is what an empty list at rest draws —
    // the same thing this drive would show if it genuinely had no
    // folders. Not one card and not the control: a "Show more (1)" here
    // would be the label and the cards agreeing with each other and both
    // describing the drive that was left.
    expectNoFolderSection();
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    for (const name of [...AT_CAP_FOLDER_NAMES, NINTH_FOLDER_NAME]) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("keeps the other drive off the grid when a return visit's fetch fails", async () => {
    // The same mechanism by the route where no name comparison can help:
    // the drive is the same at both ends, so what must not be drawn is
    // the *other* drive's list, left in state by the middle leg.
    driveHasFolders(DRIVE_UNDER_TEST, REVISIT_FOLDER_NAMES);
    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...REVISIT_FOLDER_NAMES]));

    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );

    const failing = holdFolderFetch(DRIVE_UNDER_TEST);
    rerender(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await act(async () => {
      failing.reject();
    });

    expectNoFolderSection();
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    for (const name of SECOND_DRIVE_FOLDER_NAMES) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("leaves the create field alone when a create started on the drive that was left returns", async () => {
    // `handleCreateFolder`'s tail, which the round that named this
    // function fixed one line of and left two. `cancelCreateFolder()`
    // closes the field and blanks the name; run on the old drive's
    // closure it takes the name the user is halfway through typing here.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    let finishCreate: () => void = () => {};
    createFolder.mockReturnValue(
      new Promise<void>((resolve) => {
        finishCreate = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "started-on-the-first-drive" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await expectStillHeld([createFolder.mock.results.at(-1)?.value as Promise<void>]);

    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );

    // A name half-typed on *this* drive, which the old drive's
    // continuation must not touch.
    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "typing-on-the-second-drive" } });

    await act(async () => {
      finishCreate();
    });

    expect(screen.getByRole("textbox")).toHaveValue("typing-on-the-second-drive");
  });

  it("does not report a create that failed on the drive that was left", async () => {
    // The other half of the same tail. `setFolderError` in the `catch`
    // has no drive and no request either, so a create that fails on the
    // drive you left raises its message on the drive you arrived at,
    // with nothing on screen saying where it came from.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    let failCreate: () => void = () => {};
    createFolder.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        failCreate = () => reject(new Error("createFolder failed"));
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "started-on-the-first-drive" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await expectStillHeld([createFolder.mock.results.at(-1)?.value as Promise<void>]);

    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );
    fireEvent.click(screen.getByRole("button", { name: "new folder" }));

    await act(async () => {
      failCreate();
    });

    // Read as "no alert anywhere", not "not this string": the failure is
    // a message arriving on the wrong screen, whatever it says.
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });

  it("keeps the section when the effect re-runs on this drive and the re-fetch fails", async () => {
    // The fetch effect runs for more reasons than a drive change: its
    // dependencies include `hasProfile` and `nickname`, and
    // `ProfileProvider` reports `null` on its first pass and the stored
    // nickname on its second. So a profiled user's hard load runs it
    // twice on one drive, with no navigation anywhere.
    //
    // Blanking the grid on *that* is how the Folders section disappears
    // from a drive that has folders — the failure round 5 was written to
    // close. The clear belongs to the drive, so it lives in the reset
    // effect and not here.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    // The nickname settles. Same drive, same URL, no rerender to another.
    const failing = holdFolderFetch(DRIVE_UNDER_TEST);
    profile.nickname = "someone";
    rerender(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await act(async () => {
      failing.reject();
    });

    // The precondition, witnessed rather than assumed: the effect really
    // did re-run, and both requests were for this drive. Without this
    // the case passes on an effect that never fired again.
    expect(getFolders).toHaveBeenCalledTimes(2);
    expect(getFolders).toHaveBeenNthCalledWith(1, DRIVE_UNDER_TEST);
    expect(getFolders).toHaveBeenNthCalledWith(2, DRIVE_UNDER_TEST);

    expect(folderSection()).toBeInTheDocument();
    expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]);
  });

  it("closes the create field when a create succeeds on the drive it was made on", async () => {
    // The positive half of "leaves the create field alone when a create
    // started on the drive that was left returns". A guard read only for
    // what it refuses cannot tell "correctly refused" from "never runs":
    // replacing it with `if (false)` leaves every successful create with
    // the field still open and the name still in it, which looks exactly
    // like a create that failed.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "november" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(createFolder).toHaveBeenCalledWith(DRIVE_UNDER_TEST, "", "november");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("reports a create that fails on the drive it was made on", async () => {
    // The positive half of "does not report a create that failed on the
    // drive that was left". Under `if (false)` every failed create
    // reports nothing at all, and the field sits there with no
    // explanation.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    createFolder.mockRejectedValue(new Error("createFolder failed"));
    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "november" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to create folder");
    // The field stays open for the name to be fixed.
    expect(screen.getByRole("textbox")).toHaveValue("november");
  });

  it("still reports a create that spans a re-run of the fetch effect on this drive", async () => {
    // The guard has to ask about the **drive**, and nothing else. Gating
    // these two writes on the page-load id instead suppresses them
    // across every re-run of the fetch effect — and that effect re-runs
    // when the nickname settles, on one drive, with no navigation. A
    // create in flight across that bump then reports nothing at all: it
    // looks exactly like a create that is still going.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    let failCreate: () => void = () => {};
    createFolder.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        failCreate = () => reject(new Error("createFolder failed"));
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "november" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await expectStillHeld([createFolder.mock.results.at(-1)?.value as Promise<void>]);

    // The nickname settles mid-create. Same drive throughout.
    profile.nickname = "someone";
    rerender(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await act(async () => {
      failCreate();
    });

    // The precondition: the effect really did re-run, so the create
    // really did span the bump this case is about.
    expect(getFolders).toHaveBeenCalledTimes(2);

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to create folder");
  });

  it("still closes the create field when a create spans a re-run on this drive", async () => {
    // The other half of the same bump: a create that succeeded looks
    // like one that failed, because the field it should have closed is
    // still open with the name in it.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    let finishCreate: () => void = () => {};
    createFolder.mockReturnValue(
      new Promise<void>((resolve) => {
        finishCreate = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "november" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await expectStillHeld([createFolder.mock.results.at(-1)?.value as Promise<void>]);

    profile.nickname = "someone";
    rerender(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await act(async () => {
      finishCreate();
    });

    // Three, enumerated rather than bounded: the page load's own fetch,
    // the one the nickname settling re-issued, and the refresh a
    // successful create runs on its way past. The failure case above
    // sees two, because a create that rejects never reaches that
    // refresh.
    expect(getFolders).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("drops the create field and its error when the page changes drive", async () => {
    // The synchronous half of the same statement. `setFolderError` is
    // reached without any await at all — an invalid name is rejected on
    // the spot — so no guard on a continuation touches it. What scopes
    // it is the reset, which is also what makes the guard's premise
    // true: only after this does the field on the next drive hold that
    // drive's name rather than the previous one's.
    driveHasFolders(DRIVE_UNDER_TEST, AT_CAP_FOLDER_NAMES);
    const { rerender } = render(<DriveHome driveName={DRIVE_UNDER_TEST} />);
    await waitFor(() => expect(folderNamesOnScreen()).toEqual([...AT_CAP_FOLDER_NAMES]));

    fireEvent.click(screen.getByRole("button", { name: "new folder" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "bad/name" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    // Raised synchronously, with no request made at all.
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid folder name");
    expect(createFolder).not.toHaveBeenCalled();

    driveHasFolders(SECOND_DRIVE, SECOND_DRIVE_FOLDER_NAMES);
    rerender(<DriveHome driveName={SECOND_DRIVE} />);
    await waitFor(() =>
      expect(folderNamesOnScreen()).toEqual([...SECOND_DRIVE_COLLAPSED_NAMES]),
    );

    // The field is gone and so is the message. Read as "no alert
    // anywhere": the failure is a message from another drive being on
    // screen, whatever it says.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryAllByRole("alert")).toEqual([]);
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
