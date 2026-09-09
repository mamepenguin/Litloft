import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SortButton } from "../SortButton";
import { ShortcutsProvider } from "../ShortcutsProvider";

describe("SortButton", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes on Escape and returns focus to the trigger", () => {
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
        <SortButton sort="created_at" order="desc" onChange={onChange} />
      </ShortcutsProvider>,
    );
    const trigger = screen.getByLabelText("Sort");
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
        <SortButton sort="created_at" order="desc" onChange={onChange} />
        <input aria-label="elsewhere" />
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByLabelText("Sort"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const field = screen.getByLabelText("elsewhere");
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders sort button", () => {
    render(<SortButton sort="created_at" order="desc" onChange={onChange} />);
    expect(screen.getByLabelText("Sort")).toBeInTheDocument();
  });

  it("shows random option in menu", () => {
    render(<SortButton sort="created_at" order="desc" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Sort"));
    expect(screen.getByText("Random")).toBeInTheDocument();
  });

  it("calls onChange with random/desc when random is selected", () => {
    render(<SortButton sort="created_at" order="desc" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Sort"));
    fireEvent.click(screen.getByText("Random"));
    expect(onChange).toHaveBeenCalledWith("random", "desc");
  });

  it("shows check mark next to random when sort is random", () => {
    render(<SortButton sort="random" order="desc" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Sort"));
    const randomItem = screen.getByText("Random").closest("button");
    expect(randomItem).toHaveClass("font-medium");
  });
});
