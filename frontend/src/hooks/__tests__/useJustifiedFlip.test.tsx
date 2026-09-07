import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useRef } from "react";

import { useJustifiedFlip } from "../useJustifiedFlip";

/**
 * What is pinned here is the **branching**, not the geometry.
 *
 * jsdom does no layout, so every box it reports is zero and no assertion
 * made here is evidence about what the animation looks like: whether the
 * inverted cell lands on its old rect, whether the scale is uniform,
 * whether a horizontal scrollbar opens while it plays. Those were
 * measured in Chrome against the 995-photograph folder and the numbers
 * are in the PR body; nothing in this file would notice if they changed.
 *
 * The rects below are a script, not a layout. They let the arithmetic
 * and the four ways out of it be exercised — which is what breaks when
 * someone edits the hook.
 */

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GRID = "__grid__";

/** The scripted layout, read by the stubbed `getBoundingClientRect`. */
let layout = new Map<string, Box>();

function box(b: Box): DOMRect {
  return {
    x: b.left,
    y: b.top,
    left: b.left,
    top: b.top,
    width: b.width,
    height: b.height,
    right: b.left + b.width,
    bottom: b.top + b.height,
    toJSON: () => b,
  } as DOMRect;
}

/**
 * Put back, not left in place: this patches a prototype every other suite
 * shares, and the shuffled CI job runs whatever file comes next in the
 * same environment.
 */
const realRect = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "getBoundingClientRect",
);

beforeAll(() => {
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: Element) {
      const key = this.classList.contains("justified-grid")
        ? GRID
        : this.getAttribute("data-flip-key");
      return box(layout.get(key ?? "") ?? { left: 0, top: 0, width: 0, height: 0 });
    },
  });
});

afterAll(() => {
  if (realRect) {
    Object.defineProperty(Element.prototype, "getBoundingClientRect", realRect);
  }
});

afterEach(() => {
  layout = new Map();
  vi.unstubAllGlobals();
});

function Grid({ keys }: { keys: string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useJustifiedFlip(ref);
  return (
    <div className="justified-grid" ref={ref}>
      {keys.map((key) => (
        <div key={key} className="justified-grid-cell" data-flip-key={key} />
      ))}
    </div>
  );
}

/**
 * Every inline `transform` / `opacity` the hook writes, captured as it is
 * written. The hook sets the inverted value and clears it in one
 * synchronous pass, so the element's own attribute afterwards says
 * nothing about what went through it — the same reason the browser
 * measurement had to watch mutations rather than read the DOM.
 */
function watchMotion(container: HTMLElement): string[] {
  const writes: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const value = (record.target as HTMLElement).getAttribute("style");
      for (const seen of [record.oldValue, value]) {
        if (seen && /transform|opacity/.test(seen)) writes.push(seen);
      }
    }
  });
  observer.observe(container, {
    attributes: true,
    subtree: true,
    attributeFilter: ["style"],
    attributeOldValue: true,
  });
  return writes;
}

/** `translate(dx, dy) scale(sx, sy)` out of one captured style string. */
function invert(write: string) {
  const m = /transform: translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+), ([\d.]+)\)/.exec(
    write,
  );
  return m
    ? { dx: Number(m[1]), dy: Number(m[2]), sx: Number(m[3]), sy: Number(m[4]) }
    : null;
}

function reducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/**
 * One line of two cells, and the second page that completes it. `a` is
 * where a line starts so it never moves; `b` both widens and slides
 * right, which is the pair the measurement found on every append.
 */
function firstPage() {
  layout.set(GRID, { left: 0, top: 0, width: 1000, height: 200 });
  layout.set("a", { left: 0, top: 0, width: 300, height: 200 });
  layout.set("b", { left: 308, top: 0, width: 200, height: 200 });
}

function secondPage() {
  layout.set(GRID, { left: 0, top: 0, width: 1000, height: 400 });
  layout.set("a", { left: 0, top: 0, width: 450, height: 300 });
  layout.set("b", { left: 458, top: 0, width: 300, height: 300 });
  layout.set("c", { left: 0, top: 308, width: 400, height: 200 });
}

describe("useJustifiedFlip", () => {
  it("writes nothing on the first commit, having no rect to come from", () => {
    firstPage();
    const { container } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);
    expect(writes).toEqual([]);
    expect(container.querySelectorAll("[data-flip]")).toHaveLength(0);
  });

  it("inverts the cells that changed and fades in the ones that are new", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);

    secondPage();
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    const inverts = writes.map(invert).filter((v) => v !== null);
    // `a` grew 300→450 in place; `b` grew 200→300 and moved 308→458.
    // Declared, not read back off the elements: an expectation built from
    // what the hook produced would agree with whatever it produced.
    expect(inverts).toEqual(
      expect.arrayContaining([
        { dx: 0, dy: 0, sx: 300 / 450, sy: 200 / 300 },
        { dx: 308 - 458, dy: 0, sx: 200 / 300, sy: 200 / 300 },
      ]),
    );
    expect(inverts).toHaveLength(2);

    // The new cell has no previous rect, so it is faded rather than
    // moved: one `opacity: 0` and no third transform.
    expect(writes.filter((w) => /opacity: 0/.test(w))).toHaveLength(1);
    expect(writes.filter((w) => /opacity: 0/.test(w))[0]).not.toContain("transform");
  });

  it("writes nothing at all under prefers-reduced-motion", async () => {
    reducedMotion(true);
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);

    secondPage();
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    expect(writes).toEqual([]);
    expect(container.querySelectorAll("[data-flip]")).toHaveLength(0);
  });

  it("is the same change that does animate when the query does not match", async () => {
    // The control for the test above: without it, a passing "nothing was
    // written" proves only that this fixture had nothing to write.
    reducedMotion(false);
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);

    secondPage();
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    expect(writes.filter((w) => w.includes("translate"))).toHaveLength(2);
  });

  it("does not follow a change in the grid's own width", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);

    // Everything moves, but because the container was resized — a drag,
    // not a discrete state change.
    secondPage();
    layout.set(GRID, { left: 0, top: 0, width: 1400, height: 400 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    expect(writes).toEqual([]);
  });

  it("does not treat a different listing as a change to this one", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);

    // No key in common: a folder change, where fading every cell in would
    // be a whole-grid animation nobody asked for.
    layout.set(GRID, { left: 0, top: 0, width: 1000, height: 200 });
    layout.set("x", { left: 0, top: 0, width: 500, height: 200 });
    layout.set("y", { left: 508, top: 0, width: 400, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["x", "y"]} />);
    });

    expect(writes).toEqual([]);
  });

  it("leaves a cell that did not move alone", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);

    // `a` is unchanged; only `b` widens.
    layout.set(GRID, { left: 0, top: 0, width: 1000, height: 200 });
    layout.set("b", { left: 308, top: 0, width: 400, height: 200 });
    layout.set("c", { left: 0, top: 208, width: 300, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    const inverts = writes.map(invert).filter((v) => v !== null);
    expect(inverts).toEqual([{ dx: 0, dy: 0, sx: 200 / 400, sy: 1 }]);
    expect(container.querySelector('[data-flip-key="a"]')!.getAttribute("style")).toBe(
      null,
    );
  });

  it("takes its own marks back off the cells once the play is over", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);

    secondPage();
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });
    expect(container.querySelectorAll("[data-flip]").length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(container.querySelectorAll("[data-flip]")).toHaveLength(0);
    });
    for (const cell of container.querySelectorAll<HTMLElement>(".justified-grid-cell")) {
      expect(cell.style.transform).toBe("");
      expect(cell.style.opacity).toBe("");
    }
  });

  it("does not animate a cell nobody can see", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);

    // `b` moves the same way it does in the append above, but from far
    // below the fold. A re-sort moves every cell in a folder of 995 and
    // the work has to stay proportional to the screen.
    layout.set(GRID, { left: 0, top: 0, width: 1000, height: 400 });
    layout.set("a", { left: 0, top: 0, width: 450, height: 300 });
    layout.set("b", { left: 458, top: 90_000, width: 300, height: 300 });
    layout.set("c", { left: 0, top: 308, width: 400, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    const inverts = writes.map(invert).filter((v) => v !== null);
    expect(inverts).toEqual([{ dx: 0, dy: 0, sx: 300 / 450, sy: 200 / 300 }]);
  });

  it("re-measures only when the cell set changes", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const writes = watchMotion(container);

    // Same keys in the same order: a re-render for something else. The
    // rects say everything moved, and nothing should be animated —
    // reading them at all would force a layout on every keystroke.
    layout.set("a", { left: 0, top: 0, width: 900, height: 600 });
    layout.set("b", { left: 908, top: 0, width: 800, height: 600 });
    await act(async () => {
      rerender(<Grid keys={["a", "b"]} />);
    });

    expect(writes).toEqual([]);
  });
});
