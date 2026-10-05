import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRef } from "react";

import { HELD_ATTR, useJustifiedHold } from "../useJustifiedHold";

/**
 * jsdom lays nothing out, so every `offsetTop` is 0 and every grid would be
 * one line. Each cell states the line it is on through `data-top`; what this
 * file checks is the branching on those lines, not the lines themselves.
 */
let restoreOffsetTop: (() => void) | null = null;

beforeEach(() => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset.top ?? 0);
    },
  });
  restoreOffsetTop = () => {
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
  };
});

afterEach(() => {
  restoreOffsetTop?.();
  restoreOffsetTop = null;
});

interface CellSpec {
  key: string;
  top: number;
  ratio?: number;
  focusable?: boolean;
}

function Grid({ cells, more, tick = 0 }: { cells: CellSpec[]; more: boolean; tick?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useJustifiedHold(ref, more);
  return (
    <div className="justified-grid" ref={ref} data-tick={tick}>
      {cells.map((c) => (
        <div
          key={c.key}
          className="justified-grid-cell"
          data-flip-key={c.key}
          data-top={c.top}
          style={{ "--jg-ratio": c.ratio ?? 1 } as React.CSSProperties}
        >
          {c.focusable !== false && (
            <a href={`#${c.key}`} data-file-thumb="">
              {c.key}
            </a>
          )}
        </div>
      ))}
      <div className="justified-grid-tail" />
    </div>
  );
}

const held = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(`[${HELD_ATTR}]`)).map((el) =>
    el.getAttribute("data-flip-key"),
  );

const twoLines: CellSpec[] = [
  { key: "a", top: 0 },
  { key: "b", top: 0 },
  { key: "c", top: 0 },
  { key: "d", top: 200 },
  { key: "e", top: 200 },
];

describe("SPEC-CORE-002 useJustifiedHold", () => {
  it("SPEC-CORE-002 I1: holds exactly the last line when more may follow", () => {
    const { container } = render(<Grid cells={twoLines} more />);
    expect(held(container)).toEqual(["d", "e"]);
  });

  it("SPEC-CORE-002 I6: holds nothing when more may not follow, and releases a held line", () => {
    const { container, rerender } = render(<Grid cells={twoLines} more />);
    expect(held(container)).toEqual(["d", "e"]);
    rerender(<Grid cells={twoLines} more={false} />);
    expect(held(container)).toEqual([]);
  });

  it("SPEC-CORE-002 I7: holds nothing in a grid of one line", () => {
    const oneLine = twoLines.map((c) => ({ ...c, top: 0 }));
    const { container } = render(<Grid cells={oneLine} more />);
    expect(held(container)).toEqual([]);
  });

  it("holds nothing, and does not throw, in an empty grid", () => {
    const { container } = render(<Grid cells={[]} more />);
    expect(held(container)).toEqual([]);
  });

  it("SPEC-CORE-002 I8: re-decides when a cell's ratio changes with the same keys", () => {
    const { container, rerender } = render(<Grid cells={twoLines} more />);
    expect(held(container)).toEqual(["d", "e"]);
    // The new ratio pushes "c" down onto the last line.
    const reflowed = twoLines.map((c) =>
      c.key === "c" ? { ...c, ratio: 2, top: 200 } : c,
    );
    rerender(<Grid cells={reflowed} more />);
    expect(held(container)).toEqual(["c", "d", "e"]);
  });

  it("SPEC-CORE-002 I9: keeps the hold across a re-render that changes no trigger", () => {
    const { container, rerender } = render(<Grid cells={twoLines} more tick={0} />);
    rerender(<Grid cells={twoLines} more tick={1} />);
    expect(held(container)).toEqual(["d", "e"]);
  });

  it("SPEC-CORE-002 I2: moves focus off a cell that becomes held to the nearest painted cell before it", () => {
    const { container, rerender } = render(<Grid cells={twoLines} more={false} />);
    container.querySelector<HTMLElement>('[href="#e"]')!.focus();
    rerender(<Grid cells={twoLines} more />);
    expect(held(container)).toEqual(["d", "e"]);
    expect(document.activeElement).toBe(container.querySelector('[href="#c"]'));
  });

  it("SPEC-CORE-002 I2: skips earlier cells with nothing to focus", () => {
    const cells = twoLines.map((c) => (c.key === "c" ? { ...c, focusable: false } : c));
    const { container, rerender } = render(<Grid cells={cells} more={false} />);
    container.querySelector<HTMLElement>('[href="#d"]')!.focus();
    rerender(<Grid cells={cells} more />);
    expect(document.activeElement).toBe(container.querySelector('[href="#b"]'));
  });
});
