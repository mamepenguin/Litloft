import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TrashToolbar } from "../TrashToolbar";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";

vi.mock("@/components/SortButton", () => ({
  SortButton: () => <button data-testid="sort-button">Sort</button>,
}));

const defaultProps = {
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 12,
  selectable: false,
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
};

/** The seven type pills, as the desktop row draws them. */
const pills = () =>
  screen.queryAllByRole("button", {
    name: /^(All|Video|Image|Audio|Document|Archive|Other)$/,
  });

describe("TrashToolbar", () => {
  it("offers the full set of controls when there is something in the trash", () => {
    render(<TrashToolbar {...defaultProps} />);
    expect(screen.getByTestId("sort-button")).toBeInTheDocument();
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    // Seven on desktop, seven again inside the mobile popover's trigger
    // menu — the trigger itself is what matters here.
    expect(pills().length).toBeGreaterThan(0);
    expect(screen.getByLabelText("File type")).toBeInTheDocument();
  });

  // The select-mode button shares a pill with ViewToggle, so it has to say
  // "on" the same way. It was an accent fill sitting directly beside the
  // toggle's accent border — two idioms for one idea in one cluster — and it
  // was also the screen's one fill (DESIGN.md §2.2) spent on a mode switch.
  describe("the select-mode button", () => {
    it("marks its pressed state with a border, not a fill", () => {
      render(<TrashToolbar {...defaultProps} selectable />);
      const button = screen.getByLabelText("Selection mode");
      expect(button.classList.contains("border-accent")).toBe(true);
      expect([...button.classList].filter((c) => /^bg-/.test(c))).toEqual([]);
    });

    it("reserves the border box when not pressed, so nothing shifts", () => {
      render(<TrashToolbar {...defaultProps} />);
      const button = screen.getByLabelText("Selection mode");
      expect(button.classList.contains("border")).toBe(true);
      expect(button.classList.contains("border-transparent")).toBe(true);
      expect(button.classList.contains("border-accent")).toBe(false);
    });

    // A toggle that only looks pressed is not pressed to a screen reader.
    it("reports its pressed state", () => {
      const { unmount } = render(<TrashToolbar {...defaultProps} selectable />);
      expect(
        screen.getByLabelText("Selection mode").getAttribute("aria-pressed"),
      ).toBe("true");
      unmount();
      render(<TrashToolbar {...defaultProps} />);
      expect(
        screen.getByLabelText("Selection mode").getAttribute("aria-pressed"),
      ).toBe("false");
    });
  });

  it("closes its kind filter on Escape and returns focus to the trigger", () => {
    // The scrim is a pointer gesture, so without an Escape path a
    // keyboard user who opens this menu cannot back out of it — and
    // `docs/user-guide/overview.md` tells them it works. Measured before
    // it was wired: the menu stayed open.
    //
    // Focus is moved **into the menu** before the press, which is where a
    // keyboard user's focus is after arrowing to a row. Pressing with
    // focus already on the trigger asserts nothing about the focus
    // return: closing the menu does not move focus, so `toHaveFocus`
    // passes whether or not the handler restores it. That was measured —
    // deleting the focus line left three of these green.
    render(
      <ShortcutsProvider>
        <TrashToolbar {...defaultProps} />
      </ShortcutsProvider>,
    );
    const trigger = screen.getByLabelText("File type");
    fireEvent.click(trigger);
    const row = screen.getAllByRole("menuitemradio")[0];
    row.focus();
    expect(row).toHaveFocus();

    fireEvent.keyDown(row, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });


  it("closes on Escape even with focus in a text field", () => {
    // What `editingOnly: false` buys, and the only state that needs it.
    // Nothing traps focus inside these menus, so Tab walks out of the last
    // row into whatever follows in the document — a search box, a filter
    // field. `ShortcutsProvider` treats an INPUT as "editing", and without
    // the flag a shortcut fires only when nothing is being edited, so
    // Escape would do nothing there while the menu is still up.
    //
    // Measured before this case existed: deleting `editingOnly: false`
    // left every other assertion green.
    render(
      <ShortcutsProvider>
        <TrashToolbar {...defaultProps} />
        <input aria-label="elsewhere" />
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByLabelText("File type"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const field = screen.getByLabelText("elsewhere");
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("puts every arranging control away when the trash is empty", () => {
    // An empty bin has nothing to sort, nothing to lay out, and nothing
    // to filter by kind. All that is left worth saying is "0 items".
    render(<TrashToolbar {...defaultProps} total={0} />);
    expect(screen.queryByTestId("sort-button")).toBeNull();
    expect(screen.queryByLabelText("Grid view")).toBeNull();
    expect(screen.queryByLabelText("List view")).toBeNull();
    expect(pills()).toHaveLength(0);
    expect(screen.queryByLabelText("File type")).toBeNull();
    expect(screen.queryByLabelText("Selection mode")).toBeNull();
  });

  it("keeps the count when the trash is empty", () => {
    render(<TrashToolbar {...defaultProps} total={0} />);
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it("keeps everything when a type filter is what emptied the view", () => {
    // The pill that produced the empty result is the way back out of it.
    render(<TrashToolbar {...defaultProps} total={0} typeFilter="audio" />);
    expect(screen.getByTestId("sort-button")).toBeInTheDocument();
    expect(pills().length).toBeGreaterThan(0);
  });
});
