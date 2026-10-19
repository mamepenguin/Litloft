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

interface ProbeBoxes {
  trigger: { top: number; bottom: number; left: number; right: number };
  panel: { width: number; height: number };
}

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
 * Every field is stated because a partial stub leaves the rest `undefined`,
 * which makes every comparison against them `false`.
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
   * A chain with one static in it cannot tell "only a positioned box ends
   * the detour" from "any ancestor ends it"; two statics separate them.
   */
  const SCROLLER = { top: 300, bottom: 500, left: 0, right: 1024 };
  const TRIGGER = { top: 440, bottom: 468, left: 300, right: 328 };

  it("keeps skipping static scrollers until a positioned ancestor ends it", () => {
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
   * The pane sits clear of the window's right edge on purpose: flush against
   * it, the visible band would rescue a walk that never collected the
   * frame's right edge.
   */
  const PANE = { top: 0, bottom: 768, left: 540, right: 924 };

  it("flips a left-hung panel that would cross the frame's right edge", () => {
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 800, right: 828 },
      panel: { width: 160, height: 100 },
      preferSide: "left",
      chain: [{ clips: true, box: PANE }],
    });

    expect(answer.side).toBe("right");
  });

  it("leaves a left-hung panel that fits alone", () => {
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 548, right: 576 },
      panel: { width: 160, height: 100 },
      preferSide: "left",
      chain: [{ clips: true, box: PANE }],
    });

    expect(answer.side).toBe("left");
  });

  it("keeps the preferred side when neither side has room", () => {
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 548, right: 904 },
      panel: { width: 500, height: 100 },
      preferSide: "left",
      chain: [{ clips: true, box: PANE }],
    });

    expect(answer.side).toBe("left");
  });

  it("flips a right-hung panel at the frame's left edge, as before", () => {
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
  it("measures the room above from the band's top, not from zero", () => {
    stubVisualViewport({ offsetTop: 400, height: 300 });
    const answer = open({
      trigger: { top: 440, bottom: 468, left: 300, right: 460 },
      panel: { width: 160, height: 300 },
    });

    expect(answer.openUp).toBe(false);
  });

  it("measures the room below from the band's bottom", () => {
    stubVisualViewport({ offsetTop: 400, height: 300 });
    const answer = open({
      trigger: { top: 640, bottom: 680, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
    });

    expect(answer.openUp).toBe(true);
  });

  it("flips sideways at the band's left edge, not at zero", () => {
    stubVisualViewport({ offsetLeft: 200, width: 824 });
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 272, right: 300 },
      panel: { width: 160, height: 100 },
    });

    expect(answer.side).toBe("left");
  });

  it("leaves a left-hung panel that the band's right edge still fits", () => {
    stubVisualViewport({ offsetLeft: 200, width: 824 });
    const answer = open({
      trigger: { top: 100, bottom: 128, left: 700, right: 728 },
      panel: { width: 160, height: 100 },
      preferSide: "left",
    });

    expect(answer.side).toBe("left");
  });

  it("flips sideways at the band's right edge", () => {
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
  const TALL_SCROLLER = { top: 100, bottom: 2000, left: 0, right: 1024 };

  it("stops at the fold, not at the frame's own bottom", () => {
    stubVisualViewport({ height: 768 });
    const answer = open({
      trigger: { top: 700, bottom: 740, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
      chain: [{ clips: true, box: TALL_SCROLLER }],
    });

    expect(answer.openUp).toBe(true);
  });

  it("stops at the band's top, not at the frame's own top", () => {
    stubVisualViewport({ offsetTop: 400, height: 400 });
    const answer = open({
      trigger: { top: 440, bottom: 732, left: 300, right: 460 },
      panel: { width: 160, height: 100 },
      chain: [{ clips: true, box: TALL_SCROLLER }],
    });

    expect(answer.openUp).toBe(false);
  });

  it("stops at the band's right edge, not at the frame's own", () => {
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
   * `preferSide` is `left` on purpose: the gated path never assigns, so it
   * is the only state in which the hook's initial answer is observable.
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
  it("re-derives when the keyboard leaves and gives the room back", () => {
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
