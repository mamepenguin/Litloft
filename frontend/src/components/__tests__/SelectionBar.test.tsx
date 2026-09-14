import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectionBar, groupSurvivesNarrow } from "../SelectionBar";
import { batchTag } from "@/lib/api";
import { confirmConversionThenEnter } from "@/__tests__/helpers/imeEnter";

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

  it("does not tag on the Enter that confirms a conversion", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tagging"));
    confirmConversionThenEnter(screen.getByPlaceholderText("tag1, tag2..."), "料理");
    expect(batchTag).not.toHaveBeenCalled();
  });

  it("tags on an Enter pressed after the grace window", () => {
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tagging"));
    confirmConversionThenEnter(screen.getByPlaceholderText("tag1, tag2..."), "料理", {
      afterGrace: true,
    });
    expect(batchTag).toHaveBeenCalledTimes(1);
  });
});

/**
 * The component states its membership on `data-bar`, and the visibility
 * classes are pinned exactly rather than searched.
 */
describe("SelectionBar at 375px", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Every bulk action, by accessible name, in the order the bar draws them. */
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

  /**
   * Deliberately **not** a filter for "the ones that decide visibility": a
   * classifier that decides which classes matter fails towards *missing*
   * one, so the expected lists below are exact instead.
   */
  const tokens = (el: Element) =>
    (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

  const BUTTON_BASE = [
    "flex", "shrink-0", "items-center", "gap-1.5", "rounded-2xl",
    "px-3", "py-2", "text-sm", "transition-colors", "pointer-coarse:min-h-11",
  ];
  const BUTTON_PLAIN = [
    "text-text-muted", "hover:bg-bg-elevated", "hover:text-text-primary",
    "active:bg-bg-elevated",
  ];
  const BUTTON_DANGER = ["text-danger", "hover:bg-accent/10", "active:bg-accent/15"];
  /** The one recipe that takes a control off the bar below 640px. */
  const WIDE_ONLY = ["hidden", "sm:flex"];
  const DIVIDER_BASE = ["mx-0.5", "h-5", "w-px", "shrink-0", "bg-bg-border"];

  const dividerRecipes = (root: HTMLElement) =>
    [...root.querySelectorAll("[class~='w-px']")].map(tokens);

  it("holds every action, and holds each of them once", () => {
    render(<SelectionBar {...defaultProps} />);
    expect(ALL_ACTIONS).toHaveLength(7);
    for (const name of ALL_ACTIONS) {
      expect(screen.getAllByLabelText(name)).toHaveLength(1);
    }
  });

  it("draws them in list order at every width", () => {
    // The grouping is the order: edit, then organize, then the destructive
    // one.
    const { container } = render(<SelectionBar {...defaultProps} />);
    const drawn = [...container.querySelectorAll("[data-bar]")].map((el) =>
      el.getAttribute("aria-label"),
    );
    expect(drawn).toEqual(ALL_ACTIONS);
  });

  it("keeps exactly the two the bar is used for", () => {
    render(<SelectionBar {...defaultProps} />);
    const kept = actionButtons()
      .filter((el) => el.getAttribute("data-bar") === "always")
      .map((el) => el.getAttribute("aria-label"));
    expect(kept).toEqual(KEPT);
  });

  it("hides the rest with one recipe, and carries no other class at all", () => {
    render(<SelectionBar {...defaultProps} />);
    for (const el of actionButtons()) {
      const colour =
        el.getAttribute("aria-label") === "Move to Trash"
          ? BUTTON_DANGER
          : BUTTON_PLAIN;
      const wide = el.getAttribute("data-bar") === "wide";
      expect(tokens(el)).toEqual([
        ...BUTTON_BASE,
        ...colour,
        ...(wide ? WIDE_ONLY : []),
      ]);
    }
  });

  it("shows the name of everything that stays on the bar", () => {
    render(<SelectionBar {...defaultProps} />);
    for (const el of actionButtons().filter(
      (e) => e.getAttribute("data-bar") === "always",
    )) {
      const label = el.querySelector("span")!;
      // No class at all, rather than "no class I recognise as hiding it".
      expect(label.getAttribute("class")).toBeNull();
      expect(label.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("puts the rest behind the overflow, and nowhere else", () => {
    render(<SelectionBar {...defaultProps} />);
    const hidden = actionButtons()
      .filter((el) => el.getAttribute("data-bar") === "wide")
      .map((el) => el.getAttribute("aria-label"));
    expect([...KEPT, ...hidden].sort()).toEqual([...ALL_ACTIONS].sort());

    fireEvent.click(screen.getByLabelText("More actions for the selection"));
    const rows = screen.getAllByRole("menuitem").map((r) => r.textContent?.trim());
    // The full names, not the shorter words the faces carry: one action
    // must not answer to two different names depending on width.
    expect(rows).toEqual(hidden);
  });

  it("runs the chosen action, closes, and gives focus back", () => {
    render(<SelectionBar {...defaultProps} />);
    const trigger = screen.getByLabelText("More actions for the selection");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Trash" }));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    // Without this the chosen row unmounts and focus lands on <body>.
    expect(document.activeElement).toBe(trigger);
  });

  it("hangs the menu where nothing clips it", () => {
    // The card is `overflow-hidden` for its corners, and `absolute` does not
    // escape an ancestor's clip.
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("More actions for the selection"));
    const menu = screen.getByRole("menu");
    const chain: HTMLElement[] = [];
    for (let el = menu.parentElement; el; el = el.parentElement) {
      chain.push(el);
      if (tokens(el).includes("fixed")) break;
    }
    // The whole chain, pinned rather than searched for `overflow-*`:
    // `contain-paint` clips as hard, and an inline style carries no class.
    expect(chain.map(tokens)).toEqual([
      ["relative", "mx-auto", "max-w-3xl", "px-3", "pb-3", "sm:pb-4"],
      ["fixed", "bottom-0", "left-0", "right-0", "z-50", "animate-slide-up-bar"],
    ]);
    // Classes are not the only way to clip.
    for (const el of chain) {
      expect([el.style.overflow, el.style.contain, el.style.clipPath]).toEqual([
        "", "", "",
      ]);
    }
  });

  it("does not scroll its actions sideways", () => {
    const { container } = render(<SelectionBar {...defaultProps} />);
    const row = screen.getByLabelText("Move").parentElement!;
    const classes = (row.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).not.toContain("overflow-x-auto");
    for (const el of container.querySelectorAll("[class]")) {
      expect((el.getAttribute("class") ?? "").split(/\s+/)).not.toContain(
        "scrollbar-hide",
      );
    }
  });

  it("gives every control on the bar a coarse-pointer target", () => {
    render(<SelectionBar {...defaultProps} />);
    for (const el of actionButtons().filter(
      (e) => e.getAttribute("data-bar") === "always",
    )) {
      expect((el.getAttribute("class") ?? "").split(/\s+/)).toContain(
        "pointer-coarse:min-h-11",
      );
    }
    expect(
      (
        screen
          .getByLabelText("More actions for the selection")
          .getAttribute("class") ?? ""
      ).split(/\s+/),
    ).toEqual(expect.arrayContaining(["h-11", "w-11"]));
  });

  it("leaves the other actions in place while a tag is being typed", () => {
    // The tag input replaces its own button, not the row.
    render(<SelectionBar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tagging"));
    expect(screen.getByPlaceholderText("tag1, tag2...")).toBeInTheDocument();
    for (const name of ALL_ACTIONS.filter((n) => n !== "Tagging")) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
  });

  it("keeps a group divider only while that group still has something", () => {
    // Dividers separate edit / organize / destructive. At 375px the organize
    // group still shows Move, so its rule stays; the destructive group is
    // entirely in `…`, so its rule would otherwise trail the last button
    // with nothing after it.
    const { container } = render(<SelectionBar {...defaultProps} />);
    expect(dividerRecipes(container)).toEqual([
      DIVIDER_BASE,
      [...DIVIDER_BASE, "hidden", "sm:block"],
    ]);
  });

  it("needs no overflow in the trash, where there are two actions", () => {
    const { container } = render(<SelectionBar {...defaultProps} isTrashView />);
    for (const name of ["Restore", "Permanently Delete"]) {
      expect(screen.getByLabelText(name)).toHaveAttribute("data-bar", "always");
    }
    // The divider rule is computed per group, and the trash has its own list.
    expect(dividerRecipes(container)).toEqual([DIVIDER_BASE]);
    expect(
      screen.queryByLabelText("More actions for the selection"),
    ).not.toBeInTheDocument();
  });
});

describe("groupSurvivesNarrow", () => {
  const g = (spec: string) =>
    [...spec].map((c) => ({
      startsGroup: c === c.toUpperCase(),
      keepOnBar: c.toLowerCase() === "k",
    }));

  // Upper case opens a group, `k` stays on the bar at 375px.
  //   "KxXk"  →  group 0 = [K, x], group 1 = [X, k]
  it.each([
    ["Kx", 0, true, "the group's own first action stays"],
    ["Xk", 0, true, "a later action in the same group stays"],
    ["Xx", 0, false, "nothing in the group stays"],
    ["XxKk", 0, false, "the next group's survivor is not this group's"],
    ["XxKk", 2, true, "and it is that group's"],
    ["Xxkk", 0, true, "actions after it in the same group still count"],
  ])("%s at %d → %s (%s)", (spec, index, expected) => {
    expect(groupSurvivesNarrow(g(spec as string), index as number)).toBe(expected);
  });
});
