/**
 * Tests for the shared <FilterField> component (right-pane + tree-pane filter UI).
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §4.
 *
 * RED phase — the component does not exist yet. These tests must fail with
 * a "Cannot find module" error until 4.2 lands.
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

  it("renders a type dropdown with default 'All' label when typeFilter is null", () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
      />,
    );
    // The type dropdown trigger is a button; default label is "All" / "すべて"
    // Tolerate either the translated string or the i18n key fallback.
    const trigger = screen.getByRole("button", { name: /all|filter\.type\.all|すべて/i });
    expect(trigger).toBeInTheDocument();
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

    // Before the debounce window elapses, the parent should not see "spec".
    expect(onTextChange).not.toHaveBeenCalledWith("spec");

    // Advance past the 300ms debounce.
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onTextChange).toHaveBeenLastCalledWith("spec");
  });

  it("fires onTypeFilterChange immediately when a type option is selected", async () => {
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

    // Open the dropdown.
    const trigger = screen.getByRole("button", { name: /all|filter\.type\.all|すべて/i });
    fireEvent.click(trigger);

    // Pick "Markdown" from the menu.
    const markdownOption = await screen.findByRole("menuitem", {
      name: /markdown/i,
    });
    fireEvent.click(markdownOption);

    expect(onTypeFilterChange).toHaveBeenCalledWith("markdown");
  });

  it("shows a clear button when text is non-empty and clears both text and type when clicked", () => {
    const onClear = vi.fn();

    render(
      <FilterField
        text="abc"
        onTextChange={vi.fn()}
        placeholder="search..."
        typeFilter="markdown"
        onTypeFilterChange={vi.fn()}
        onClear={onClear}
      />,
    );

    const clearBtn = screen.getByRole("button", { name: /clear|filter\.clear|解除/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("hides the clear button when text is empty and no type filter is set", () => {
    render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="search..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /clear|filter\.clear|解除/i }),
    ).not.toBeInTheDocument();
  });

  it("uses the 'clearInput' i18n label for the X icon-only button", () => {
    render(
      <FilterField
        text="abc"
        onTextChange={vi.fn()}
        placeholder="search..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
      />,
    );

    // The X clear button now reads the input-only label, not the global
    // filter clear copy.
    const clearBtn = screen.getByRole("button", {
      name: /clear input|filter\.clearInput|入力をクリア/i,
    });
    expect(clearBtn).toBeInTheDocument();
  });

  it("Escape closes the dropdown and refocuses the trigger", async () => {
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

    const trigger = screen.getByRole("button", { name: /all|filter\.type\.all|すべて/i });
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

    const trigger = screen.getByRole("button", { name: /all|filter\.type\.all|すべて/i });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");

    // Initial focus is on the currently selected entry (null → index 0 = All).
    // ArrowDown → index 1 (markdown). Press Enter → onTypeFilterChange("markdown").
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });

    expect(onTypeFilterChange).toHaveBeenCalledWith("markdown");
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

    const trigger = screen.getByRole("button", { name: /all|filter\.type\.all|すべて/i });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");

    // From index 0 (All), ArrowUp wraps to index 4 (pdf).
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "Enter" });

    expect(onTypeFilterChange).toHaveBeenCalledWith("pdf");
  });

  it("applies an accent-colored label on the type trigger when type is non-null", () => {
    const { rerender } = render(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter={null}
        onTypeFilterChange={vi.fn()}
      />,
    );

    const inactive = screen.getByRole("button", { name: /all|filter\.type\.all|すべて/i });
    expect(inactive.className).not.toMatch(/accent/);

    rerender(
      <FilterField
        text=""
        onTextChange={vi.fn()}
        placeholder="..."
        typeFilter="video"
        onTypeFilterChange={vi.fn()}
      />,
    );

    // The trigger label now reflects the current selection (video / 動画) and
    // wears an accent color class — exact token may vary per DESIGN.md, so we
    // assert that *some* accent-* class is present.
    const active = screen.getByRole("button", { name: /video|動画/i });
    expect(active.className).toMatch(/accent/);
  });
});
