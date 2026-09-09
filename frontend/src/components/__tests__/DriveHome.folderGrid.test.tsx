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
 * **Populations are declared, and every one of them has a witness.**
 * Deriving `HIDDEN` as `ALL.slice(CAP)` would make a deletion invisible:
 * the name would leave the fixture and the expectation at the same
 * moment (`review-workflow.md` detector rule 5). Writing a set out is
 * not on its own enough, though — a set whose only consumer is an
 * equality with itself shrinks silently too. Each set below is read by a
 * case that fails when an element leaves it: `ALL`, `COLLAPSED` and
 * `HIDDEN` check each other, and `AT_CAP` is checked by the case one
 * folder past it, where the label counts.
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
 * `NINTH_FOLDER_NAME`, and its label reads how many folders are left.
 * Remove a name here and that drive falls to the cap, which offers no
 * control at all, so the removal is visible. Without the witness this
 * set could be walked back to a single folder and a case named "exactly
 * the cap" would stay green, taking the off-by-one it exists to catch
 * with it.
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
 * The ninth folder. Nine top-level folders is the drive this cap was
 * measured on, and the smallest drive the cap hides anything from.
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

function folder(name: string): FolderType {
  return { name, path: name, file_count: 1, kind_counts: { video: 1 }, dominant_kind: "video" };
}

/**
 * The folder names the grid is drawing, in grid order.
 *
 * Found through the card link's own rename-focus attribute, and read off
 * the card's name element rather than off the attribute: the attribute
 * carries the path, which is what the card is keyed by, not what it
 * shows. `FolderCard` renders the name in the link's only `<span>`.
 */
function folderNamesOnScreen(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-rename-focus]")).map(
    (el) => el.querySelector("span")?.textContent ?? "",
  );
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
    // The boundary from the other side, and the drive the cap was
    // measured on. The literal 1 in the label is declared, not read off
    // the render: it is what makes a folder leaving `AT_CAP` visible.
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
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show less" })).toBeNull();
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

    expect(folderNamesOnScreen()).toEqual([]);
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
