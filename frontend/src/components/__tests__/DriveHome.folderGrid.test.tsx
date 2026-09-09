import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
 * **Populations are declared, never sliced from each other.** Deriving
 * `HIDDEN` as `ALL.slice(CAP)` would make a deletion invisible: the name
 * would leave the fixture and the expectation at the same moment
 * (`review-workflow.md` detector rule 5). Every set below is written out.
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
 * Exactly the cap, so the control has nothing to reveal. Written out
 * rather than sliced for the same reason as the sets above.
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

  it("does not link the grid at the flat every-file view", async () => {
    await renderDriveHome(ALL_FOLDER_NAMES);

    // `?view=all` lists every file and no folders, so a folder past the
    // cap is not reachable through it. The sidebar's own "All files"
    // link is a different surface and keeps that destination.
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.filter((href) => href?.includes("view=all"))).toEqual([]);
  });
});
