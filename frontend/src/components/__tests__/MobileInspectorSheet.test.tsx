import { describe, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  createEvent,
  waitFor,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useDialogPortalTarget } from "@/components/DialogPortal";
import {
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  sheetDrawerHeightPx,
  sheetTopAtSnap,
} from "@/lib/sheetSnap";
import {
  MobileInspectorSheet,
  SHEET_PEEK_HEIGHT,
  SHEET_STATE_FULL,
  SHEET_STATE_HALF,
  SHEET_STATE_PEEK,
  isSheetExpanded,
  useCollapseSheet,
  sheetSnapPoints,
  sheetStateForSnap,
  type SheetState,
} from "@/components/MobileInspectorSheet";

function renderSheet(
  state: SheetState = SHEET_STATE_PEEK,
  onStateChange = vi.fn(),
  halfSnap?: number,
) {
  const utils = render(
    <MobileInspectorSheet
      state={state}
      onStateChange={onStateChange}
      halfSnap={halfSnap}
      peek={<div data-testid="peek-content">title and actions</div>}
    >
      <div data-testid="inspector-content">tags-content</div>
    </MobileInspectorSheet>,
  );
  return { ...utils, onStateChange };
}

function stubScrollGeometry(
  el: HTMLElement,
  { scrollTop, maxScroll }: { scrollTop: number; maxScroll: number },
) {
  Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(el, "scrollHeight", {
    value: 400 + maxScroll,
    configurable: true,
  });
  Object.defineProperty(el, "scrollTop", {
    value: scrollTop,
    writable: true,
    configurable: true,
  });
}

/**
 * `changedTouches` is not read by the hook: it is read by the document
 * listener `react-remove-scroll` installs under every Radix dialog, which
 * indexes it without checking and throws on an event that has none.
 */
const touch = (clientY: number) => {
  const finger = { identifier: 7, clientY, clientX: 0 };
  return { touches: [finger], changedTouches: [finger] };
};

const lift = (clientY: number) => ({
  touches: [],
  changedTouches: [{ identifier: 7, clientY, clientX: 0 }],
});

describe("MobileInspectorSheet", () => {
  it("shows the peek row at rest", () => {
    renderSheet();
    expect(screen.getByTestId("peek-content")).toBeInTheDocument();
  });

  it("gives the peek row the design's height above the home indicator", () => {
    // Through the constant: jsdom rewrites an `env()` it re-serialises, and
    // drops the padding that is nothing but one.
    expect(SHEET_PEEK_HEIGHT).toBe(
      `calc(${SHEET_PEEK_PX}px + env(safe-area-inset-bottom, 0px))`,
    );
    renderSheet();
    const style = screen.getByTestId("mobile-inspector-peek").getAttribute("style") ?? "";
    expect(style).toMatch(/height:\s*calc\(56px \+ env\(/);
  });

  it("mounts no dialog at rest, so the page is not hidden from a reader", () => {
    const page = document.createElement("div");
    page.setAttribute("data-testid", "the-page");
    document.body.appendChild(page);
    try {
      renderSheet(SHEET_STATE_PEEK);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(page.getAttribute("aria-hidden")).toBeNull();
    } finally {
      page.remove();
    }
  });

  it("does not draw the rest of the inspector at rest", () => {
    renderSheet(SHEET_STATE_PEEK);
    expect(screen.queryByTestId("inspector-content")).toBeNull();
  });

  for (const state of [SHEET_STATE_HALF, SHEET_STATE_FULL]) {
    it(`draws no resting strip at ${state}, so the actions are not also below`, async () => {
      renderSheet(state);
      await screen.findByTestId("mobile-inspector-sheet");

      expect(screen.queryByTestId("mobile-inspector-peek")).toBeNull();
      expect(screen.queryByTestId("peek-content")).toBeNull();
    });
  }

  it("draws it at rest and nowhere else, which is the whole of that rule", () => {
    renderSheet(SHEET_STATE_PEEK);
    expect(screen.getByTestId("mobile-inspector-peek")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull();
  });

  for (const state of [SHEET_STATE_HALF, SHEET_STATE_FULL]) {
    it(`leaves the page exposed, operable and undimmed at ${state}`, async () => {
      const page = document.createElement("button");
      document.body.appendChild(page);
      try {
        const { onStateChange } = renderSheet(state);
        await screen.findByTestId("mobile-inspector-sheet");

        expect(page.closest("[aria-hidden='true']")).toBeNull();
        expect(document.body.style.pointerEvents).not.toBe("none");
        expect(document.querySelector("[data-vaul-overlay]")).toBeNull();

        act(() => page.focus());
        expect(document.activeElement).toBe(page);

        fireEvent.pointerDown(page);
        fireEvent.pointerUp(page);
        fireEvent.click(page);
        await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
        expect(onStateChange).not.toHaveBeenCalled();
      } finally {
        page.remove();
      }
    });
  }

  it("collapses to peek on a dismiss gesture instead of closing", async () => {
    const { onStateChange } = renderSheet(SHEET_STATE_HALF);
    await screen.findByTestId("mobile-inspector-sheet");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  it("does not reopen when vaul settles its snap after closing from full", async () => {
    // vaul resets its active snap point 500ms after it closes, which from
    // `full` is a change it reports.
    const { onStateChange } = renderSheet(SHEET_STATE_FULL);
    await screen.findByTestId("mobile-inspector-sheet");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 700)));

    expect(onStateChange.mock.calls).toEqual([[SHEET_STATE_PEEK]]);
  });

  describe("opened again", () => {
    const host: { set: (next: SheetState) => void } = { set: () => undefined };
    const calls: SheetState[] = [];

    function Host() {
      const [state, setState] = useState<SheetState>(SHEET_STATE_HALF);
      useEffect(() => {
        host.set = setState;
      }, []);
      return (
        <MobileInspectorSheet
          state={state}
          onStateChange={(next) => {
            calls.push(next);
            setState(next);
          }}
          peek={<div data-testid="peek-content" />}
        >
          <div />
        </MobileInspectorSheet>
      );
    }

    const wait = (ms: number) =>
      act(() => new Promise((resolve) => setTimeout(resolve, ms)));

    it("closes again after it was closed once", async () => {
      calls.length = 0;
      render(<Host />);
      await screen.findByTestId("mobile-inspector-sheet");
      fireEvent.keyDown(document, { key: "Escape" });
      await screen.findByTestId("peek-content");

      act(() => host.set(SHEET_STATE_HALF));
      await screen.findByTestId("mobile-inspector-sheet");
      fireEvent.keyDown(document, { key: "Escape" });
      await screen.findByTestId("peek-content");

      expect(calls).toEqual([SHEET_STATE_PEEK, SHEET_STATE_PEEK]);
    });

    it("stays closed after a close from full", async () => {
      calls.length = 0;
      render(<Host />);
      await screen.findByTestId("mobile-inspector-sheet");
      act(() => host.set(SHEET_STATE_FULL));
      fireEvent.keyDown(document, { key: "Escape" });
      await screen.findByTestId("peek-content");
      await wait(900);

      expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull();
      expect(calls).toEqual([SHEET_STATE_PEEK]);
    });

    it("is not closed by a close that was cut short before it opened", async () => {
      calls.length = 0;
      render(<Host />);
      await screen.findByTestId("mobile-inspector-sheet");
      fireEvent.keyDown(document, { key: "Escape" });
      await wait(50);
      act(() => host.set(SHEET_STATE_PEEK));
      await wait(20);
      act(() => host.set(SHEET_STATE_HALF));
      await wait(600);

      expect(screen.getByTestId("mobile-inspector-sheet")).toBeInTheDocument();
      expect(calls).toEqual([]);
    });
  });

  it("sits above the page's chrome and below the sidebar's backdrop", async () => {
    renderSheet(SHEET_STATE_FULL);
    const sheet = await screen.findByTestId("mobile-inspector-sheet");
    expect([...sheet.classList].filter((token) => /^z-/.test(token))).toEqual([
      "z-[25]",
    ]);
  });

  it("marks its scroller as the one that scrolls the inspector's panels", async () => {
    renderSheet(SHEET_STATE_HALF);
    const panel = await screen.findByTestId("inspector-content");
    expect(panel.closest("[data-inspector-scroller]")).toBe(
      screen.getByTestId("mobile-inspector-content"),
    );
  });

  it("sends dialogs opened from inside it to the page, out of its transform", async () => {
    function DialogFromInsideTheSheet() {
      const target = useDialogPortalTarget();
      if (!target) return null;
      return createPortal(
        <div role="dialog" aria-label="launched from the sheet">
          <button>confirm</button>
        </div>,
        target,
      );
    }

    render(
      <MobileInspectorSheet
        state={SHEET_STATE_FULL}
        onStateChange={() => undefined}
        peek={<div />}
      >
        <DialogFromInsideTheSheet />
      </MobileInspectorSheet>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "launched from the sheet",
    });
    expect(dialog.closest("[aria-hidden='true']")).toBeNull();
    expect(dialog.parentElement).toBe(document.body);
    expect(
      dialog.closest("[data-testid='mobile-inspector-sheet']"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "confirm" })).toBeInTheDocument();
  });

  it("falls back to document.body outside the sheet", () => {
    function Probe() {
      const target = useDialogPortalTarget();
      return (
        <span data-testid="target">
          {target === document.body ? "body" : "other"}
        </span>
      );
    }
    render(<Probe />);
    expect(screen.getByTestId("target")).toHaveTextContent("body");
  });
});

function expanded(state: SheetState, halfSnap?: number) {
  // vaul portals to `document.body`, and two drawers there make every
  // query ambiguous.
  cleanup();
  render(
    <MobileInspectorSheet
      state={state}
      onStateChange={vi.fn()}
      halfSnap={halfSnap}
      peek={<div />}
    >
      <div />
    </MobileInspectorSheet>,
  );
  return { drawer: screen.getByTestId("mobile-inspector-sheet") };
}

describe("collapsing the sheet from inside the page", () => {
  it("does nothing where there is no sheet", () => {
    function Probe() {
      const collapse = useCollapseSheet();
      return <button onClick={collapse}>collapse</button>;
    }
    render(<Probe />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "collapse" })),
    ).not.toThrow();
  });
});

describe("isSheetExpanded", () => {
  it("calls only the resting state unexpanded", () => {
    expect(isSheetExpanded(SHEET_STATE_PEEK)).toBe(false);
    expect(isSheetExpanded(SHEET_STATE_HALF)).toBe(true);
    expect(isSheetExpanded(SHEET_STATE_FULL)).toBe(true);
  });
});

describe("the half state and the snap it resolves to", () => {
  /** A player-derived value: not 0.5, not 0.9, and not a round number. */
  const DERIVED = 0.627736;

  it("hands vaul the derived snap in place of the fixed one", () => {
    const { drawer } = expanded(SHEET_STATE_HALF, DERIVED);
    expect(
      Number.parseFloat(drawer.style.getPropertyValue("--snap-point-height")),
    ).toBeCloseTo(window.innerHeight * (1 - DERIVED), 5);
  });

  it("leaves full alone when half moves", () => {
    const { drawer } = expanded(SHEET_STATE_FULL, DERIVED);
    expect(
      Number.parseFloat(drawer.style.getPropertyValue("--snap-point-height")),
    ).toBeCloseTo(window.innerHeight * (1 - SHEET_SNAP_FULL), 5);
  });

  it("falls back to the fixed fraction when nothing was measured", () => {
    const { drawer } = expanded(SHEET_STATE_HALF);
    expect(
      Number.parseFloat(drawer.style.getPropertyValue("--snap-point-height")),
    ).toBeCloseTo(window.innerHeight * (1 - SHEET_SNAP_HALF_FALLBACK), 5);
  });

  it("sizes the drawer in the viewport vaul solves its snaps in", () => {
    const { drawer } = expanded(SHEET_STATE_HALF, DERIVED);
    expect(drawer.style.height).toBe(
      `${sheetDrawerHeightPx(window.innerHeight)}px`,
    );
  });

  it("follows the window when the URL bar moves", () => {
    const had = window.innerHeight;
    try {
      const { drawer } = expanded(SHEET_STATE_HALF, DERIVED);
      const before = drawer.style.height;

      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: had + 80,
      });
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      const after = screen.getByTestId("mobile-inspector-sheet");
      expect(after.style.height).not.toBe(before);
      expect(after.style.height).toBe(
        `${sheetDrawerHeightPx(window.innerHeight)}px`,
      );
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: had,
      });
    }
  });

  it("still publishes which state it is in, not the number", () => {
    expect(expanded(SHEET_STATE_HALF, DERIVED).drawer.dataset.snap).toBe("half");
    expect(expanded(SHEET_STATE_FULL, DERIVED).drawer.dataset.snap).toBe("full");
  });

  it("reports a drag to full as full, and every other snap as half", () => {
    const BACK = [
      { snap: SHEET_SNAP_FULL, state: SHEET_STATE_FULL },
      { snap: SHEET_SNAP_HALF_FALLBACK, state: SHEET_STATE_HALF },
      { snap: DERIVED, state: SHEET_STATE_HALF },
      { snap: DERIVED + 1e-12, state: SHEET_STATE_HALF },
      { snap: null, state: SHEET_STATE_HALF },
    ];
    expect(BACK).toHaveLength(5);

    expect(BACK.map(({ snap }) => sheetStateForSnap(snap))).toEqual(
      BACK.map(({ state }) => state),
    );
  });

  it("hands vaul the derived half and the fixed full, in that order", () => {
    expect(sheetSnapPoints(DERIVED)).toEqual([DERIVED, SHEET_SNAP_FULL]);
  });

  it("orders the snap points, so vaul's own indices mean what they say", () => {
    // `fadeFromIndex={0}` names the first of these, and vaul treats the
    // list as ascending. A derived half above full would invert it.
    const points = sheetSnapPoints(0.62) as number[];
    expect(points[0]).toBeLessThan(points[1]);
    expect(points[1]).toBe(SHEET_SNAP_FULL);
  });
});

/**
 * Every event carries a chosen `timeStamp`: release velocity is a function
 * of them, and two adjacent `fireEvent` statements are 0ms or 1ms apart
 * depending on where they straddle a millisecond boundary.
 */
describe("pulling the sheet down by its content", () => {
  const at = (
    el: HTMLElement,
    type: "touchStart" | "touchMove" | "touchEnd",
    init: object,
    when: number,
  ) => {
    const event = createEvent[type](el, init);
    Object.defineProperty(event, "timeStamp", { value: when });
    fireEvent(el, event);
  };

  const START_AT = 1000;

  /** A third of it is 100px. */
  const VISIBLE_PX = 300;

  /** Moves with the transform, as a laid-out box does. */
  const restAt = (surface: HTMLElement) => {
    const rest = window.innerHeight - VISIBLE_PX;
    surface.getBoundingClientRect = () => {
      const drawn = /translate3d\(0(?:px)?, (-?[\d.]+)px/.exec(
        surface.style.transform,
      );
      const top = rest + (drawn ? Number(drawn[1]) : 0);
      return { top, bottom: top + VISIBLE_PX, height: VISIBLE_PX } as DOMRect;
    };
  };

  const mount = ({
    scrollTop,
    maxScroll,
  }: {
    scrollTop: number;
    maxScroll: number;
  }) => {
    const { onStateChange } = renderSheet(SHEET_STATE_HALF);
    const scroller = screen.getByTestId("mobile-inspector-content");
    const surface = screen.getByTestId("mobile-inspector-surface");
    stubScrollGeometry(scroller, { scrollTop, maxScroll });
    restAt(surface);
    return { onStateChange, scroller, surface };
  };

  /**
   * The hook reads the finger's speed over the last `VELOCITY_WINDOW_MS`,
   * so steps further apart than the window read as motionless however far
   * they went.
   */
  const gesture = (
    scroller: HTMLElement,
    {
      to,
      steps = 2,
      msPerStep = 200,
      holdMs = 0,
      startAt = START_AT,
    }: {
      to: number;
      steps?: number;
      msPerStep?: number;
      holdMs?: number;
      startAt?: number;
    },
  ) => {
    at(scroller, "touchStart", touch(300), startAt);
    let now = startAt;
    for (let step = 1; step <= steps; step += 1) {
      now += msPerStep;
      at(scroller, "touchMove", touch(300 + (to * step) / steps), now);
    }
    const surface = screen.getByTestId("mobile-inspector-surface");
    const transform = surface.style.transform;
    at(scroller, "touchEnd", lift(300 + to), now + holdMs);
    return { transform };
  };

  const pull = (
    geometry: { scrollTop: number; maxScroll: number; to: number } & Omit<
      Parameters<typeof gesture>[1],
      "to"
    >,
  ) => {
    const { onStateChange, scroller, surface } = mount(geometry);
    const { transform } = gesture(scroller, geometry);
    return { onStateChange, transform, surface };
  };

  const settledFor = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 500)));

  it("draws the sheet under the finger, on the surface", () => {
    const { transform } = pull({ scrollTop: 0, maxScroll: 900, to: 40 });
    expect(transform).toBe("translate3d(0, 40px, 0)");
  });

  it("collapses to peek when the pull was far enough", async () => {
    const { onStateChange } = pull({ scrollTop: 0, maxScroll: 900, to: 200 });
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  it("collapses at a third of the visible sheet, and not a pixel short of it", async () => {
    const short = pull({ scrollTop: 0, maxScroll: 900, to: 99 });
    await settledFor();
    expect(short.onStateChange).not.toHaveBeenCalled();

    cleanup();
    const enough = pull({ scrollTop: 0, maxScroll: 900, to: 100 });
    await waitFor(() => {
      expect(enough.onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  it("slides the sheet off the bottom of the screen before it collapses", async () => {
    const { onStateChange, surface } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: 200,
    });

    expect(onStateChange).not.toHaveBeenCalled();
    expect(surface.style.transform).toBe("translate3d(0, 300px, 0)");

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it("leaves at the speed the finger left at", () => {
    // 1px/ms over the last 120ms, with 100px left to go.
    const thrown = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: 200,
      steps: 10,
      msPerStep: 20,
    });
    expect(thrown.surface.style.transition).toMatch(/^transform 300ms /);

    cleanup();
    const pushed = pull({ scrollTop: 0, maxScroll: 900, to: 200 });
    expect(pushed.surface.style.transition).toMatch(/^transform 320ms /);
  });

  it("is not caught by the finger still pulling when something else closes it", async () => {
    const { onStateChange, scroller, surface } = mount({
      scrollTop: 0,
      maxScroll: 900,
    });
    at(scroller, "touchStart", touch(300), START_AT);
    at(scroller, "touchMove", touch(340), START_AT + 200);

    fireEvent.keyDown(document, { key: "Escape" });
    const leaving = surface.getAttribute("style");
    expect(surface.style.transform).toBe("translate3d(0, 300px, 0)");

    at(scroller, "touchMove", touch(320), START_AT + 400);
    at(scroller, "touchEnd", lift(320), START_AT + 400);
    expect(surface.getAttribute("style")).toBe(leaving);
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  describe("is not sprung back by a finger that was already down when it started leaving", () => {
    const leaving = () => {
      const view = mount({ scrollTop: 0, maxScroll: 900 });
      at(view.scroller, "touchStart", touch(300), START_AT);
      at(view.scroller, "touchMove", touch(340), START_AT + 200);
      fireEvent.keyDown(document, { key: "Escape" });
      return { ...view, style: view.surface.getAttribute("style") };
    };

    it("lifting without moving again", () => {
      const { scroller, surface, style } = leaving();
      at(scroller, "touchEnd", lift(340), START_AT + 400);
      expect(surface.getAttribute("style")).toBe(style);
    });

    it("cancelled by the browser", () => {
      const { scroller, surface, style } = leaving();
      fireEvent.touchCancel(scroller, lift(340));
      expect(surface.getAttribute("style")).toBe(style);
    });

    it("joined by a second finger", () => {
      const { scroller, surface, style } = leaving();
      const finger = { identifier: 7, clientY: 340, clientX: 0 };
      const other = { identifier: 8, clientY: 500, clientX: 0 };
      at(
        scroller,
        "touchStart",
        { touches: [finger, other], changedTouches: [other] },
        START_AT + 400,
      );
      expect(surface.getAttribute("style")).toBe(style);
    });
  });

  describe("springs a pull back when the gesture is abandoned", () => {
    it("by a second finger", () => {
      const { scroller, surface } = mount({ scrollTop: 0, maxScroll: 900 });
      at(scroller, "touchStart", touch(300), START_AT);
      at(scroller, "touchMove", touch(340), START_AT + 200);
      expect(surface.style.transform).toBe("translate3d(0, 40px, 0)");

      const finger = { identifier: 7, clientY: 340, clientX: 0 };
      const other = { identifier: 8, clientY: 500, clientX: 0 };
      at(
        scroller,
        "touchStart",
        { touches: [finger, other], changedTouches: [other] },
        START_AT + 300,
      );
      expect(surface.style.transform).toBe("translate3d(0, 0, 0)");
    });

    it("by the browser cancelling the touch", () => {
      const { scroller, surface } = mount({ scrollTop: 0, maxScroll: 900 });
      at(scroller, "touchStart", touch(300), START_AT);
      at(scroller, "touchMove", touch(340), START_AT + 200);
      fireEvent.touchCancel(scroller, lift(340));
      expect(surface.style.transform).toBe("translate3d(0, 0, 0)");
    });
  });

  it("springs the sheet back instead, when it was not", async () => {
    const { onStateChange, surface } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: 20,
    });
    await settledFor();
    expect(onStateChange).not.toHaveBeenCalled();
    expect(surface.style.transform).toBe("translate3d(0, 0, 0)");
  });

  it("collapses at that same distance when the finger left quickly", async () => {
    const { onStateChange } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: 20,
      msPerStep: 8,
    });
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  it("springs back when the finger stopped before lifting, however fast it had been", async () => {
    // 40px is short of the dismiss distance, so only velocity could
    // collapse this.
    const { onStateChange, surface } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: 40,
      msPerStep: 8,
      holdMs: 1000,
    });
    await settledFor();
    expect(onStateChange).not.toHaveBeenCalled();
    expect(surface.style.transform).toBe("translate3d(0, 0, 0)");
  });

  it("leaves the sheet alone when the gesture began away from the top", async () => {
    const { onStateChange, transform } = pull({
      scrollTop: 300,
      maxScroll: 900,
      to: 200,
    });
    expect(transform).toBe("");
    await settledFor();
    expect(onStateChange).not.toHaveBeenCalled();
  });

  /**
   * iOS drops the scroll of a touch during which an ancestor of the
   * scroller changed its transform, so a write here freezes the content.
   */
  describe("writes nothing to the surface through a gesture the scroller owns", () => {
    it("after the sheet has been pulled and sprung back", () => {
      const { scroller, surface } = mount({ scrollTop: 0, maxScroll: 900 });
      gesture(scroller, { to: 20 });
      const rested = surface.getAttribute("style");
      expect(rested).toContain("translate3d(0, 0, 0)");

      scroller.scrollTop = 300;
      at(scroller, "touchStart", touch(300), START_AT + 5000);
      expect(surface.getAttribute("style")).toBe(rested);
      at(scroller, "touchMove", touch(200), START_AT + 5200);
      at(scroller, "touchMove", touch(100), START_AT + 5400);
      at(scroller, "touchEnd", lift(100), START_AT + 5400);
      expect(surface.getAttribute("style")).toBe(rested);
    });

    it("when a touch at the top lifts without moving", () => {
      const { scroller, surface } = mount({ scrollTop: 0, maxScroll: 900 });
      at(scroller, "touchStart", touch(300), START_AT);
      at(scroller, "touchMove", touch(302), START_AT + 50);
      at(scroller, "touchEnd", lift(302), START_AT + 100);
      expect(surface.getAttribute("style")).toBeNull();
    });

    it("when a touch at the top turns upward", () => {
      const { scroller, surface } = mount({ scrollTop: 0, maxScroll: 900 });
      gesture(scroller, { to: -200 });
      expect(surface.getAttribute("style")).toBeNull();
    });
  });

  it("reaches the handoff through a scroller that bounced past its own top", async () => {
    // iOS Safari stretches an inner scroller past its top, and reports
    // the stretch as a negative `scrollTop`.
    const { onStateChange, scroller, surface } = mount({
      scrollTop: 200,
      maxScroll: 900,
    });

    at(scroller, "touchStart", touch(300), START_AT);
    scroller.scrollTop = 0;
    at(scroller, "touchMove", touch(500), START_AT + 200);
    scroller.scrollTop = -60;
    at(scroller, "touchMove", touch(560), START_AT + 400);
    scroller.scrollTop = -60;
    at(scroller, "touchMove", touch(660), START_AT + 600);

    expect(surface.style.transform).toBe("translate3d(0, 100px, 0)");
    at(scroller, "touchEnd", lift(660), START_AT + 800);
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  it("does not expand the sheet when the content is dragged upward", async () => {
    const { onStateChange, transform } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: -200,
    });
    expect(transform).toBe("");
    await settledFor();
    expect(onStateChange).not.toHaveBeenCalled();
  });
});

describe("releasing the knob", () => {
  const halfTop = () =>
    sheetTopAtSnap(window.innerHeight, SHEET_SNAP_HALF_FALLBACK);
  const third = () => (window.innerHeight - halfTop()) / 3;

  const releaseAt = async (sheetTop: number) => {
    const { onStateChange } = renderSheet(SHEET_STATE_HALF);
    const sheet = await screen.findByTestId("mobile-inspector-sheet");
    const handle = sheet.querySelector<HTMLElement>("[data-vaul-handle]")!;
    handle.setPointerCapture = () => undefined;
    sheet.getBoundingClientRect = () =>
      ({ top: sheetTop, bottom: window.innerHeight }) as DOMRect;

    fireEvent.pointerDown(handle, { pointerId: 1, pageY: halfTop() });
    fireEvent.pointerUp(handle, { pointerId: 1, pageY: sheetTop });
    return { onStateChange };
  };

  it("collapses to peek a third of the half sheet below half", async () => {
    const { onStateChange } = await releaseAt(halfTop() + third() + 1);
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  it("leaves the sheet to its snap points short of that", async () => {
    const { onStateChange } = await releaseAt(halfTop() + third() - 10);
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(onStateChange).not.toHaveBeenCalledWith(SHEET_STATE_PEEK);
  });
});
