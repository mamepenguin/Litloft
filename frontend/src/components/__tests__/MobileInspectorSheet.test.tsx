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
import { createPortal } from "react-dom";

import { useDialogPortalTarget } from "@/components/DialogPortal";
import {
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF_FALLBACK,
  sheetDrawerHeightPx,
} from "@/lib/sheetSnap";
import {
  MobileInspectorSheet,
  SHEET_STATE_FULL,
  SHEET_STATE_HALF,
  SHEET_STATE_PEEK,
  isSheetExpanded,
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

  it("gives the peek row exactly the height the design names", () => {
    renderSheet();
    const row = screen.getByTestId("mobile-inspector-peek");
    expect(row.style.height).toBe(`${SHEET_PEEK_PX}px`);
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

  it("dims the page at half, the state the toggle opens", async () => {
    // vaul fades its overlay from the *last* snap point by default.
    renderSheet(SHEET_STATE_HALF);
    const overlay = await screen.findByTestId("mobile-inspector-overlay");
    expect(overlay.dataset.vaulSnapPointsOverlay).toBe("true");
  });

  it("collapses to peek on a dismiss gesture instead of closing", async () => {
    const { onStateChange } = renderSheet(SHEET_STATE_HALF);
    await screen.findByTestId("mobile-inspector-sheet");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  it("sits below the modal-dialog tier", async () => {
    // Dialogs opened from inside the sheet portal at z-50; if the sheet
    // outranked them they would be launched and immediately buried.
    renderSheet(SHEET_STATE_FULL);
    const sheet = await screen.findByTestId("mobile-inspector-sheet");
    const overlay = screen.getByTestId("mobile-inspector-overlay");

    for (const el of [sheet, overlay]) {
      const tier = /z-\[(\d+)\]/.exec(el.className)?.[1];
      expect(tier).toBeDefined();
      expect(Number(tier)).toBeLessThan(50);
      expect(Number(tier)).toBeGreaterThan(40);
    }
  });

  it("hosts dialogs opened from inside it, where they stay interactive", async () => {
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
    expect(
      dialog.closest("[data-testid='mobile-inspector-sheet']"),
    ).not.toBeNull();
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

  /**
   * The hook reads the finger's speed over the last `VELOCITY_WINDOW_MS`,
   * so steps further apart than the window read as motionless however far
   * they went.
   */
  const pull = ({
    scrollTop,
    maxScroll,
    to,
    steps = 2,
    msPerStep = 200,
    holdMs = 0,
  }: {
    scrollTop: number;
    maxScroll: number;
    to: number;
    steps?: number;
    msPerStep?: number;
    holdMs?: number;
  }) => {
    const { onStateChange } = renderSheet(SHEET_STATE_HALF);
    const scroller = screen.getByTestId("mobile-inspector-content");
    const surface = screen.getByTestId("mobile-inspector-surface");
    stubScrollGeometry(scroller, { scrollTop, maxScroll });

    at(scroller, "touchStart", touch(300), START_AT);
    let now = START_AT;
    for (let step = 1; step <= steps; step += 1) {
      now += msPerStep;
      at(scroller, "touchMove", touch(300 + (to * step) / steps), now);
    }
    const transform = surface.style.transform;
    at(scroller, "touchEnd", lift(300 + to), now + holdMs);
    return { onStateChange, transform, surface };
  };

  it("draws the sheet under the finger, on the surface", () => {
    const { transform } = pull({ scrollTop: 0, maxScroll: 900, to: 40 });
    expect(transform).toBe("translate3d(0, 40px, 0)");
  });

  it("collapses to peek when the pull was far enough", () => {
    const { onStateChange } = pull({ scrollTop: 0, maxScroll: 900, to: 200 });
    expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
  });

  it("springs the sheet back instead, when it was not", () => {
    const { onStateChange, surface } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: 20,
    });
    expect(onStateChange).not.toHaveBeenCalled();
    expect(surface.style.transform).toBe("translate3d(0, 0, 0)");
  });

  it("collapses at that same distance when the finger left quickly", () => {
    const { onStateChange } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: 20,
      msPerStep: 8,
    });
    expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
  });

  it("springs back when the finger stopped before lifting, however fast it had been", () => {
    // 40px is short of the dismiss distance, so only velocity could
    // collapse this.
    const { onStateChange, surface } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: 40,
      msPerStep: 8,
      holdMs: 1000,
    });
    expect(onStateChange).not.toHaveBeenCalled();
    expect(surface.style.transform).toBe("translate3d(0, 0, 0)");
  });

  it("leaves the sheet alone when the gesture began away from the top", () => {
    const { onStateChange, transform } = pull({
      scrollTop: 300,
      maxScroll: 900,
      to: 200,
    });
    expect(transform).toBe("");
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("reaches the handoff through a scroller that bounced past its own top", () => {
    // iOS Safari stretches an inner scroller past its top, and reports
    // the stretch as a negative `scrollTop`.
    const { onStateChange } = renderSheet(SHEET_STATE_HALF);
    const scroller = screen.getByTestId("mobile-inspector-content");
    const surface = screen.getByTestId("mobile-inspector-surface");
    stubScrollGeometry(scroller, { scrollTop: 200, maxScroll: 900 });

    at(scroller, "touchStart", touch(300), START_AT);
    scroller.scrollTop = 0;
    at(scroller, "touchMove", touch(500), START_AT + 200);
    scroller.scrollTop = -60;
    at(scroller, "touchMove", touch(560), START_AT + 400);
    scroller.scrollTop = -60;
    at(scroller, "touchMove", touch(660), START_AT + 600);

    expect(surface.style.transform).toBe("translate3d(0, 100px, 0)");
    at(scroller, "touchEnd", lift(660), START_AT + 800);
    expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
  });

  it("does not expand the sheet when the content is dragged upward", () => {
    const { onStateChange, transform } = pull({
      scrollTop: 0,
      maxScroll: 900,
      to: -200,
    });
    expect(transform).toBe("");
    expect(onStateChange).not.toHaveBeenCalled();
  });
});
