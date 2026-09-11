import { describe, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
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

/**
 * The sheet rests, it does not close.
 *
 * Three states as of 2026-09: a 56px `peek` carrying the file's name
 * and the controls that act on it, and `half` / `full` bringing the
 * rest of the inspector up over the page. The state it does not have is
 * "gone" — on a phone the per-file actions used to be somewhere in a
 * column the reader had to find, and the point of the strip is that
 * they are in the same place on every file.
 */
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

/**
 * Make a scroller report a scroll geometry.
 *
 * jsdom gives every element `scrollHeight === clientHeight === 0`, so
 * without this the sheet's own scroller looks like one with nothing to
 * scroll and every gesture reads as condition 1. The numbers are the
 * hook's only inputs from the DOM, which is why they can be supplied —
 * and why nothing here is evidence about a layout.
 */
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
 * One finger, in both lists.
 *
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
    // The 56px is what the reader gets at rest, so it is the row's own
    // height and not a minimum the content can push past.
    renderSheet();
    const row = screen.getByTestId("mobile-inspector-peek");
    expect(row.style.height).toBe(`${SHEET_PEEK_PX}px`);
  });

  it("mounts no dialog at rest, so the page is not hidden from a reader", () => {
    // The reason the strip is drawn outside vaul. vaul hands Radix's
    // `Dialog.Root` only `open` / `defaultOpen` / `onOpenChange` — its
    // own `modal` never arrives — so Radix defaults to modal and calls
    // `hideOthers()` on every other body child. A drawer mounted at
    // rest puts `aria-hidden="true"` on the whole application, on every
    // file page a phone opens, permanently. Nothing looks wrong; the
    // page is simply gone for anyone using a screen reader.
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

  // The converse, and it is what the `column` inspector's justification
  // turns on. Three files said the strip "is on screen whether the sheet
  // is up or down" — it is not: the component returns the strip *or* the
  // drawer, never both, so once the sheet is up the file's name and its
  // action row live only at the top of the sheet's own column, and are
  // reached by scrolling back to it. That is the confirmed trade
  // (`DESIGN.md` §Layering), and this is the fact it rests on, stated
  // where it can fail.
  for (const state of [SHEET_STATE_HALF, SHEET_STATE_FULL]) {
    it(`draws no resting strip at ${state}, so the actions are not also below`, async () => {
      renderSheet(state);
      await screen.findByTestId("mobile-inspector-sheet");

      expect(screen.queryByTestId("mobile-inspector-peek")).toBeNull();
      expect(screen.queryByTestId("peek-content")).toBeNull();
    });
  }

  it("draws it at rest and nowhere else, which is the whole of that rule", () => {
    // Both halves in one place: a component that rendered the strip at
    // every snap would pass each case above's sibling and none of this.
    renderSheet(SHEET_STATE_PEEK);
    expect(screen.getByTestId("mobile-inspector-peek")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull();
  });

  it("dims the page at half, the state the toggle opens", async () => {
    // vaul fades its overlay from the *last* snap point by default,
    // which would leave half covering the page with no dim to say so —
    // a tap outside would then collapse the sheet with nothing on
    // screen having explained why.
    renderSheet(SHEET_STATE_HALF);
    const overlay = await screen.findByTestId("mobile-inspector-overlay");
    expect(overlay.dataset.vaulSnapPointsOverlay).toBe("true");
  });

  it("collapses to peek on a dismiss gesture instead of closing", async () => {
    // There is no closed state to dismiss to. Refusing the gesture
    // outright would leave a reader who tapped the dim with nothing
    // happening at all.
    const { onStateChange } = renderSheet(SHEET_STATE_HALF);
    await screen.findByTestId("mobile-inspector-sheet");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(SHEET_STATE_PEEK);
    });
  });

  it("sits below the modal-dialog tier", async () => {
    // The sheet hosts the same inspector the desktop pane does, `[...]`
    // menu included, so Rename / Move / Trash and any addon dialog open
    // from inside it. Those portal at z-50; if the sheet outranked them
    // they would be launched and immediately buried. DESIGN.md §Layering.
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
    // vaul is `modal` while expanded: `pointer-events: none` on <body>
    // and `aria-hidden` on every other body child. A dialog portalled
    // beside the sheet is rendered and inert no matter its z-index,
    // which is why the sheet hands out a host in its own subtree.
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

/** The drawer at an expanded state, which is where vaul has published. */
function expanded(state: SheetState, halfSnap?: number) {
  // Torn down first, so a case may ask this twice: vaul portals to
  // `document.body`, and two drawers there make every query ambiguous.
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

/**
 * `half` is a state; the snap it resolves to is a measurement.
 *
 * The component is the only place the two meet, and these are what that
 * translation has to get right. None of it is geometry — jsdom lays
 * nothing out, so where the drawer *lands* at a given snap is
 * `e2e-layout/mobile-inspector-sheet.spec.ts` — but which number reaches
 * vaul, and which state comes back out, are decisions and are here.
 */
describe("the half state and the snap it resolves to", () => {
  /** A player-derived value: not 0.5, not 0.9, and not a round number. */
  const DERIVED = 0.627736;

  it("hands vaul the derived snap in place of the fixed one", () => {
    // Read back off the variable vaul publishes rather than off the
    // prop, so this fails if the number is accepted and not used.
    const { drawer } = expanded(SHEET_STATE_HALF, DERIVED);
    expect(
      Number.parseFloat(drawer.style.getPropertyValue("--snap-point-height")),
    ).toBeCloseTo(window.innerHeight * (1 - DERIVED), 5);
  });

  it("leaves full alone when half moves", () => {
    // `full` is the state for reading without following playback, so it
    // does not depend on the player. A derivation wired into both would
    // pass every case above and cover the video at the state whose whole
    // point is that it may.
    const { drawer } = expanded(SHEET_STATE_FULL, DERIVED);
    expect(
      Number.parseFloat(drawer.style.getPropertyValue("--snap-point-height")),
    ).toBeCloseTo(window.innerHeight * (1 - SHEET_SNAP_FULL), 5);
  });

  it("falls back to the fixed fraction when nothing was measured", () => {
    // The Markdown / PDF / image surfaces, which pass no `halfSnap`.
    const { drawer } = expanded(SHEET_STATE_HALF);
    expect(
      Number.parseFloat(drawer.style.getPropertyValue("--snap-point-height")),
    ).toBeCloseTo(window.innerHeight * (1 - SHEET_SNAP_HALF_FALLBACK), 5);
  });

  it("sizes the drawer in the viewport vaul solves its snaps in", () => {
    // Both terms of the derivation in one place. vaul's translate is a
    // fraction of `window.innerHeight`; the drawer's height has to be a
    // fraction of the same number, or the sheet's top edge lands
    // somewhere neither of them named.
    const { drawer } = expanded(SHEET_STATE_HALF, DERIVED);
    expect(drawer.style.height).toBe(
      `${sheetDrawerHeightPx(window.innerHeight)}px`,
    );
  });

  it("follows the window when the URL bar moves", () => {
    // A height read once is the same defect as a snap computed once. On
    // a phone the window grows by the height of the bar and vaul's
    // translate changes with it; a drawer still sized for the old window
    // is the mismatch this round removed, arriving a moment later.
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
    // `[data-sheet-snap]` and `data-snap` are read by a stylesheet and by
    // `MediaShell.test.tsx`; a derived float landing in either would make
    // both meaningless.
    expect(expanded(SHEET_STATE_HALF, DERIVED).drawer.dataset.snap).toBe("half");
    expect(expanded(SHEET_STATE_FULL, DERIVED).drawer.dataset.snap).toBe("full");
  });

  it("reports a drag to full as full, and every other snap as half", () => {
    // vaul answers with a snap point and the shell stores a state, so
    // this is the direction that has to survive a derived number. Each
    // input is declared with the state it belongs to; a mapping written
    // the other way round — "is this the half number" — passes the first
    // two and turns the third into `full`.
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
 * The pull-to-collapse gesture, as far as jsdom reaches.
 *
 * What is held here is the **wiring**: that the listeners are on the
 * sheet's own scroller, that the box they translate is the surface, and
 * that a gesture which earns a collapse ends in `onStateChange("peek")`.
 * Which gestures earn it is `lib/__tests__/sheetPullGesture.test.ts`, and
 * whether the browser then declines to scroll is
 * `e2e-components/sheet-gesture.spec.ts` — jsdom cannot scroll, so it
 * cannot be asked.
 */
describe("pulling the sheet down by its content", () => {
  const pull = ({
    scrollTop,
    maxScroll,
    to,
  }: {
    scrollTop: number;
    maxScroll: number;
    to: number;
  }) => {
    const { onStateChange } = renderSheet(SHEET_STATE_HALF);
    const scroller = screen.getByTestId("mobile-inspector-content");
    const surface = screen.getByTestId("mobile-inspector-surface");
    stubScrollGeometry(scroller, { scrollTop, maxScroll });

    fireEvent.touchStart(scroller, touch(300));
    fireEvent.touchMove(scroller, touch(300 + to));
    const transform = surface.style.transform;
    fireEvent.touchEnd(scroller, lift(300 + to));
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

  it("leaves the sheet alone when the gesture began away from the top", () => {
    // The negative form, and the one that says the listener is reading
    // the scroller rather than just the finger: same finger, same
    // distance, different starting offset.
    const { onStateChange, transform } = pull({
      scrollTop: 300,
      maxScroll: 900,
      to: 200,
    });
    expect(transform).toBe("");
    expect(onStateChange).not.toHaveBeenCalled();
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
