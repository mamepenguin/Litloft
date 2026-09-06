import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";

/**
 * The floor has to reach the DOM, not just the pure function.
 *
 * `columnsFor` can be right while the grid still renders one column,
 * because the measured value only matters if the element carries the ref
 * and the style reads the state. This mounts a grid and reads back the
 * template it actually got.
 */

let resize: (() => void) | undefined;

beforeEach(() => {
  resize = undefined;
  class ResizeObserverMock {
    constructor(callback: () => void) {
      resize = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Grid() {
  const { ref, columns } = useCardColumns();
  return (
    <div
      ref={ref}
      data-testid="grid"
      style={{ gridTemplateColumns: cardGridTemplate(columns) }}
    />
  );
}

function renderAtWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  render(<Grid />);
  return screen.getByTestId("grid").style.gridTemplateColumns;
}

describe("a mounted card grid", () => {
  it("holds two columns on a 375px phone", () => {
    expect(renderAtWidth(343)).toBe("repeat(2, minmax(0, 1fr))");
  });

  it("takes the columns that fit on a wide canvas", () => {
    expect(renderAtWidth(1213)).toBe("repeat(4, minmax(0, 1fr))");
  });

  it("falls back to auto-fill until it has been measured", () => {
    // A container reporting 0 has not been laid out — a `display:none`
    // subtree, or jsdom without a stubbed width. Claiming the floor
    // there would be reporting a measurement that never happened.
    expect(renderAtWidth(0)).toBe(
      "repeat(auto-fill, minmax(min(16rem, 100%), 1fr))",
    );
  });

  it("re-counts when the container is resized", () => {
    const widths = vi.spyOn(HTMLElement.prototype, "clientWidth", "get");
    widths.mockReturnValue(343);
    render(<Grid />);
    const grid = screen.getByTestId("grid");
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");

    widths.mockReturnValue(1480);
    act(() => resize!());
    expect(grid.style.gridTemplateColumns).toBe("repeat(5, minmax(0, 1fr))");
  });
});
