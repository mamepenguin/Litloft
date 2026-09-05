import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { FolderToolbar } from "../FolderToolbar";

vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

/**
 * How many controls on the folder toolbar say nothing.
 *
 * 案 2's target is one — the overflow `…`. There were seven: upload's
 * chevron aside, the two filter chips, reshuffle, sort, the two halves of
 * the view toggle and `…`, and a reader could not tell what any of them
 * did without pressing one.
 *
 * The count is asserted with the *names*, not a number, so a control that
 * loses its word fails here with its own identity in the diff. `SortButton`
 * and `ViewToggle` are the real ones: mocking them is what let the earlier
 * count in this phase's prose be six when it was seven.
 */
const props = {
  isSpecialView: false,
  isFolderAnchored: true,
  tagFilter: null,
  hasPlayableFiles: true,
  sort: "random" as const,
  order: "desc" as const,
  typeFilter: null,
  trustFilter: null,
  total: 42,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: ["f1"],
  drive: "d",
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

/** Buttons whose whole content is an icon: no text a sighted reader gets. */
function wordless(root: HTMLElement): string[] {
  return [...root.querySelectorAll("button")]
    .filter((b) => (b.textContent ?? "").trim() === "")
    .map((b) => b.getAttribute("aria-label") ?? "(no accessible name)");
}

describe("the folder toolbar's wordless controls", () => {
  afterEach(cleanup);

  it("still has more than the overflow, and these are which", () => {
    // 案 2 wants this list to be ["More actions"] alone. Merging the two
    // filter chips into one labelled control took two off it; `表示 ▾` and
    // `並び順 ▾` (Phase 3 B2b-2b) take the rest. Listed rather than counted
    // so the next step edits this line and sees what it is removing.
    const { container } = render(<FolderToolbar {...props} />);
    // Rendered twice, once per breakpoint, so the names are deduplicated.
    expect([...new Set(wordless(container))].sort()).toEqual([
      "Grid view",
      "List view",
      "More actions",
      "Reshuffle",
      "Sort",
    ]);
  });

  it("has none of them where the folder is empty but the overflow", () => {
    const { container } = render(
      <FolderToolbar {...props} total={0} folderCount={0} sort="created_at" />,
    );
    expect([...new Set(wordless(container))]).toEqual(["More actions"]);
  });

  it("names the filter with a word at every state", () => {
    // The one this PR closed: two chips that were bare icons until
    // something was selected.
    const { container } = render(<FolderToolbar {...props} />);
    expect(wordless(container)).not.toContain("File type");
    expect(wordless(container)).not.toContain("Verification");
    expect(
      screen.getAllByRole("button", { name: "Filter" }).length,
    ).toBeGreaterThan(0);
  });
});
