import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { stripComments } from "@/__tests__/helpers/sourceScan";

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
    expect(list.classList.contains("border-accent")).toBe(true);
    expect(grid.classList.contains("border-accent")).toBe(false);
  });

  // One accent fill per screen, and it belongs to what the screen is for. A
  // view switch is not what any screen is for.
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
  // card-coloured selected state is the page background.
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

describe("where ViewToggle is used", () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

  function callSites(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        // Addon trees are symlinked in here and read at their own root.
        if (entry.name === "addons" && dir === SRC) continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
          if (/<ViewToggle\b/.test(stripComments(readFileSync(full, "utf-8")))) {
            out.push(relative(SRC, full));
          }
        }
      }
    };
    walk(SRC);
    return out.sort();
  }

  it("appears on exactly the screens its comment names", () => {
    // A screen keeps the toggle where the bar it sits on has room for two
    // adjacent icons; a bar competing for room carries a labelled
    // `View: <layout>` menu instead.
    expect(callSites()).toEqual([
      "components/CollectionDetail.tsx",
      "components/missing/MissingView.tsx",
      "components/trash/TrashToolbar.tsx",
    ]);
  });

});
