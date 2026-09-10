import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";

import {
  Ancestors,
  type AncestorSpec,
} from "@/__tests__/helpers/ancestorChain";
import {
  useAnchoredDirection,
  type AnchoredSide,
} from "@/hooks/useAnchoredDirection";

/**
 * What corner `useAnchoredDirection` picks, for a stated arrangement.
 *
 * ## What these cases are evidence about
 *
 * The decision, and nothing geometric. **jsdom lays nothing out**: every
 * `getBoundingClientRect()` here is a value this file states, so a panel
 * drawn 200px past the edge of its frame measures exactly like one drawn
 * inside it. Whether the corner these cases name is actually on screen is
 * measured in Chromium — `e2e-layout/` against a static fixture, and
 * `e2e-components/` against the real components inside a real sheet.
 *
 * `FileActions.test.tsx` drives the same hook through its first caller and
 * holds the chain cases; what is here is the surface no caller had before
 * the extraction — the right-hand edge, the visual viewport's offsets, the
 * unanchored form, and re-deriving when the viewport moves under an open
 * panel.
 */

/** The boxes a probe reports, keyed by which element is asking. */
interface ProbeBoxes {
  trigger: { top: number; bottom: number; left: number; right: number };
  panel: { width: number; height: number };
}

/**
 * Stub every rect the hook reads.
 *
 * An ancestor built by `<Ancestors>` states its own box on `data-box`, so
 * a case that adds one to the chain does not also have to be handed here.
 */
function stubBoxes(boxes: ProbeBoxes) {
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const role = this.getAttribute("data-probe");
      if (role === "trigger") return { ...boxes.trigger } as DOMRect;
      if (role === "panel") return { ...boxes.panel } as DOMRect;
      const box = this.getAttribute("data-box");
      if (box) return JSON.parse(box) as DOMRect;
      return original.call(this);
    },
  );
}

/**
 * A `visualViewport` with every field the decision reads, and an
 * `EventTarget` under it so a case can move it while a panel is open.
 *
 * Stated in full rather than as the one field a case is about: the
 * decision reads four of them, and a partial stub leaves the rest
 * `undefined`, which makes every comparison against them `false` — the
 * case would then pass on arithmetic rather than on the code.
 */
function stubVisualViewport(
  box: Partial<{
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
  }> = {},
) {
  const target = new EventTarget();
  const vv = {
    offsetLeft: 0,
    offsetTop: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    ...box,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  vi.stubGlobal("visualViewport", vv);
  /**
   * Move the visible band and announce it the way the browser does.
   *
   * The event name is the case's to choose: a keyboard changes the band's
   * size and fires `resize`, while panning a zoomed page changes only its
   * offset and fires `scroll`. They are two subscriptions, so a helper
   * that always sent one of them would leave the other untested.
   */
  return (next: Partial<typeof vv>, event: "resize" | "scroll") => {
    Object.assign(vv, next);
    act(() => {
      target.dispatchEvent(new Event(event));
    });
  };
}

function Probe({
  gapPx = 4,
  preferSide,
  panelPosition,
}: {
  gapPx?: number;
  preferSide?: AnchoredSide;
  panelPosition?: "absolute" | "fixed";
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { openUp, side } = useAnchoredDirection({
    triggerRef,
    panelRef,
    open: true,
    gapPx,
    preferSide,
  });
  return (
    <div ref={triggerRef} data-probe="trigger" style={{ position: "relative" }}>
      <div
        ref={panelRef}
        data-probe="panel"
        data-testid="answer"
        data-open-up={String(openUp)}
        data-side={side}
        style={{ position: panelPosition ?? "absolute" }}
      />
    </div>
  );
}

interface ProbeOptions extends ProbeBoxes {
  chain?: AncestorSpec[];
  gapPx?: number;
  preferSide?: AnchoredSide;
  panelPosition?: "absolute" | "fixed";
}

function open({ trigger, panel, chain = [], ...rest }: ProbeOptions) {
  stubBoxes({ trigger, panel });
  render(
    <Ancestors chain={chain}>
      <Probe {...rest} />
    </Ancestors>,
  );
  const el = screen.getByTestId("answer");
  return {
    get openUp() {
      return el.dataset.openUp === "true";
    },
    get side() {
      return el.dataset.side as AnchoredSide;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAnchoredDirection: the detour across two static ancestors", () => {
  /**
   * Past an `absolute` box the containing block is the nearest *positioned*
   * ancestor, so the detour runs across however many statics lie in
   * between. The flag that tracks it is only moved by a positioned box —
   * and a chain with one static in it cannot tell that rule from one that
   * lets any ancestor clear the flag, because there the clip test is
   * reached before the flag would have been cleared. Two statics separate
   * them, which is why this arrangement exists rather than the one-static
   * case `FileActions.test.tsx` already carries.
   */
  const SCROLLER = { top: 300, bottom: 500, left: 0, right: 1024 };
  const TRIGGER = { top: 440, bottom: 468, left: 300, right: 328 };

  it("keeps skipping static scrollers until a positioned ancestor ends it", () => {
    // The scroller ends at 500, 32px below a trigger with a 100px panel;
    // the window ends at 768, 300px below it. So "up" means the scroller
    // was taken as the frame and "down" means it was correctly skipped.
    const answer = open({
      trigger: TRIGGER,
      panel: { width: 160, height: 100 },
      chain: [
        { clips: true, box: SCROLLER },
        {},
        { position: "absolute" },
      ],
    });

    expect(answer.openUp).toBe(false);
  });

  it("clips again above the positioned ancestor that ends the detour", () => {
    // The same chain with the middle static made `relative`: it is the
    // absolute box's containing block, so the detour stops there and the
    // scroller above it is in the chain again.
    const answer = open({
      trigger: TRIGGER,
      panel: { width: 160, height: 100 },
      chain: [
        { clips: true, box: SCROLLER },
        { position: "relative" },
        { position: "absolute" },
      ],
    });

    expect(answer.openUp).toBe(true);
  });
});

describe("useAnchoredDirection: the frame's right-hand edge", () => {
  /**
   * The axis nothing collected before the extraction. Both of the walks
   * this hook replaces recorded `left`, `top` and `bottom` only, so a
   * panel hung from a trigger's left edge was never asked whether it
   * crossed the frame's right one.
   *
   * The frame here is a 384px column — the inspector's width, which is the
   * one frame in the tree narrow enough for this to bind.
   *
   * **It is placed 100px clear of the window's right edge, and that is the
   * point.** The inspector in the app is flush against the viewport, where
   * the column's right edge and the visible band's are the same number and
   * a walk that collected neither would still be rescued by the band. Move
   * the column inward and the two separate, so these cases are about the
   * edge the *frame* has rather than the one the window has.
   */
  const PANE = { top: 0, bottom: 768, left: 540, right: 924 };

  it("flips a left-hung panel that would cross the frame's right edge", () => {
    // A trigger 124px from the pane's right edge, with a 160px panel: hung
    // leftward it ends at 960, 36px outside the column it is drawn in — and
    // 64px inside the window, so only the column's own edge answers this.
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 800, right: 828 },
      panel: { width: 160, height: 100 },
      preferSide: "left",
      chain: [{ clips: true, box: PANE }],
    });

    expect(answer.side).toBe("right");
  });

  it("leaves a left-hung panel that fits alone", () => {
    // The same pane and the same panel, from a trigger at its left edge.
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 548, right: 576 },
      panel: { width: 160, height: 100 },
      preferSide: "left",
      chain: [{ clips: true, box: PANE }],
    });

    expect(answer.side).toBe("left");
  });

  it("keeps the preferred side when neither side has room", () => {
    // A 500px panel in a 384px column: hung leftward it has 376px, hung
    // rightward 364. Flipping trades room away, so the panel keeps the
    // side it reads as everywhere else — the horizontal mirror of a
    // trigger with room for neither direction staying downward.
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 548, right: 904 },
      panel: { width: 500, height: 100 },
      preferSide: "left",
      chain: [{ clips: true, box: PANE }],
    });

    expect(answer.side).toBe("left");
  });

  it("flips a right-hung panel at the frame's left edge, as before", () => {
    // The mirror of the first case, and the direction the extracted walk
    // already had: a trigger 12px inside the pane's left edge.
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 552, right: 580 },
      panel: { width: 160, height: 100 },
      preferSide: "right",
      chain: [{ clips: true, box: PANE }],
    });

    expect(answer.side).toBe("left");
  });
});

describe("useAnchoredDirection: the visible band, not the layout viewport", () => {
  /**
   * With no clipping ancestor the frame is the window, and what is on
   * screen there is the *visual* viewport. Its offsets are expressed
   * against the layout viewport's origin — the same origin a client rect
   * is — so the band is `[offsetTop, offsetTop + height]`. Reading the
   * height and dropping the offset is right only while the offset is zero,
   * which is every state but a zoomed or keyboard-scrolled one.
   */
  it("measures the room above from the band's top, not from zero", () => {
    // A band running 400-700 with the trigger at 440: 260px below it and
    // 40px above. From zero the room above would read as 440 and a 300px
    // panel would flip for room that is not on screen.
    stubVisualViewport({ offsetTop: 400, height: 300 });
    const answer = open({
      trigger: { top: 440, bottom: 468, left: 300, right: 460 },
      panel: { width: 160, height: 300 },
    });

    expect(answer.openUp).toBe(false);
  });

  it("measures the room below from the band's bottom", () => {
    // The same band, a trigger near its foot: 20px below, 240px above.
    stubVisualViewport({ offsetTop: 400, height: 300 });
    const answer = open({
      trigger: { top: 640, bottom: 680, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
    });

    expect(answer.openUp).toBe(true);
  });

  it("flips sideways at the band's left edge, not at zero", () => {
    // A band starting 200px in. The trigger's right edge is at 300, so a
    // 160px panel hung rightward starts at 140 — inside the layout
    // viewport and 60px outside what is on screen.
    stubVisualViewport({ offsetLeft: 200, width: 824 });
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 272, right: 300 },
      panel: { width: 160, height: 100 },
    });

    expect(answer.side).toBe("left");
  });

  it("leaves a left-hung panel that the band's right edge still fits", () => {
    // The pair for the case below, and the one that separates the band's
    // right edge from its width: 324px of room from a trigger at 700 in a
    // band running 200-1024. Read the width as the edge and the room is
    // 124, and a panel that fits is flipped for no reason.
    stubVisualViewport({ offsetLeft: 200, width: 824 });
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 700, right: 728 },
      panel: { width: 160, height: 100 },
      preferSide: "left",
    });

    expect(answer.side).toBe("left");
  });

  it("flips sideways at the band's right edge", () => {
    // The same band, ending at 1024. A left-hung 160px panel from a
    // trigger at 900 ends at 1060.
    stubVisualViewport({ offsetLeft: 200, width: 824 });
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 900, right: 928 },
      panel: { width: 160, height: 100 },
      preferSide: "left",
    });

    expect(answer.side).toBe("right");
  });
});

describe("useAnchoredDirection: a frame that runs off the screen", () => {
  /**
   * The room a panel has is what is *both* unclipped and on screen, so the
   * clipping ancestor's box and the visible band are intersected rather
   * than chosen between.
   *
   * An on-screen keyboard is why. It shrinks what is visible without
   * moving any element's box, so before this the band was a *fallback* for
   * a panel with no clipping ancestor and invisible to every panel that
   * had one — a menu inside a column counted room below it that the
   * keyboard was covering.
   *
   * Four edges, four cases: the expression has a term per edge, and three
   * of them would be untested by a case about the fourth.
   */
  const TALL_SCROLLER = { top: 100, bottom: 2000, left: 0, right: 1024 };

  it("stops at the fold, not at the frame's own bottom", () => {
    // 1260px below the trigger by the scroller's box, 28 by the fold.
    stubVisualViewport({ height: 768 });
    const answer = open({
      trigger: { top: 700, bottom: 740, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
      chain: [{ clips: true, box: TALL_SCROLLER }],
    });

    expect(answer.openUp).toBe(true);
  });

  it("stops at the band's top, not at the frame's own top", () => {
    // A keyboard pushes the band's top to 400 while the scroller still
    // starts at 100: 340px above the trigger by the frame, 40 by the band,
    // and 68 below it either way. Only the smaller of the two makes
    // flipping the wrong answer.
    stubVisualViewport({ offsetTop: 400, height: 400 });
    const answer = open({
      trigger: { top: 440, bottom: 732, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
      chain: [{ clips: true, box: TALL_SCROLLER }],
    });

    expect(answer.openUp).toBe(false);
  });

  it("stops at the band's right edge, not at the frame's own", () => {
    // A scroller as wide as the layout viewport with the band ending at
    // 600: 324px of room from a trigger at 276 by the frame, 124 by what is
    // on screen, for a 160px panel hung leftward.
    stubVisualViewport({ width: 600 });
    const answer = open({
      trigger: { top: 200, bottom: 228, left: 476, right: 504 },
      panel: { width: 160, height: 100 },
      preferSide: "left",
      chain: [{ clips: true, box: TALL_SCROLLER }],
    });

    expect(answer.side).toBe("right");
  });

  it("stops at the band's left edge, not at the frame's own", () => {
    // The mirror: the band starts at 300 while the scroller starts at 0, so
    // a 160px panel hung rightward from a trigger ending at 420 starts at
    // 260 — inside the frame and outside what is on screen.
    stubVisualViewport({ offsetLeft: 300, width: 724 });
    const answer = open({
      trigger: { top: 200, bottom: 228, left: 392, right: 420 },
      panel: { width: 160, height: 100 },
      chain: [{ clips: true, box: TALL_SCROLLER }],
    });

    expect(answer.side).toBe("left");
  });
});

describe("useAnchoredDirection: the unanchored form decides nothing", () => {
  /**
   * Below `sm` the toolbar menus are a sheet spanning the viewport rather
   * than a panel hung off a trigger. There is no direction to pick, and
   * the answer must stay where it was rather than becoming an arbitrary
   * one that a `sm:`-scoped class would carry across the breakpoint.
   *
   * The test is the panel's computed `position`, which is the property the
   * arithmetic itself needs; a media query would be a second guess at the
   * same fact.
   */
  /**
   * Boxes that flip **both** axes when the panel is anchored: a trigger
   * 20px off the floor of a 768px window with a 200px panel, at the right
   * edge of a 1024px one with a 160px panel hung leftward. So the pair
   * below differs only in the panel's `position`, and the gated case is
   * evidence about the gate rather than about boxes that decide nothing
   * either way.
   *
   * `preferSide` is `left` on purpose. The gated path never assigns, so
   * what reaches the screen there is the hook's *initial* answer — the one
   * state in which that value is observable at all, and the reason it is
   * `preferSide` rather than the default side.
   */
  const WOULD_FLIP_BOTH = {
    trigger: { top: 700, bottom: 748, left: 950, right: 978 },
    panel: { width: 160, height: 200 },
    preferSide: "left" as const,
  };

  it("leaves both answers alone when the panel is not anchored", () => {
    const answer = open({ ...WOULD_FLIP_BOTH, panelPosition: "fixed" });

    expect(answer.openUp).toBe(false);
    expect(answer.side).toBe("left");
  });

  it("decides both axes for the same boxes when it is anchored", () => {
    const answer = open({ ...WOULD_FLIP_BOTH, panelPosition: "absolute" });

    expect(answer.openUp).toBe(true);
    expect(answer.side).toBe("right");
  });
});

describe("useAnchoredDirection: the viewport moving under an open panel", () => {
  /**
   * An on-screen keyboard changes what is visible without resizing the
   * panel, the trigger or anything in the chain — so the panel's own
   * `ResizeObserver`, which is the only thing that re-derived the
   * direction before the extraction, never fires for it.
   *
   * A field's typeahead is the case that makes this reachable rather than
   * theoretical: it is opened *by* typing, so the keyboard is already up
   * when the first measurement is taken and the event worth noticing is it
   * going away again.
   */
  it("re-derives when the keyboard leaves and gives the room back", () => {
    // 300px of band with the trigger at 440: 20px below it while the
    // keyboard is up, so a 100px panel opens upward. The keyboard leaves
    // and the band becomes the whole window — 308px below the trigger.
    const moveViewport = stubVisualViewport({ offsetTop: 200, height: 260 });
    const answer = open({
      trigger: { top: 400, bottom: 440, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
    });
    expect(answer.openUp).toBe(true);

    moveViewport({ offsetTop: 0, height: 768 }, "resize");

    expect(answer.openUp).toBe(false);
  });

  it("re-derives when the band is panned without changing size", () => {
    // Pinch-zoom pans the visible band over an unchanged layout viewport:
    // same height, different offset, and neither the panel's box nor the
    // trigger's moves — a client rect does not follow the visual viewport.
    // So the `ResizeObserver` sees nothing and only the `scroll`
    // subscription can reach this one.
    //
    // A band 300 tall over a trigger at 600/628 with a 100px panel: at
    // offset 400 the band ends at 700, leaving 72px below the trigger
    // against 200 above it, so the panel opens upward. Panning down to 500
    // ends the band at 800 and gives the panel the 172px it needs.
    const moveViewport = stubVisualViewport({ offsetTop: 400, height: 300 });
    const answer = open({
      trigger: { top: 600, bottom: 628, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
    });
    expect(answer.openUp).toBe(true);

    moveViewport({ offsetTop: 500 }, "scroll");

    expect(answer.openUp).toBe(false);
  });

  it("falls back to the window where there is no visual viewport", () => {
    // jsdom defines no `visualViewport`, which is the branch this case
    // wants: the subscription is to `window` instead, and it is one
    // subscription rather than two — a browser that has both fires both
    // for a single resize, and re-deriving twice for one event is what
    // listening to each of them would buy.
    //
    // The window is 768 tall here, leaving 340px under a trigger at 428
    // for a 100px panel. Shrinking it to 480 leaves 52.
    const answer = open({
      trigger: { top: 400, bottom: 428, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
    });
    expect(answer.openUp).toBe(false);

    vi.stubGlobal("innerHeight", 480);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(answer.openUp).toBe(true);
  });
});
