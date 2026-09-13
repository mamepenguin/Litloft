import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useRef } from "react";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { useJustifiedFlip, FLIP_DURATION_MS } from "../useJustifiedFlip";

const CSS_PLAY_MS = (() => {
  const sheet = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"),
    "utf-8",
  );
  const block = /\.justified-grid-cell\[data-flip="play"\]\s*\{([^}]*)\}/.exec(sheet);
  if (!block) throw new Error("no play rule in globals.css");
  const durations = [...block[1].matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
  if (durations.length === 0) throw new Error("no duration in the play rule");
  return Math.max(...durations);
})();

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
 * Captured as written: the hook sets a value and clears it in one
 * synchronous pass, so the element's attributes afterwards say nothing
 * about what went through them.
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

/**
 * Asked of the cell, not of a log of writes: `invert` and `play` land in
 * one microtask, so the same strings appear in the log whether or not the
 * transform was released.
 */
function armed(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-flip]")].map((cell) => ({
    key: cell.getAttribute("data-flip-key"),
    flip: cell.getAttribute("data-flip"),
    transform: cell.style.transform,
    opacity: cell.style.opacity,
  }));
}

/** The same question after the marks come off: nothing of ours is left. */
function settled(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(".justified-grid-cell")].map(
    (cell) => ({
      key: cell.getAttribute("data-flip-key"),
      flip: cell.getAttribute("data-flip"),
      transform: cell.style.transform,
      opacity: cell.style.opacity,
    }),
  );
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
    expect(armed(container)).toEqual([]);
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

    expect(armed(container)).toEqual([
      { key: "a", flip: "play", transform: "", opacity: "" },
      { key: "b", flip: "play", transform: "", opacity: "" },
      { key: "c", flip: "play", transform: "", opacity: "" },
    ]);
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
    expect(armed(container)).toEqual([]);
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
    expect(armed(container)).toEqual([]);
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
    expect(armed(container)).toEqual([]);
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
    expect(armed(container)).toEqual([
      { key: "a", flip: "play", transform: "", opacity: "" },
      { key: "b", flip: "play", transform: "", opacity: "" },
      { key: "c", flip: "play", transform: "", opacity: "" },
    ]);

    await waitFor(() => {
      expect(container.querySelectorAll("[data-flip]")).toHaveLength(0);
    });
    expect(motion.flip("a")).toEqual(["invert", "play", null]);
    expect(settled(container)).toEqual([
      { key: "a", flip: null, transform: "", opacity: "" },
      { key: "b", flip: null, transform: "", opacity: "" },
      { key: "c", flip: null, transform: "", opacity: "" },
    ]);
  });

  it("keeps the marks on for at least as long as the stylesheet plays", async () => {
    // `settle` removes `data-flip`, which cancels a play still running, so
    // the delay has to outlast the CSS duration.
    expect(CSS_PLAY_MS).toBe(FLIP_DURATION_MS);
    vi.useFakeTimers();
    try {
      firstPage();
      const { container, rerender } = render(<Grid keys={["a", "b"]} />);
      secondPage();
      await act(async () => {
        rerender(<Grid keys={["a", "b", "c"]} />);
      });
      expect(armed(container)).toHaveLength(3);

      await act(async () => {
        vi.advanceTimersByTime(CSS_PLAY_MS);
      });
      expect(
        armed(container),
        `marks came off before the ${CSS_PLAY_MS}ms play finished`,
      ).toHaveLength(3);

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(armed(container)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not animate a cell nobody can see", async () => {
    firstPage();
    const { container, rerender } = render(<Grid keys={["a", "b"]} />);
    const motion = watchMotion(container);

    // `b` moves as in the append above, but from far below the fold; the
    // work has to stay proportional to the screen.
    layout.set(GRID, { left: 0, top: 0, width: 1000, height: 400 });
    layout.set("a", { left: 0, top: 0, width: 450, height: 300 });
    layout.set("b", { left: 458, top: 90_000, width: 300, height: 300 });
    layout.set("c", { left: 0, top: 308, width: 400, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c"]} />);
    });

    const inverts = motion.styles.map(invert).filter((v) => v !== null);
    expect(inverts).toEqual([{ dx: 0, dy: 0, sx: 300 / 450, sy: 200 / 300 }]);
    expect(armed(container)).toEqual([
      { key: "a", flip: "play", transform: "", opacity: "" },
      { key: "c", flip: "play", transform: "", opacity: "" },
    ]);
  });

  it("leaves the first change after a width change to snap as well", async () => {
    // Recorded behaviour, not an aspiration: the stored width is only
    // rewritten when the cell set changes. The user guide documents it, so
    // changing this behaviour means updating that page.
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
    expect(armed(container)).toEqual([]);

    // And the one after that, which has a baseline at the new width.
    layout.set(GRID, { left: 0, top: 0, width: 1400, height: 600 });
    layout.set("a", { left: 0, top: 0, width: 700, height: 466 });
    layout.set("d", { left: 0, top: 608, width: 300, height: 200 });
    await act(async () => {
      rerender(<Grid keys={["a", "b", "c", "d"]} />);
    });
    expect(armed(container).map((cell) => cell.key)).toEqual(["a", "d"]);
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
    expect(armed(container)).toEqual([]);
  });
});
