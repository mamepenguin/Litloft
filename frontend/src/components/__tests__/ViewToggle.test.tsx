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
  it("renders all three buttons by default", () => {
    render(<ViewToggle onChange={vi.fn()} />);
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    expect(screen.getByLabelText("List view")).toBeInTheDocument();
    expect(screen.getByLabelText("Two-pane view")).toBeInTheDocument();
  });

  it("hides two-pane button when enableTwoPane=false", () => {
    render(<ViewToggle onChange={vi.fn()} enableTwoPane={false} />);
    expect(screen.queryByLabelText("Two-pane view")).toBeNull();
  });

  it("persists clicks to global localStorage and notifies parent", () => {
    const onChange = vi.fn();
    render(<ViewToggle onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Two-pane view"));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("two-pane");
    expect(onChange).toHaveBeenCalledWith("two-pane");
  });

  it("loads saved mode on mount in uncontrolled mode", () => {
    localStorage.setItem(STORAGE_KEY, "list");
    const onChange = vi.fn();
    render(<ViewToggle onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("ignores saved two-pane when enableTwoPane=false", () => {
    localStorage.setItem(STORAGE_KEY, "two-pane");
    const onChange = vi.fn();
    render(<ViewToggle onChange={onChange} enableTwoPane={false} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ViewToggle (controlled)", () => {
  it("reflects external mode prop", () => {
    render(<ViewToggle mode="list" onChange={vi.fn()} />);
    const list = screen.getByLabelText("List view");
    expect(list.className).toContain("bg-accent");
  });

  it("does not write to localStorage when controlled", () => {
    const onChange = vi.fn();
    render(<ViewToggle mode="grid" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Two-pane view"));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(onChange).toHaveBeenCalledWith("two-pane");
  });
});
