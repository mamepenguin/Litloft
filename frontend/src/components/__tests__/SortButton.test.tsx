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
    // Pressed with focus on the trigger rather than at `document`: a
    // press with no `HTMLElement` target reads as "not editing" to the
    // provider, so it would pass even with `editingOnly: false` removed.
    render(
      <ShortcutsProvider>
        <SortButton sort="created_at" order="desc" onChange={onChange} />
      </ShortcutsProvider>,
    );
    const trigger = screen.getByLabelText("Sort");
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
