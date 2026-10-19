import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useNeighbourOrientation } from "../useNeighbourOrientation";

/** Every `new Image()` the hook makes, so the count can be asserted. */
function captureImages() {
  const made: Array<{ src: string; fire: (w: number, h: number) => void }> = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    #src = "";
    set src(value: string) {
      this.#src = value;
      made.push({
        src: value,
        fire: (w, h) => {
          this.naturalWidth = w;
          this.naturalHeight = h;
          this.onload?.();
        },
      });
    }
    get src() {
      return this.#src;
    }
  }
  vi.stubGlobal("Image", FakeImage);
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading one neighbour's shape", () => {
  it("fetches nothing until there is something to fetch", () => {
    const made = captureImages();
    const { result } = renderHook(() => useNeighbourOrientation(null));
    expect(made).toHaveLength(0);
    expect(result.current).toBe("unknown");
  });

  it("fetches exactly one image, and only the one it was given", async () => {
    // The whole point of the cap: a reader flipping through a 190-page
    // book must not pull the book down behind them.
    const made = captureImages();
    const { result } = renderHook(() =>
      useNeighbourOrientation("/api/entry/2"),
    );

    expect(made.map((m) => m.src)).toEqual(["/api/entry/2"]);

    act(() => made[0].fire(800, 1200));
    await waitFor(() => expect(result.current).toBe("portrait"));
    expect(made).toHaveLength(1);
  });

  it("calls a wider image landscape and a square one tall", async () => {
    // The tie goes to `portrait`, because a square page pairs cleanly
    // and splitting one in half is the odder answer.
    const made = captureImages();
    const { result, rerender } = renderHook(
      ({ url }) => useNeighbourOrientation(url),
      { initialProps: { url: "/a" } },
    );
    act(() => made[0].fire(1600, 900));
    await waitFor(() => expect(result.current).toBe("landscape"));

    rerender({ url: "/b" });
    act(() => made[1].fire(500, 500));
    await waitFor(() => expect(result.current).toBe("portrait"));
  });

  it("says unknown for a page that will not load", async () => {
    // `unknown` keeps it out of a pair rather than pairing it blind.
    const made = captureImages();
    const { result } = renderHook(() => useNeighbourOrientation("/gone"));
    expect(made).toHaveLength(1);
    act(() => {
      (globalThis as unknown as { Image: unknown }) && made[0];
    });
    expect(result.current).toBe("unknown");
  });

  it("goes back to unknown the moment the url changes", async () => {
    // Not "keeps the last answer": the last answer belongs to a
    // different page, and holding it would pair the new one on the old
    // one's shape.
    const made = captureImages();
    const { result, rerender } = renderHook(
      ({ url }) => useNeighbourOrientation(url),
      { initialProps: { url: "/a" } },
    );
    act(() => made[0].fire(800, 1200));
    await waitFor(() => expect(result.current).toBe("portrait"));

    rerender({ url: "/b" });
    expect(result.current).toBe("unknown");
  });
});
