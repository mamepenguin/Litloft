/**
 * The viewport decides whether the inspector *starts* open; the measured row
 * decides whether it can be *beside* rather than over, because inside the
 * 2-pane right pane the sidebar and tree take width the viewport says
 * nothing about.
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

describe("inspector placement", () => {
  it("sits beside the canvas when the row can hold both", () => {
    // 968px = 552 player + 32 of canvas padding + 384 inspector. At the
    // sum exactly, both fit.
    renderAtRowWidth(968);
    expect(fit()).toBe("beside");
  });

  it("counts the canvas's own padding, which the player is inside", () => {
    // Without the padding term the threshold hands the canvas exactly
    // the player minimum and the 32px comes back out of the player.
    for (const row of [967, 936]) {
      const { unmount } = renderAtRowWidth(row);
      expect({ row, fit: fit() }).toEqual({ row, fit: "overlay" });
      unmount();
      vi.restoreAllMocks();
    }
  });

  it("covers it one pixel short of that", () => {
    renderAtRowWidth(935);
    expect(fit()).toBe("overlay");
  });

  it("says nothing at all before the row has been laid out", () => {
    // A `display:none` subtree reports 0, and so does the first frame.
    // Reading that as "no room" would write an answer nobody measured.
    renderAtRowWidth(0);
    expect(fit()).toBeUndefined();
  });

  it("clears a stale answer rather than leaving it standing", () => {
    renderAtRowWidth(800);
    expect(fit()).toBe("overlay");

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(0);
    act(() => resize?.());
    expect(fit()).toBeUndefined();
  });

  it("re-decides when the row is resized", () => {
    renderAtRowWidth(967);
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
    // Under 320px Japanese wraps at 12–14 characters a line, so it covers
    // the canvas rather than shrinking.
    renderAtRowWidth(800);
    const pane = screen.getByTestId("inspector-pane");
    expect(pane.classList.contains("w-96")).toBe(true);
    expect(pane.classList.contains("inspector-pane")).toBe(true);
  });

  it("covers the widths where the 2-pane host with its tree was broken", () => {
    // The row widths those viewports produce: viewport minus the inline
    // sidebar (240 at >= 1200) minus the tree pane (280).
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
    // Tree off, and tree on at 1512 — widths where the player clears
    // its minimum with the inspector beside it must not start
    // overlaying. 1200 tree-off is absent on purpose: its 960px row
    // leaves the player 544, so it belongs on the overlay side and the
    // padding term is what put it there.
    const rows = [1120, 1440 - 240, 1512 - 240 - 280];
    for (const row of rows) {
      const { unmount } = renderAtRowWidth(row);
      expect({ row, fit: fit() }).toEqual({ row, fit: "beside" });
      unmount();
      vi.restoreAllMocks();
    }
  });
});
