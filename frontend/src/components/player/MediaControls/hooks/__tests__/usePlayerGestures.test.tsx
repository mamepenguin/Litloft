import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import type { MediaController } from "@/lib/mediaController";
import type { PointerMode } from "@/components/player/hooks/usePointerMode";
import {
  usePlayerGestures,
  type UsePlayerGesturesOptions,
} from "../usePlayerGestures";

/**
 * jsdom implements no PointerEvent, and testing-library's
 * `fireEvent.pointerDown` silently drops every coordinate when it falls
 * back to a plain Event. Building the event by hand is the only way to
 * deliver clientX — verified to reach both React synthetic handlers and
 * window listeners.
 */
function firePointer(
  target: EventTarget,
  type: string,
  init: Record<string, unknown> = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    pointerType: "touch",
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

const FRAME_WIDTH = 400;
const LEFT_X = 100;
const RIGHT_X = 300;

function makeMc(overrides: Partial<MediaController> = {}): MediaController {
  return {
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: vi.fn().mockReturnValue(40),
    getDuration: vi.fn().mockReturnValue(200),
    isPaused: vi.fn().mockReturnValue(false),
    isMuted: vi.fn().mockReturnValue(false),
    getVolume: vi.fn().mockReturnValue(1),
    setVolume: vi.fn(),
    getPlaybackRate: vi.fn().mockReturnValue(1),
    setPlaybackRate: vi.fn(),
    getBufferedFraction: vi.fn().mockReturnValue(0.25),
    ...overrides,
  };
}

const callbacks = {
  onToggleControls: vi.fn(),
  onHideControls: vi.fn(),
  onTogglePlay: vi.fn(),
  onToggleFullscreen: vi.fn(),
};

function Harness(props: UsePlayerGesturesOptions) {
  const gestures = usePlayerGestures(props);
  return (
    <div data-testid="overlay" {...gestures.handlers}>
      <span data-testid="skip">
        {gestures.skip ? `${gestures.skip.side}:${gestures.skip.seconds}` : "none"}
      </span>
      <span data-testid="boost">{String(gestures.boosting)}</span>
    </div>
  );
}

function setup(overrides: Partial<UsePlayerGesturesOptions> = {}) {
  const mc = overrides.mc === undefined ? makeMc() : overrides.mc;
  const options: UsePlayerGesturesOptions = {
    mc,
    mode: "coarse" as PointerMode,
    interactive: true,
    interrupted: false,
    duration: 200,
    preferredRate: 1,
    ...callbacks,
    ...overrides,
  };
  const utils = render(<Harness {...options} />);
  const overlay = utils.getByTestId("overlay");
  // jsdom gives every element a zero-sized rect, so the left/right
  // split would collapse without an explicit one.
  Object.defineProperty(overlay, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: FRAME_WIDTH,
      height: 200,
      right: FRAME_WIDTH,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  return { ...utils, overlay, mc: mc as MediaController };
}

/** A press and release at one spot, with no travel in between. */
function tap(overlay: HTMLElement, x: number) {
  firePointer(overlay, "pointerdown", { clientX: x, clientY: 50 });
  firePointer(window, "pointerup", { clientX: x, clientY: 50 });
}

function skipLabel(getByTestId: (id: string) => HTMLElement): string {
  return getByTestId("skip").textContent ?? "";
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(callbacks).forEach((fn) => fn.mockClear());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePlayerGestures long press", () => {
  it("boosts to 2x after holding", () => {
    const { mc, overlay, getByTestId } = setup();
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mc.setPlaybackRate).toHaveBeenCalledWith(2);
    expect(getByTestId("boost").textContent).toBe("true");
  });

  it("does not boost before the hold completes", () => {
    const { mc, overlay } = setup();
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(mc.setPlaybackRate).not.toHaveBeenCalled();
  });

  it("restores the preferred rate on release", () => {
    const { mc, overlay, getByTestId } = setup({ preferredRate: 1.25 });
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    firePointer(window, "pointerup", { clientX: RIGHT_X });
    expect(mc.setPlaybackRate).toHaveBeenLastCalledWith(1.25);
    expect(getByTestId("boost").textContent).toBe("false");
  });

  it("never writes the boost through the persisted preference", () => {
    // Writing 2x to localStorage would leave every later file playing
    // at double speed because someone held the screen once.
    const { overlay } = setup();
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    firePointer(window, "pointerup", { clientX: RIGHT_X });
    expect(window.localStorage.getItem("video-share-playback-rate")).toBeNull();
  });

  it("cancels when the finger travels before the hold completes", () => {
    const { mc, overlay } = setup();
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X, clientY: 50 });
    firePointer(window, "pointermove", { clientX: RIGHT_X, clientY: 90 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mc.setPlaybackRate).not.toHaveBeenCalled();
  });

  it("keeps the boost when the finger drifts after it engaged", () => {
    // YouTube holds the speed while the finger wanders; letting a few
    // pixels drop it would make the gesture feel broken.
    const { mc, overlay, getByTestId } = setup();
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X, clientY: 50 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    firePointer(window, "pointermove", { clientX: RIGHT_X, clientY: 140 });
    expect(getByTestId("boost").textContent).toBe("true");
    expect(mc.setPlaybackRate).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the player is paused", () => {
    const { mc, overlay } = setup({
      mc: makeMc({ isPaused: vi.fn().mockReturnValue(true) }),
    });
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mc.setPlaybackRate).not.toHaveBeenCalled();
  });

  it("does not treat the release that ended a boost as a tap", () => {
    const { mc, overlay } = setup();
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    firePointer(window, "pointerup", { clientX: RIGHT_X });
    expect(callbacks.onToggleControls).not.toHaveBeenCalled();
    expect(mc.seek).not.toHaveBeenCalled();
  });

  it("restores the rate when the gesture is cancelled outright", () => {
    const { mc, overlay, getByTestId } = setup({ preferredRate: 0.75 });
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    firePointer(window, "pointercancel", { clientX: RIGHT_X });
    expect(mc.setPlaybackRate).toHaveBeenLastCalledWith(0.75);
    expect(getByTestId("boost").textContent).toBe("false");
  });
});

describe("usePlayerGestures double tap", () => {
  it("skips forward on two taps on the right", () => {
    const { mc, overlay } = setup();
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).toHaveBeenCalledWith(50);
  });

  it("skips back on two taps on the left", () => {
    const { mc, overlay } = setup();
    tap(overlay, LEFT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, LEFT_X);
    expect(mc.seek).toHaveBeenCalledWith(30);
  });

  it("seeks from the live playhead, not a stale rendered value", () => {
    const getCurrentTime = vi.fn().mockReturnValue(40);
    const { mc, overlay } = setup({ mc: makeMc({ getCurrentTime }) });
    tap(overlay, RIGHT_X);
    getCurrentTime.mockReturnValue(41);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).toHaveBeenCalledWith(51);
  });

  it("gets the bar out of the way once a skip takes over", () => {
    const { overlay } = setup();
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(callbacks.onHideControls).toHaveBeenCalled();
  });

  it("shows the skip feedback and clears it after the window closes", () => {
    const { overlay, getByTestId } = setup();
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(skipLabel(getByTestId)).toBe("forward:10");
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(skipLabel(getByTestId)).toBe("none");
  });

  it("does not skip when the two taps land on opposite sides", () => {
    const { mc, overlay } = setup();
    tap(overlay, LEFT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).not.toHaveBeenCalled();
  });

  it("does not skip when the second tap arrives too late", () => {
    const { mc, overlay } = setup();
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).not.toHaveBeenCalled();
  });
});

describe("usePlayerGestures skip accumulation", () => {
  function beginSkip(overlay: HTMLElement, x: number) {
    tap(overlay, x);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, x);
  }

  it("adds ten seconds per further tap", () => {
    const { mc, overlay, getByTestId } = setup();
    beginSkip(overlay, RIGHT_X);
    expect(skipLabel(getByTestId)).toBe("forward:10");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    tap(overlay, RIGHT_X);
    expect(skipLabel(getByTestId)).toBe("forward:20");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    tap(overlay, RIGHT_X);
    expect(skipLabel(getByTestId)).toBe("forward:30");
    expect(mc.seek).toHaveBeenCalledTimes(3);
  });

  it("moves ten seconds at a time even while the label accumulates", () => {
    // The label is a running total; each tap is still a single ten
    // second hop from wherever the playhead now is.
    const getCurrentTime = vi.fn().mockReturnValue(40);
    const { mc, overlay } = setup({ mc: makeMc({ getCurrentTime }) });
    beginSkip(overlay, RIGHT_X);
    expect(mc.seek).toHaveBeenLastCalledWith(50);
    getCurrentTime.mockReturnValue(50);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).toHaveBeenLastCalledWith(60);
  });

  it("flips direction and restarts the count on the opposite side", () => {
    const { mc, overlay, getByTestId } = setup();
    beginSkip(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    tap(overlay, RIGHT_X);
    expect(skipLabel(getByTestId)).toBe("forward:20");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    tap(overlay, LEFT_X);
    expect(skipLabel(getByTestId)).toBe("back:10");
    expect(mc.seek).toHaveBeenLastCalledWith(30);
  });

  it("keeps the window open from the most recent tap", () => {
    const { overlay, getByTestId } = setup();
    beginSkip(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    tap(overlay, RIGHT_X);
    expect(skipLabel(getByTestId)).toBe("forward:20");
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(skipLabel(getByTestId)).toBe("forward:20");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(skipLabel(getByTestId)).toBe("none");
  });

  it("needs a fresh double tap after the window lapses", () => {
    const { mc, overlay } = setup();
    beginSkip(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).toHaveBeenCalledTimes(1);
    expect(callbacks.onToggleControls).toHaveBeenCalled();
  });
});

describe("usePlayerGestures seek bounds", () => {
  it("stops at the end of the video", () => {
    const { mc, overlay } = setup({
      mc: makeMc({ getCurrentTime: vi.fn().mockReturnValue(195) }),
      duration: 200,
    });
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).toHaveBeenCalledWith(200);
  });

  it("stops at the start of the video", () => {
    const { mc, overlay } = setup({
      mc: makeMc({ getCurrentTime: vi.fn().mockReturnValue(4) }),
    });
    tap(overlay, LEFT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, LEFT_X);
    expect(mc.seek).toHaveBeenCalledWith(0);
  });

  it("still skips forward when the duration is unknown", () => {
    const { mc, overlay } = setup({ duration: 0 });
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).toHaveBeenCalledWith(50);
  });
});

describe("usePlayerGestures single tap", () => {
  it("toggles the controls", () => {
    const { overlay } = setup();
    tap(overlay, RIGHT_X);
    expect(callbacks.onToggleControls).toHaveBeenCalledTimes(1);
  });

  it("does not seek", () => {
    const { mc, overlay } = setup();
    tap(overlay, RIGHT_X);
    expect(mc.seek).not.toHaveBeenCalled();
  });

  it("is dropped when the finger travelled", () => {
    const { overlay } = setup();
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X, clientY: 50 });
    firePointer(window, "pointermove", { clientX: RIGHT_X, clientY: 100 });
    firePointer(window, "pointerup", { clientX: RIGHT_X, clientY: 100 });
    expect(callbacks.onToggleControls).not.toHaveBeenCalled();
  });
});

describe("usePlayerGestures gating", () => {
  it("stands down entirely while the overlay is not interactive", () => {
    // An ad or the end screen owns the frame; touching anything here
    // would cover YouTube's own UI.
    const { mc, overlay } = setup({ interactive: false });
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).not.toHaveBeenCalled();
    expect(callbacks.onToggleControls).not.toHaveBeenCalled();
  });

  it("does not skip while the clock belongs to an ad", () => {
    const { mc, overlay } = setup({ interrupted: true });
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    tap(overlay, RIGHT_X);
    expect(mc.seek).not.toHaveBeenCalled();
  });

  it("still surfaces the controls during an ad", () => {
    const { overlay } = setup({ interrupted: true });
    tap(overlay, RIGHT_X);
    expect(callbacks.onToggleControls).toHaveBeenCalled();
  });

  it("does nothing without a controller", () => {
    const { overlay } = setup({ mc: null });
    expect(() => {
      tap(overlay, RIGHT_X);
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
  });

  it("stays inert when the input mode is unknown", () => {
    // jsdom and pre-media-query browsers answer neither pointer query;
    // guessing would arm gestures nobody can perform.
    const { mc, overlay } = setup({ mode: "unknown" });
    tap(overlay, RIGHT_X);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(callbacks.onToggleControls).not.toHaveBeenCalled();
    expect(mc.setPlaybackRate).not.toHaveBeenCalled();
  });

  it("ignores touch gestures on a fine pointer", () => {
    const { mc, overlay } = setup({ mode: "fine" });
    firePointer(overlay, "pointerdown", { clientX: RIGHT_X });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mc.setPlaybackRate).not.toHaveBeenCalled();
  });
});

describe("usePlayerGestures mouse", () => {
  it("toggles playback on a single click", () => {
    const { overlay } = setup({ mode: "fine" });
    fireEvent.click(overlay, { detail: 1 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callbacks.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("ignores programmatic clicks", () => {
    // HTMLElement.click() reports detail 0; acting on it would let any
    // stray script drive playback.
    const { overlay } = setup({ mode: "fine" });
    overlay.click();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callbacks.onTogglePlay).not.toHaveBeenCalled();
  });

  it("goes fullscreen on a double click without pausing on the way", () => {
    // Two clicks arrive before dblclick; acting on both would pause and
    // resume, which the YouTube player shows as a visible hitch.
    const { overlay } = setup({ mode: "fine" });
    fireEvent.click(overlay, { detail: 1 });
    fireEvent.click(overlay, { detail: 2 });
    fireEvent.dblClick(overlay, { detail: 2 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callbacks.onTogglePlay).not.toHaveBeenCalled();
    expect(callbacks.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("does not toggle playback on a coarse pointer", () => {
    const { overlay } = setup({ mode: "coarse" });
    fireEvent.click(overlay, { detail: 1 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callbacks.onTogglePlay).not.toHaveBeenCalled();
  });

  it("stands down while the overlay is not interactive", () => {
    const { overlay } = setup({ mode: "fine", interactive: false });
    fireEvent.click(overlay, { detail: 1 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(callbacks.onTogglePlay).not.toHaveBeenCalled();
  });
});
