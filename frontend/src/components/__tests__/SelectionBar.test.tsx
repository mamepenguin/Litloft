import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectionBar } from "../SelectionBar";

vi.mock("@/lib/api", () => ({
  batchDelete: vi.fn().mockResolvedValue({ deleted: 2, errors: [] }),
  batchMove: vi.fn().mockResolvedValue({ moved: 2, errors: [] }),
  batchTag: vi.fn().mockResolvedValue({ updated: 2, errors: [] }),
  batchRestore: vi.fn().mockResolvedValue({ restored: 2, errors: [] }),
  batchPurge: vi.fn().mockResolvedValue({ purged: 2, errors: [] }),
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm, onCancel }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open }: any) =>
    open ? <div data-testid="move-dialog" /> : null,
}));

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("../CollectionPicker", () => ({
  CollectionPicker: ({ open }: any) =>
    open ? <div data-testid="collection-picker" /> : null,
}));

const defaultProps = {
  count: 3,
  selectedIds: new Set(["f1", "f2", "f3"]),
  totalCount: 10,
  drive: "main",
  currentPath: "",
  onSelectAll: vi.fn(),
  onClear: vi.fn(),
  onComplete: vi.fn(),
};

describe("SelectionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders selection count", () => {
    render(<SelectionBar {...defaultProps} />);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("returns null when count is 0", () => {
    const { container } = render(
      <SelectionBar {...defaultProps} count={0} selectedIds={new Set()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows select all button when count < total", () => {
    render(<SelectionBar {...defaultProps} />);
    expect(screen.getByText("Select all")).toBeInTheDocument();
  });

  it("hides select all when count equals total", () => {
    render(<SelectionBar {...defaultProps} count={10} totalCount={10} />);
    expect(screen.queryByText("Select all")).not.toBeInTheDocument();
  });

  it("calls onSelectAll on click", () => {
    const onSelectAll = vi.fn();
    render(<SelectionBar {...defaultProps} onSelectAll={onSelectAll} />);
    fireEvent.click(screen.getByText("Select all"));
    expect(onSelectAll).toHaveBeenCalled();
  });

  it("calls onClear on deselect button", () => {
    const onClear = vi.fn();
    render(<SelectionBar {...defaultProps} onClear={onClear} />);
    fireEvent.click(screen.getByLabelText("Deselect"));
    expect(onClear).toHaveBeenCalled();
  });

  it("opens delete dialog", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Move to Trash"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("opens move dialog", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Move"));
    expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
  });

  it("opens collection picker", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Add to collection"));
    expect(screen.getByTestId("collection-picker")).toBeInTheDocument();
  });

  it("shows tag input on tag button click", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tagging"));
    expect(screen.getByPlaceholderText("tag1, tag2...")).toBeInTheDocument();
  });
});

/**
 * The 375px form.
 *
 * jsdom loads no stylesheet, so every branch of a responsive layout is in
 * the tree at once and a plain `getByLabelText` cannot tell "on the bar"
 * from "desktop only". These read the classes that decide it, which is
 * also where the defect was: the row used to be
 * `overflow-x-auto scrollbar-hide`, so four of seven actions sat off the
 * right-hand edge of a 375px screen with the scrollbar hidden — 00-basis
 * 原則 5, what is cut off should look cut off.
 */
describe("SelectionBar at 375px", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Every bulk action, by accessible name, in the order the bar lists them. */
  const ALL_ACTIONS = [
    "Tagging",
    "Rename",
    "Add to collection",
    "Copy",
    "Cut",
    "Move",
    "Move to Trash",
  ];

  /** The two that survive the narrow width. Named, not counted. */
  const KEPT = ["Tagging", "Move"];

  const actionButtons = () =>
    ALL_ACTIONS.map((name) => screen.getByLabelText(name));

  const isDesktopOnly = (el: HTMLElement) =>
    (el.getAttribute("class") ?? "").split(/\s+/).includes("hidden");

  it("holds every action, and holds each of them once", () => {
    render(<SelectionBar {...defaultProps} />);
    // Not `>=`, and not a subset: the whole list, so an action added to the
    // bar without a decision about 375px fails here.
    expect(ALL_ACTIONS).toHaveLength(7);
    for (const name of ALL_ACTIONS) {
      expect(screen.getAllByLabelText(name)).toHaveLength(1);
    }
  });

  it("keeps exactly the two the bar is used for", () => {
    render(<SelectionBar {...defaultProps} />);
    const kept = actionButtons()
      .filter((el) => !isDesktopOnly(el))
      .map((el) => el.getAttribute("aria-label"));
    expect(kept).toEqual(KEPT);
  });

  it("puts the rest behind the overflow, and nowhere else", () => {
    render(<SelectionBar {...defaultProps} />);
    const hidden = actionButtons()
      .filter(isDesktopOnly)
      .map((el) => el.getAttribute("aria-label"));
    // The partition: kept ∪ hidden is the whole list, with no overlap.
    expect([...KEPT, ...hidden].sort()).toEqual([...ALL_ACTIONS].sort());

    fireEvent.click(screen.getByLabelText("More actions for the selection"));
    const rows = screen.getAllByRole("menuitem").map((r) => r.textContent?.trim());
    expect(rows).toEqual(["Rename", "Collection", "Copy", "Cut", "Move to Trash"]);
  });

  it("gives the overflow rows their labels, not just icons", () => {
    // "Fewer controls, not nameless ones" — the rule the old bar broke by
    // dropping every label at `sm` and scrolling the icons sideways.
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("More actions for the selection"));
    for (const row of screen.getAllByRole("menuitem")) {
      expect(row.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("runs the chosen action and closes", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("More actions for the selection"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Trash" }));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not scroll its actions sideways", () => {
    const { container } = render(<SelectionBar {...defaultProps} />);
    const row = screen.getByLabelText("Move").parentElement!;
    const classes = (row.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).not.toContain("overflow-x-auto");
    expect(classes).not.toContain("scrollbar-hide");
    // Nowhere in the bar, not merely on the row this test happened to pick.
    for (const el of container.querySelectorAll("[class]")) {
      expect((el.getAttribute("class") ?? "").split(/\s+/)).not.toContain(
        "scrollbar-hide",
      );
    }
  });

  it("gives every control on the bar a coarse-pointer target", () => {
    // 00-basis: 44px on touch. `min-h-11` on the box rather than a hit-area
    // overhang, because these sit shoulder to shoulder and overlapping
    // pseudo-elements let the later one win the hit test.
    render(<SelectionBar {...defaultProps} />);
    for (const el of actionButtons().filter((e) => !isDesktopOnly(e))) {
      expect((el.getAttribute("class") ?? "").split(/\s+/)).toContain(
        "pointer-coarse:min-h-11",
      );
    }
    expect(
      (screen.getByLabelText("More actions for the selection").getAttribute("class") ?? "").split(
        /\s+/,
      ),
    ).toEqual(expect.arrayContaining(["h-11", "w-11"]));
  });

  it("needs no overflow in the trash, where there are two actions", () => {
    render(<SelectionBar {...defaultProps} isTrashView />);
    expect(screen.getByLabelText("Restore")).toBeInTheDocument();
    expect(screen.getByLabelText("Permanently Delete")).toBeInTheDocument();
    expect(isDesktopOnly(screen.getByLabelText("Restore"))).toBe(false);
    expect(isDesktopOnly(screen.getByLabelText("Permanently Delete"))).toBe(false);
    expect(screen.queryByLabelText("More actions for the selection")).not.toBeInTheDocument();
  });
});
