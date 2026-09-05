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

/**
 * Controls whose whole content is an icon: no text a sighted reader gets.
 *
 * Not `button` alone. An anchor styled as a control, a `[role=button]`, a
 * `<summary>` — all of them put a pressable thing on the bar, and a scan
 * that only knows `<button>` reports a clean toolbar while one of them
 * sits on it wordless. Demonstrated: an `<a>` with an icon and no text was
 * added and every test passed.
 */
const PRESSABLE = [
  "button",
  "a",
  "input",
  "label",
  "summary",
  "[tabindex]",
  "[role=button]",
  "[role=link]",
  "[role=switch]",
  "[role=tab]",
  "[role=checkbox]",
  "[role=option]",
  // `^=`, not `=`: this PR's own rows are `menuitemradio`, and an exact
  // attribute match let seven of eight shapes through — including the one
  // role the PR had just started using, while listing the one it had
  // stopped using.
  "[role^=menuitem]",
].join(", ");

function wordless(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(PRESSABLE)]
    // A file input is a mechanism, never the control: `AddButton` keeps two
    // of them hidden and clicks them from a menu row. The row is what a
    // reader presses and the row is what this scan is about. Widening the
    // selector to `input` surfaced them, which is the scan working — they
    // are named here rather than left to widen the expected list.
    .filter((b) => !(b instanceof HTMLInputElement && b.type === "file"))
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

  it.each([
    ["a", { href: "#" }],
    ["div", { role: "button", tabindex: "0" }],
    ["div", { role: "switch", tabindex: "0" }],
    ["div", { role: "tab", tabindex: "0" }],
    ["div", { role: "checkbox", tabindex: "0" }],
    ["div", { role: "menuitemradio", tabindex: "0" }],
    // No `tabindex`, so only the role catches it — and `[role=menuitem]`
    // does not match `menuitemradio`, which is the role this PR's own rows
    // use. The exact-match version listed the role the code had stopped
    // using and missed the one it had started using.
    ["div", { role: "menuitemradio" }],
    ["div", { tabindex: "0" }],
    ["input", { type: "button", value: "" }],
    ["label", {}],
  ])("sees a wordless <%s %s>", (tag, attrs) => {
    // Eight of these nine walked past the first version of the selector.
    const { container } = render(<FolderToolbar {...props} />);
    const stray = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) stray.setAttribute(k, v as string);
    stray.appendChild(document.createElement("svg"));
    container.querySelector("div")!.appendChild(stray);
    expect(wordless(container)).toContain("(no accessible name)");
  });

  it("names the filter with a word at every state", () => {
    // The one this PR closed: two chips that were bare icons until
    // something was selected.
    const { container } = render(<FolderToolbar {...props} />);
    expect(wordless(container)).not.toContain("File type");
    expect(wordless(container)).not.toContain("Verification");
    expect(
      screen.getAllByRole("button", { name: /^Filter/ }).length,
    ).toBeGreaterThan(0);
  });
});
