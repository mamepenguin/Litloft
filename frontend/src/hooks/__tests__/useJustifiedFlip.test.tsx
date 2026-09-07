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
 * Put back, not left in place: the patch is on a prototype the whole
 * environment shares, and a file should leave the environment as it
 * found it.
 *
 * Not because it would otherwise reach another file. Vitest builds a
 * fresh jsdom per test file, and `--sequence.shuffle` reorders files
 * without making them share a window, so today nothing downstream can
 * see this. The restore does not depend on that staying true.
 */
const realRect = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "getBoundingClientRect",
);
if (!realRect) throw new Error("jsdom no longer owns getBoundingClientRect");

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
  Object.defineProperty(Element.prototype, "getBoundingClientRect", realRect);
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
 * Everything the hook writes to a cell, captured as it is written: the
 * inline `transform` / `opacity`, **and** the `data-flip` state the two
 * CSS rules read. Both, because either one alone is a hole.
 *
 * The hook sets a value and clears it in one synchronous pass, so the
 * element's own attributes afterwards say nothing about what went
 * through them — the same reason the browser measurement had to watch
 * mutations rather than read the DOM. And `style` alone cannot see the
 * invert→play handoff, which is the entire mechanism: with the play
 * state never entered, the CSS rule in force is `transition: none` and
 * the transform is written and cleared in one frame, while every style
 * write this file used to assert on still happens.
 */
interface Motion {
  /** Inline `style` values carrying a transform or an opacity, in order. */
  styles: string[];
  /** Keys of every cell that was ever marked, in first-touch order. */
  marked: string[];
  /** The values `data-flip` took on one cell, in order. */
  flip(key: string): (string | null)[];
}

function watchMotion(container: HTMLElement): Motion {
  const styles: string[] = [];
  // `oldValue` per element, in observation order. The value a mutation
  // *set* is the next one's `oldValue`, and for the last it is what the
  // attribute reads now — so the sequence is recoverable without
  // re-entering the observer between writes.
  const priors = new Map<HTMLElement, (string | null)[]>();

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const cell = record.target as HTMLElement;
      if (record.attributeName === "data-flip") {
        const seen = priors.get(cell) ?? [];
        seen.push(record.oldValue);
        priors.set(cell, seen);
        continue;
      }
      const value = cell.getAttribute("style");
      for (const seen of [record.oldValue, value]) {
        if (seen && /transform|opacity/.test(seen)) styles.push(seen);
      }
    }
  });
  observer.observe(container, {
    attributes: true,
    subtree: true,
    attributeFilter: ["style", "data-flip"],
    attributeOldValue: true,
  });

  const keyOf = (cell: HTMLElement) => cell.getAttribute("data-flip-key") ?? "";
  return {
    styles,
    get marked() {
      return [...priors.keys()].map(keyOf);
    },
    flip(key) {
      const cell = container.querySelector<HTMLElement>(`[data-flip-key="${key}"]`);
      if (!cell) return [];
      const seen = priors.get(cell);
      if (!seen) return [];
      return [...seen.slice(1), cell.getAttribute("data-flip")];
    },
  };
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
    const motion = watchMotion(container);
    expect(motion.styles).toEqual([]);
    expect(motion.marked).toEqual([]);
    expect(container.querySelectorAll("[data-flip]")).toHaveLength(0);
  });

  it("inverts the cells that changed and fades in the ones that are new", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    secondPage();
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    const inverts = motion.styles.map(invert).filter((v) => v !== null);
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
    expect(motion.styles.filter((w) => /opacity: 0/.test(w))).toHaveLength(1);
    expect(motion.styles.filter((w) => /opacity: 0/.test(w))[0]).not.toContain("transform");

    // The handoff, which is what makes any of it animate: `invert` is
    // `transition: none` and `play` is the 200ms. A cell that never
    // reaches `play` has its transform written and cleared inside one
    // frame and snaps, with every style assertion above still passing.
    // All three cells go through it — the two that move and the one
    // that fades.
    expect(motion.marked).toEqual(["a", "b", "c"]);
    for (const key of ["a", "b", "c"]) {
      expect(motion.flip(key), `data-flip on ${key}`).toEqual(["invert", "play"]);
    }
  });

  it("writes nothing at all under prefers-reduced-motion", async () => {
    reducedMotion(true);
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    secondPage();
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    expect(motion.styles).toEqual([]);
    expect(motion.marked).toEqual([]);
    expect(container.querySelectorAll("[data-flip]")).toHaveLength(0);
  });

  it("is the same change that does animate when the query does not match", async () => {
    // The control for the test above: without it, a passing "nothing was
    // written" proves only that this fixture had nothing to write.
    reducedMotion(false);
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    secondPage();
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    expect(motion.styles.filter((w) => w.includes("translate"))).toHaveLength(2);
  });

  it("does not follow a change in the grid's own width", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    // Everything moves, but because the container was resized — a drag,
    // not a discrete state change.
    secondPage();
    layout.set(GRID, { left: 0, top: 0, width: 1400, height: 400 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    expect(motion.styles).toEqual([]);
    expect(motion.marked).toEqual([]);
  });

  it("does not treat a different listing as a change to this one", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    // No key in common: a folder change, where fading every cell in would
    // be a whole-grid animation nobody asked for.
    layout.set(GRID, { left: 0, top: 0, width: 1000, height: 200 });
    layout.set("x", { left: 0, top: 0, width: 500, height: 200 });
    layout.set("y", { left: 508, top: 0, width: 400, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["x", "y"]} />);
    });

    expect(motion.styles).toEqual([]);
    expect(motion.marked).toEqual([]);
  });

  it("leaves a cell that did not move alone", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    // `a` is unchanged; only `b` widens.
    layout.set(GRID, { left: 0, top: 0, width: 1000, height: 200 });
    layout.set("b", { left: 308, top: 0, width: 400, height: 200 });
    layout.set("c", { left: 0, top: 208, width: 300, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    const inverts = motion.styles.map(invert).filter((v) => v !== null);
    expect(inverts).toEqual([{ dx: 0, dy: 0, sx: 200 / 400, sy: 1 }]);
    expect(container.querySelector('[data-flip-key="a"]')!.getAttribute("style")).toBe(
      null,
    );
  });

  it("takes its own marks back off the cells once the play is over", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    secondPage();
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });
    // `toBe`, not a lower bound: `secondPage()` moves `a` and `b` and
    // adds `c`, so three is the count every time, and a scan that stops
    // seeing one of them is exactly what this is here to catch.
    expect(container.querySelectorAll("[data-flip]")).toHaveLength(3);

    await waitFor(() => {
      expect(container.querySelectorAll("[data-flip]")).toHaveLength(0);
    });
    expect(motion.flip("a")).toEqual(["invert", "play", null]);
    for (const cell of container.querySelectorAll<HTMLElement>(".justified-grid-cell")) {
      expect(cell.style.transform).toBe("");
      expect(cell.style.opacity).toBe("");
    }
  });

  it("does not animate a cell nobody can see", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

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

    const inverts = motion.styles.map(invert).filter((v) => v !== null);
    expect(inverts).toEqual([{ dx: 0, dy: 0, sx: 300 / 450, sy: 200 / 300 }]);
    // `c` is new and on screen, so it fades; `b` is off the bottom and
    // is not touched at all.
    expect(motion.marked).toEqual(["a", "c"]);
  });

  it("leaves the first change after a width change to snap as well", async () => {
    // Recorded behaviour, not an aspiration. The stored width is only
    // rewritten when the cell set changes, and a window resize changes
    // no cell set — in the packed branch it re-renders nothing at all.
    // So the width the next append is compared against is the pre-resize
    // one, that append snaps, and the one after it plays. The user guide
    // says so; if this test starts failing because someone refreshed the
    // measurement on a resize, that page is what to update.
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    // The resize. Same keys, so the effect returns before measuring.
    layout.set(GRID, { left: 0, top: 0, width: 1400, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["a", "b"]} />);
    });

    // The first append after it, at the new width.
    layout.set(GRID, { left: 0, top: 0, width: 1400, height: 400 });
    layout.set("a", { left: 0, top: 0, width: 600, height: 400 });
    layout.set("b", { left: 608, top: 0, width: 400, height: 400 });
    layout.set("c", { left: 0, top: 408, width: 500, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });
    expect(motion.marked).toEqual([]);

    // And the one after that, which has a baseline at the new width.
    layout.set(GRID, { left: 0, top: 0, width: 1400, height: 600 });
    layout.set("a", { left: 0, top: 0, width: 700, height: 466 });
    layout.set("d", { left: 0, top: 608, width: 300, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c", "d"]} />);
    });
    expect(motion.marked).toEqual(["a", "d"]);
  });

  it("re-measures only when the cell set changes", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    // Same keys in the same order: a re-render for something else. The
    // rects say everything moved, and nothing should be animated —
    // reading them at all would force a layout on every keystroke.
    layout.set("a", { left: 0, top: 0, width: 900, height: 600 });
    layout.set("b", { left: 908, top: 0, width: 800, height: 600 });
    await act(async () => {
      rerender(<Grid keys={["a", "b"]} />);
    });

    expect(motion.styles).toEqual([]);
    expect(motion.marked).toEqual([]);
  });
});
