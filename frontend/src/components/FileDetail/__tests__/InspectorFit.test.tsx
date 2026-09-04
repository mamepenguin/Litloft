/**
 * Whether the inspector sits beside the canvas or covers it.
 *
 * This is the container half of the two-axis split the design draws.
 * The viewport decides whether the inspector *starts* open, and a
 * stored choice outranks that. The measured row decides whether it can
 * be *beside* rather than over, and nothing outranks that — it is a
 * fact about the space, not a preference.
 *
 * The case that made it necessary: the shell renders full-width on one
 * route and inside the 2-pane right pane on another, where an inline
 * sidebar and a 280px tree have already taken up to 520px the viewport
 * says nothing about. A viewport rule put a 296px video on screen at
 * 1200px — narrower than the same rule produced at 1120.
 *
 * jsdom does no layout, but it does have `clientWidth` and attributes,
 * which is why this can be asserted at all (`DESIGN.md` §8.5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import { FileDetailShell } from "../../FileDetailShell";
import { inspectorOpenStorageKey } from "@/lib/inspectorOpenStore";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));

let resize: (() => void) | undefined;

beforeEach(() => {
  window.localStorage.clear();
  // An explicit choice, so this file is only ever about placement.
  window.localStorage.setItem(inspectorOpenStorageKey("main"), "true");
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

function renderAtRowWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  return render(
    <FileDetailShell drive="main" title="clip.mp4" inspector={<div />}>
      <div />
    </FileDetailShell>,
  );
}

const fit = () => screen.getByTestId("inspector-fit-host").dataset.inspectorFit;

describe("inspector default, where it cannot sit beside", () => {
  // The other half of the same fix. At every width the 2-pane host was
  // broken at, the viewport default is *open* — so without this the
  // page arrives with the panel over the video instead of beside a
  // narrowed one, and nothing was pressed either way.
  function renderWithNoStoredChoice(width: number) {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440,
    });
    return renderAtRowWidth(width);
  }

  it("stays closed when it would have to cover the canvas", () => {
    renderWithNoStoredChoice(920); // viewport 1440, 2-pane, tree open
    expect(fit()).toBe("overlay");
    expect(screen.queryByTestId("inspector-pane")).toBeNull();
  });

  it("still opens itself where there is room beside", () => {
    renderWithNoStoredChoice(1200);
    expect(fit()).toBe("beside");
    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
  });

  it("lets a stored choice outrank the room", () => {
    // Asking for it is not the same as it fitting. Someone who opened
    // the inspector gets it, covering the canvas, which is what they
    // asked for — the AND is on the derived default only.
    window.localStorage.setItem(inspectorOpenStorageKey("main"), "true");
    renderAtRowWidth(800);
    expect(fit()).toBe("overlay");
    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
  });

  it("keeps a stored close closed where there is room", () => {
    window.localStorage.setItem(inspectorOpenStorageKey("main"), "false");
    renderAtRowWidth(1200);
    expect(fit()).toBe("beside");
    expect(screen.queryByTestId("inspector-pane")).toBeNull();
  });
});

describe("inspector placement", () => {
  it("sits beside the canvas when the row can hold both", () => {
    // 936px = 552 canvas + 384 inspector. At the sum exactly, both fit.
    renderAtRowWidth(936);
    expect(fit()).toBe("beside");
  });

  it("covers it one pixel short of that", () => {
    // The pair is the point: an assertion only on the roomy side passes
    // for any threshold at or below the width it names.
    renderAtRowWidth(935);
    expect(fit()).toBe("overlay");
  });

  it("says nothing at all before the row has been laid out", () => {
    // jsdom reports 0 for every element, and so does a real browser
    // during the first frame and inside a display:none subtree. Reading
    // that as "no room" would collapse the inspector on load and keep
    // it collapsed wherever the shell is mounted but hidden.
    renderAtRowWidth(0);
    expect(fit()).toBeUndefined();
    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
  });

  it("re-decides when the row is resized", () => {
    renderAtRowWidth(935);
    expect(fit()).toBe("overlay");

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
    act(() => resize?.());
    expect(fit()).toBe("beside");
  });

  it("keeps the pane mounted across the change", () => {
    // The pane holds the tab panels, and a transcript's scroll position
    // and its subscription to the playback clock live in there. Deciding
    // the form in CSS from an attribute is what keeps a window drag from
    // costing them.
    renderAtRowWidth(1200);
    const pane = screen.getByTestId("inspector-pane");

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    act(() => resize?.());

    expect(fit()).toBe("overlay");
    expect(screen.getByTestId("inspector-pane")).toBe(pane);
  });

  it("keeps the inspector's full width in either form", () => {
    // Narrowing was tried and rejected: under 320px Japanese wraps at
    // 12–14 characters a line. A responsive inspector is an unreadable
    // one, so it covers the canvas rather than shrinking.
    renderAtRowWidth(800);
    const pane = screen.getByTestId("inspector-pane");
    expect(pane.classList.contains("w-96")).toBe(true);
    expect(pane.classList.contains("inspector-pane")).toBe(true);
  });

  it("covers the widths where the 2-pane host with its tree was broken", () => {
    // The regression this closes, stated as the row widths those
    // viewports actually produce: viewport minus the inline sidebar
    // (240 at >= 1200) minus the tree pane (280).
    const rows = [
      { viewport: 1120, row: 1120 - 0 - 280 },
      { viewport: 1200, row: 1200 - 240 - 280 },
      { viewport: 1280, row: 1280 - 240 - 280 },
      { viewport: 1440, row: 1440 - 240 - 280 },
    ];
    for (const { viewport, row } of rows) {
      const { unmount } = renderAtRowWidth(row);
      expect({ viewport, fit: fit() }).toEqual({ viewport, fit: "overlay" });
      unmount();
      vi.restoreAllMocks();
    }
  });

  it("leaves the same host beside where it always had room", () => {
    // Tree off at the same viewports, and tree on at 1512 — the widths
    // that were never broken must not start overlaying.
    const rows = [1120, 1200 - 240, 1440 - 240, 1512 - 240 - 280];
    for (const row of rows) {
      const { unmount } = renderAtRowWidth(row);
      expect({ row, fit: fit() }).toEqual({ row, fit: "beside" });
      unmount();
      vi.restoreAllMocks();
    }
  });
});
