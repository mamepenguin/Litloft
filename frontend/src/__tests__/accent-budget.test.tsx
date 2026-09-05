import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

import { FolderToolbar } from "@/components/folder/FolderToolbar";

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

/**
 * One accent fill per screen (DESIGN.md §2.2, 00-basis 原則 2).
 *
 * The folder toolbar carried three at once — upload, play-all and the
 * selected half of the view toggle — which is the state §2.2 describes as
 * "the screen has not decided what it is for". This holds the budget
 * mechanically, because a fourth is one `className` away and nothing else
 * in the tree would notice.
 *
 * **A fill, not the token.** `bg-accent/10` is a tint behind a hovered
 * row, `bg-accent-hover` and `enabled:hover:bg-accent-hover` only paint
 * under a pointer, and `bg-accent-teal` is a different colour. None of
 * them is the resting fill this budget is about, so the match is on a
 * whole class token carrying no variant prefix — `bg-accent` or its twin
 * `bg-accent-cta`, and nothing else.
 */
const ACCENT_FILLS = new Set(["bg-accent", "bg-accent-cta"]);

export function accentFills(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[class]")].filter((el) =>
    el.className
      .toString()
      .split(/\s+/)
      .some((token) => ACCENT_FILLS.has(token)),
  );
}

const folderProps = {
  isSpecialView: false,
  isFolderAnchored: true,
  tagFilter: null,
  hasPlayableFiles: false,
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 42,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: ["file-1"],
  drive: "test-drive",
  viewMode: "grid" as const,
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onTrustFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
  onScan: vi.fn(),
  onPlayAll: vi.fn(),
  onSetCreatingFolder: vi.fn(),
  onSetNewFolderName: vi.fn(),
  onSetFolderError: vi.fn(),
  onCreateFolder: vi.fn(),
  onCreateFile: vi.fn(),
  onReshuffle: vi.fn(),
};

/**
 * The screens under the budget, named here so the set cannot be narrowed
 * by choosing what to render. Phase 3 B2c adds the remaining six — Trash,
 * Missing, a collection, Ask, Find and Media Import — and the list is the
 * record of that.
 */
const SCREENS = ["folder toolbar"] as const;

describe("accent budget", () => {
  afterEach(cleanup);

  it("covers the screens it says it covers", () => {
    expect([...SCREENS]).toEqual(["folder toolbar"]);
  });

  describe("folder toolbar", () => {
    // The toolbar draws its left group twice, once for each breakpoint, and
    // only one is visible — jsdom applies no stylesheet, so both are in the
    // tree. Counting distinct labels rather than nodes is what makes "one
    // fill" mean one control instead of one element.
    const fillLabels = (root: HTMLElement) =>
      [...new Set(accentFills(root).map((el) => el.textContent?.trim() ?? ""))];

    it("spends its one fill on Add, in an ordinary folder", () => {
      const { container } = render(<FolderToolbar {...folderProps} />);
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one when the folder can be played", () => {
      // Play is a first-class action here and stays exposed (hako
      // `55N_yML35Q2jdVBsCxc06`), so this is the case where a second fill
      // used to appear.
      const { container } = render(
        <FolderToolbar {...folderProps} hasPlayableFiles />,
      );
      expect(screen.getAllByRole("button", { name: "Play" }).length).toBeGreaterThan(0);
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one while a folder is being named", () => {
      // The inline Create button was a second fill, on the bar at the same
      // time as Add. Named rather than counted: `<= 1` would pass just as
      // well if Create were the one that survived and Add had lost its fill.
      const { container } = render(
        <FolderToolbar {...folderProps} creatingFolder />,
      );
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("spends none in search mode, where nothing can be added", () => {
      const { container } = render(
        <FolderToolbar {...folderProps} isSearch isFolderAnchored={false} />,
      );
      expect(accentFills(container)).toHaveLength(0);
    });

    it("spends none in an empty special view", () => {
      const { container } = render(
        <FolderToolbar
          {...folderProps}
          isSpecialView
          isFolderAnchored={false}
          total={0}
          folderCount={0}
        />,
      );
      expect(accentFills(container)).toHaveLength(0);
    });
  });
});
