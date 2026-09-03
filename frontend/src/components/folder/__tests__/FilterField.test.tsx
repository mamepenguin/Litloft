/**
 * Tests for the shared <FilterField> component (right-pane + tree-pane filter UI).
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §4
 * (chip inline 化、2026-05-09 改訂版).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterField } from "../FilterField";

describe("FilterField", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a text input with the provided placeholder", () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="Filter in this folder..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText("Filter in this folder..."),
    ).toBeInTheDocument();
  });

  it("renders the funnel-style type filter trigger when no type is selected", () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
      />,
    );
    // The trigger now reads "Filter by type" — chip replaces the labeled
    // dropdown when a type is selected.
    expect(
      screen.getByRole("button", {
        name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
      }),
    ).toBeInTheDocument();
  });

  it("hides the funnel trigger when a type is selected (chip replaces it)", () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter="video"
        onTypeFilterChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", {
        name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("renders an inline chip displaying the selected type with an icon and label", () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter="video"
        onTypeFilterChange={vi.fn()}
      />,
    );
    // The chip body is a button advertising "click to change".
    const chip = screen.getByRole("button", {
      name: /click to change|filter\.chipChange|クリックで変更/i,
    });
    expect(chip).toBeInTheDocument();
    // The chip label includes the translated type name.
    expect(chip.textContent ?? "").toMatch(/video|動画/i);
  });

  it("debounces text input with a 300ms delay", () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const onTextChange = vi.fn();

    render(
      <FilterField
        text=""
        onTextChange={onTextChange}
        placeholder="search..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("search...");
    fireEvent.change(input, { target: { value: "spec" } });

    expect(onTextChange).not.toHaveBeenCalledWith("spec");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onTextChange).toHaveBeenLastCalledWith("spec");
  });

  it("fires onTypeFilterChange immediately when a type option is selected from the funnel", async () => {
    const onTypeFilterChange = vi.fn();

    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter={null}
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
    });
    fireEvent.click(trigger);

    const markdownOption = await screen.findByRole("menuitem", {
      name: /markdown/i,
    });
    fireEvent.click(markdownOption);

    expect(onTypeFilterChange).toHaveBeenCalledWith("markdown");
  });

  it("re-opens the dropdown when the chip body is clicked", async () => {
    const onTypeFilterChange = vi.fn();
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter="video"
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const chip = screen.getByRole("button", {
      name: /click to change|filter\.chipChange|クリックで変更/i,
    });
    fireEvent.click(chip);

    // The dropdown opens and the user can pick a different type.
    const imageOption = await screen.findByRole("menuitem", {
      name: /image|画像/i,
    });
    fireEvent.click(imageOption);

    expect(onTypeFilterChange).toHaveBeenCalledWith("image");
  });

  it("clears only the type filter when the chip × button is clicked (text preserved)", () => {
    const onTypeFilterChange = vi.fn();
    const onTextChange = vi.fn();

    render(
      <FilterField
        text="vacation"
        onTextChange={onTextChange}
        placeholder="..."
        typeFilter="video"
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const removeBtn = screen.getByRole("button", {
      name: /remove video filter|filter\.chipRemove|動画 フィルタを解除/i,
    });
    fireEvent.click(removeBtn);

    expect(onTypeFilterChange).toHaveBeenCalledWith(null);
    expect(onTextChange).not.toHaveBeenCalledWith("");
  });

  it("clicking the chip × does not also re-open the dropdown (stopPropagation)", async () => {
    const onTypeFilterChange = vi.fn();
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter="video"
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const removeBtn = screen.getByRole("button", {
      name: /remove video filter|filter\.chipRemove|動画 フィルタを解除/i,
    });
    fireEvent.click(removeBtn);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("clears only the text when the input × button is clicked (type preserved)", () => {
    const onTypeFilterChange = vi.fn();
    const onTextChange = vi.fn();

    render(
      <FilterField
        text="abc"
        onTextChange={onTextChange}
        placeholder="search..."
        typeFilter="video"
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const clearInputBtn = screen.getByRole("button", {
      name: /clear input|filter\.clearInput|入力をクリア/i,
    });
    fireEvent.click(clearInputBtn);

    expect(onTextChange).toHaveBeenCalledWith("");
    expect(onTypeFilterChange).not.toHaveBeenCalled();
  });

  it("hides the input × when text is empty (type alone does not show it)", () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="search..."
        typeFilter="video"
        onTypeFilterChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: /clear input|filter\.clearInput|入力をクリア/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("Backspace at input start removes the chip when the input is empty", () => {
    const onTypeFilterChange = vi.fn();
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="search..."
        typeFilter="video"
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const input = screen.getByPlaceholderText("search...") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onTypeFilterChange).toHaveBeenCalledWith(null);
  });

  it("Backspace at non-zero caret position does not remove the chip", () => {
    const onTypeFilterChange = vi.fn();
    render(
      <FilterField
        text="abc"
        onTextChange={vi.fn()}
        placeholder="search..."
        typeFilter="video"
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const input = screen.getByPlaceholderText("search...") as HTMLInputElement;
    input.focus();
    // Caret in the middle of the text.
    input.setSelectionRange(2, 2);
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onTypeFilterChange).not.toHaveBeenCalled();
  });

  it("Backspace at caret-0 with non-empty text does NOT remove the chip (Linear convention)", () => {
    // The chip should only disappear via Backspace when the input is fully
    // empty. Otherwise users who deliberately moved the caret to the start
    // would lose their type filter unexpectedly.
    const onTypeFilterChange = vi.fn();
    render(
      <FilterField
        text="abc"
        onTextChange={vi.fn()}
        placeholder="search..."
        typeFilter="video"
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const input = screen.getByPlaceholderText("search...") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onTypeFilterChange).not.toHaveBeenCalled();
  });

  it("Backspace with a selection range does not remove the chip", () => {
    const onTypeFilterChange = vi.fn();
    render(
      <FilterField
        text="abc"
        onTextChange={vi.fn()}
        placeholder="search..."
        typeFilter="video"
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const input = screen.getByPlaceholderText("search...") as HTMLInputElement;
    input.focus();
    // Selection from 0 to 2 — caret is at start but a range is highlighted.
    input.setSelectionRange(0, 2);
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onTypeFilterChange).not.toHaveBeenCalled();
  });

  it("Escape closes the dropdown and refocuses the trigger", async () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
    });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");

    fireEvent.keyDown(menu, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("ArrowDown moves focus through options and Enter selects the focused option", async () => {
    const onTypeFilterChange = vi.fn();
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter={null}
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
    });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });

    // The chip now offers the whole vocabulary in the order the
    // toolbar lists it, so the first entry after "All" is Video. It
    // used to be Markdown, when this menu knew only four kinds.
    expect(onTypeFilterChange).toHaveBeenCalledWith("video");
  });

  it("offers every kind, including the ones it used to leave out", async () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
      }),
    );
    const items = await screen.findAllByRole("menuitem");
    // All + eight kinds. A drive of audio or archives had no way to
    // name what was in it before.
    expect(items).toHaveLength(9);
    // Same order as the toolbar's, so the same nine words do not appear
    // in two arrangements depending on which pane you are looking at.
    expect(items.map((el) => el.textContent)).toEqual([
      "All", "Video", "Image", "Audio", "Document", "Markdown", "PDF",
      "Archive", "Other",
    ]);
  });

  it("renders no kind control at all when the caller does not offer one", () => {
    // The listings dropped their kind filter when the toolbar's
    // server-side one became the only one. Absent, not disabled.
    render(<FilterField text="" onTextChange={vi.fn()} placeholder="..." />);

    expect(
      screen.queryByRole("button", {
        name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
      }),
    ).toBeNull();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("ArrowUp wraps focus from the first to the last option", async () => {
    const onTypeFilterChange = vi.fn();
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter={null}
        onTypeFilterChange={onTypeFilterChange}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
    });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "Enter" });

    // Last in the shared order.
    expect(onTypeFilterChange).toHaveBeenCalledWith("other");
  });

  it("renders a chip button when a type is selected", () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter="video"
        onTypeFilterChange={vi.fn()}
      />,
    );

    const chip = screen.getByRole("button", {
      name: /click to change|filter\.chipChange|クリックで変更/i,
    });
    expect(chip).toBeInTheDocument();
    expect(chip.className).toMatch(/text-text-primary/);
  });

  describe("the two shapes", () => {
    // The tree's filter and the listing's were the same component drawn
    // identically, forty pixels apart. Telling them apart is the point
    // of the variant, so the test is about the difference, not about
    // either one's class list.
    const classesFor = (variant?: "pill" | "underline") => {
      const { unmount } = render(
        <FilterField
          text=""
          onTextChange={vi.fn()}
          placeholder="..."
          variant={variant}
        />,
      );
      const el = screen.getByRole("textbox");
      const className = el.className;
      const hasSearchIcon = Boolean(
        el.parentElement?.querySelector("svg.lucide-search"),
      );
      unmount();
      return { className, hasSearchIcon };
    };

    it("draws a bordered pill with a magnifier by default", () => {
      const pill = classesFor();
      expect(pill.className).toContain("rounded-2xl");
      expect(pill.hasSearchIcon).toBe(true);
    });

    it("draws a bare rule with no magnifier when asked for underline", () => {
      const line = classesFor("underline");
      expect(line.className).toContain("border-b");
      expect(line.className).not.toContain("rounded-2xl");
      expect(line.hasSearchIcon).toBe(false);
    });

    it("makes the two visibly different", () => {
      const pill = classesFor("pill");
      const line = classesFor("underline");
      expect(line.className).not.toBe(pill.className);
      expect(line.hasSearchIcon).not.toBe(pill.hasSearchIcon);
    });
  });
});
