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

  it("falls back to a template that still holds the floor", () => {
    // A container reporting 0 has not been laid out — a `display:none`
    // subtree, a server render, or jsdom without a stubbed width.
    // Claiming a measurement that never happened would be wrong, but so
    // would falling back to something that paints one column: the
    // `calc(50%…)` floor caps the track at half the container, so
    // `auto-fill` cannot land on a single column even unmeasured.
    expect(renderAtWidth(0)).toBe(
      "repeat(auto-fill, minmax(min(16rem, calc(50% - 6px)), 1fr))",
    );
  });

  it("measures the content box, not the padding box", () => {
    // The tracks are laid inside the padding. A grid told it has the
    // padding-box width fits a column that has nowhere to go.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1058);
    const original = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => ({
      ...original(el as Element),
      paddingLeft: "8px",
      paddingRight: "8px",
    }) as CSSStyleDeclaration);

    render(<Grid />);
    // 1058 - 16 = 1042 content px, which holds 3 columns, not 4.
    expect(screen.getByTestId("grid").style.gridTemplateColumns).toBe(
      "repeat(3, minmax(0, 1fr))",
    );
  });

  it("stops observing the element it is taken off", () => {
    // Nothing else asserts the teardown, and a leaked observer keeps a
    // detached node alive and re-measures a grid that is gone.
    const disconnected: number[] = [];
    let instances = 0;
    class CountingObserver {
      id: number;
      constructor(callback: () => void) {
        this.id = ++instances;
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnected.push(this.id);
      }
    }
    vi.stubGlobal("ResizeObserver", CountingObserver);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);

    const { unmount } = render(<Grid />);
    expect(instances).toBe(1);
    expect(disconnected).toEqual([]);

    unmount();
    expect(disconnected).toEqual([1]);
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
