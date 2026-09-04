import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ViewToggle } from "../ViewToggle";

const STORAGE_KEY = "video-share-view-mode";

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  vi.restoreAllMocks();
});

describe("ViewToggle (uncontrolled)", () => {
  it("renders only grid and list buttons (Phase 3 redesign — no two-pane)", () => {
    render(<ViewToggle onChange={vi.fn()} />);
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    expect(screen.getByLabelText("List view")).toBeInTheDocument();
    expect(screen.queryByLabelText(/two.pane/i)).toBeNull();
  });

  it("persists clicks to global localStorage and notifies parent", () => {
    const onChange = vi.fn();
    render(<ViewToggle onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("List view"));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("list");
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("loads saved mode on mount in uncontrolled mode", () => {
    localStorage.setItem(STORAGE_KEY, "list");
    const onChange = vi.fn();
    render(<ViewToggle onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("ignores legacy 'two-pane' value in localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "two-pane");
    const onChange = vi.fn();
    render(<ViewToggle onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ViewToggle (controlled)", () => {
  it("reflects external mode prop", () => {
    render(<ViewToggle mode="list" onChange={vi.fn()} />);
    const list = screen.getByLabelText("List view");
    const grid = screen.getByLabelText("Grid view");
    // `classList.contains`, not `className.toContain`: the old assertion
    // matched "bg-accent" as a substring, so it would also have passed on
    // `bg-accent/10` or `bg-accent-teal`.
    expect(list.classList.contains("border-accent")).toBe(true);
    expect(grid.classList.contains("border-accent")).toBe(false);
  });

  // DESIGN.md §2.2: one accent fill per screen, and it belongs to what the
  // screen is for. This toggle rides on the folder toolbar beside Upload and
  // Play, and also on Trash, Missing and the inside of an archive, so a fill
  // here was spending the budget on a view switch in four places.
  it("does not spend an accent fill on the selected view", () => {
    render(<ViewToggle mode="list" onChange={vi.fn()} />);
    for (const label of ["List view", "Grid view"]) {
      const button = screen.getByLabelText(label);
      const filled = [...button.classList].filter((c) =>
        /^bg-accent(-cta|-hover)?$/.test(c),
      );
      expect(filled).toEqual([]);
    }
  });

  // Selection has to be *visible*, which a surface cannot do here: `--bg-card`
  // and `--bg-primary` are both `#ffffff` in the light theme, so a
  // card-coloured selected state is the page background. The first attempt at
  // removing the accent fill shipped exactly that. Neither jsdom nor a class
  // assertion can see a colour, so what is pinned instead is the *device*:
  // selection is a border, and both buttons carry a border box so nothing
  // shifts when it changes colour.
  it("marks selection with a border that both buttons reserve room for", () => {
    render(<ViewToggle mode="list" onChange={vi.fn()} />);
    const list = screen.getByLabelText("List view");
    const grid = screen.getByLabelText("Grid view");
    expect(list.classList.contains("border")).toBe(true);
    expect(grid.classList.contains("border")).toBe(true);
    expect(grid.classList.contains("border-transparent")).toBe(true);
    // A background would be the thing that cannot be seen; assert there is none.
    expect([...list.classList].filter((c) => /^bg-/.test(c))).toEqual([]);
  });

  it("does not write to localStorage when controlled", () => {
    const onChange = vi.fn();
    render(<ViewToggle mode="grid" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("List view"));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(onChange).toHaveBeenCalledWith("list");
  });
});
