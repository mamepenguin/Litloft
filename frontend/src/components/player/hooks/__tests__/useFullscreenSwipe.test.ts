import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen } from "../useFullscreen";

// jsdom does not construct TouchEvent, so build the minimal shape the
// hook reads and dispatch it as a plain bubbling Event.
function touchEvent(
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  points: Array<{ x: number; y: number }>,
): Event {
  const event = new Event(type, { bubbles: true });
  const list = points.map(({ x, y }) => ({ clientX: x, clientY: y }));
  // `touches` is what is still down; by touchend that is nothing.
  Object.defineProperty(event, "touches", {
    value: type === "touchstart" || type === "touchmove" ? list : [],
  });
  Object.defineProperty(event, "changedTouches", { value: list });
  return event;
}

/** A two-finger gesture that opens or closes by the given distances. */
async function pinch(from: number, to: number, origin: Element) {
  await act(async () => {
    origin.dispatchEvent(
      touchEvent("touchstart", [
        { x: 200 - from / 2, y: 200 },
        { x: 200 + from / 2, y: 200 },
      ]),
    );
    origin.dispatchEvent(
      touchEvent("touchmove", [
        { x: 200 - to / 2, y: 200 },
        { x: 200 + to / 2, y: 200 },
      ]),
    );
    origin.dispatchEvent(touchEvent("touchend", [{ x: 200 - to / 2, y: 200 }]));
  });
}

/** Like `swipe`, but awaits the async path into fullscreen. */
async function swipeAsync(
  from: { x: number; y: number },
  to: { x: number; y: number },
  origin: Element,
) {
  await act(async () => {
    origin.dispatchEvent(touchEvent("touchstart", [from]));
    origin.dispatchEvent(touchEvent("touchend", [to]));
  });
}

function swipe(
  from: { x: number; y: number },
  to: { x: number; y: number },
  origin: Element,
) {
  act(() => {
    origin.dispatchEvent(touchEvent("touchstart", [from]));
    origin.dispatchEvent(touchEvent("touchend", [to]));
  });
}

let frame: HTMLDivElement;
let controlBar: HTMLDivElement;
let videoArea: HTMLDivElement;

const COARSE = "(pointer: coarse)";

function installMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === COARSE,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

async function enterPseudo() {
  const view = renderHook(() =>
    useFullscreen({ frameRef: { current: frame }, autoRotateEnabled: false }),
  );
  await act(async () => view.result.current.toggle());
  expect(view.result.current.isPseudo).toBe(true);
  return view;
}

beforeEach(() => {
  installMatchMedia();
  window.scrollTo = vi.fn();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => null,
  });
  frame = document.createElement("div");
  // No requestFullscreen: forces the pseudo path, like an iPhone.
  Object.defineProperty(frame, "requestFullscreen", {
    configurable: true,
    value: undefined,
  });
  videoArea = document.createElement("div");
  controlBar = document.createElement("div");
  controlBar.setAttribute("data-player-controls", "");
  const seekBar = document.createElement("input");
  controlBar.appendChild(seekBar);
  frame.append(videoArea, controlBar);
  document.body.appendChild(frame);
  window.history.replaceState(null, "");
});

afterEach(() => {
  frame.remove();
  vi.restoreAllMocks();
});

describe("useFullscreen — swipe to dismiss", () => {
  it("leaves fullscreen on a firm downward swipe", async () => {
    const { result } = await enterPseudo();
    swipe({ x: 100, y: 100 }, { x: 105, y: 220 }, videoArea);
    expect(result.current.isPseudo).toBe(false);
  });

  it("ignores a short drag", async () => {
    const { result } = await enterPseudo();
    swipe({ x: 100, y: 100 }, { x: 100, y: 150 }, videoArea);
    expect(result.current.isPseudo).toBe(true);
  });

  it("ignores an upward swipe", async () => {
    const { result } = await enterPseudo();
    swipe({ x: 100, y: 300 }, { x: 100, y: 100 }, videoArea);
    expect(result.current.isPseudo).toBe(true);
  });

  it("ignores a mostly horizontal swipe", async () => {
    const { result } = await enterPseudo();
    swipe({ x: 100, y: 100 }, { x: 400, y: 200 }, videoArea);
    expect(result.current.isPseudo).toBe(true);
  });

  it("ignores a gesture that starts on the control bar", async () => {
    // Dragging the seek bar travels downward as often as not; treating
    // that as a dismiss would make scrubbing impossible.
    const { result } = await enterPseudo();
    const seekBar = controlBar.firstElementChild!;
    swipe({ x: 100, y: 100 }, { x: 105, y: 260 }, seekBar);
    expect(result.current.isPseudo).toBe(true);
  });

  it("does not read a two-finger drag as a dismiss", async () => {
    // Two fingers is a pinch, judged on how far apart they end up
    // rather than where they travelled.
    const { result } = await enterPseudo();
    act(() => {
      videoArea.dispatchEvent(
        touchEvent("touchstart", [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ]),
      );
      videoArea.dispatchEvent(touchEvent("touchend", [{ x: 105, y: 260 }]));
    });
    expect(result.current.isPseudo).toBe(true);
  });

  it("forgets the gesture when the system cancels it", async () => {
    const { result } = await enterPseudo();
    act(() => {
      videoArea.dispatchEvent(touchEvent("touchstart", [{ x: 100, y: 100 }]));
      videoArea.dispatchEvent(touchEvent("touchcancel", [{ x: 100, y: 100 }]));
      videoArea.dispatchEvent(touchEvent("touchend", [{ x: 105, y: 260 }]));
    });
    expect(result.current.isPseudo).toBe(true);
  });

  it("does nothing outside fullscreen", async () => {
    const view = renderHook(() =>
      useFullscreen({ frameRef: { current: frame }, autoRotateEnabled: false }),
    );
    swipe({ x: 100, y: 100 }, { x: 105, y: 260 }, videoArea);
    expect(view.result.current.isPseudo).toBe(false);
    expect(view.result.current.isFullscreen).toBe(false);
  });
});

describe("useFullscreen — suppressed swipes", () => {
  async function enterPseudoWith(suppressSwipe: boolean) {
    const view = renderHook(
      (props: { suppressSwipe: boolean }) =>
        useFullscreen({
          frameRef: { current: frame },
          autoRotateEnabled: false,
          suppressSwipe: props.suppressSwipe,
        }),
      { initialProps: { suppressSwipe } },
    );
    await act(async () => view.result.current.toggle());
    expect(view.result.current.isPseudo).toBe(true);
    return view;
  }

  it("holds the frame while a gesture owns the video", async () => {
    // A long press for the speed boost keeps the finger planted; the
    // drift that comes with it must not be read as "put this away".
    const { result } = await enterPseudoWith(true);
    swipe({ x: 100, y: 100 }, { x: 105, y: 260 }, videoArea);
    expect(result.current.isPseudo).toBe(true);
  });

  it("dismisses again once the gesture lets go", async () => {
    const view = await enterPseudoWith(true);
    swipe({ x: 100, y: 100 }, { x: 105, y: 260 }, videoArea);
    expect(view.result.current.isPseudo).toBe(true);
    view.rerender({ suppressSwipe: false });
    swipe({ x: 100, y: 100 }, { x: 105, y: 260 }, videoArea);
    expect(view.result.current.isPseudo).toBe(false);
  });

  it("dismisses normally when nothing is suppressing", async () => {
    const { result } = await enterPseudoWith(false);
    swipe({ x: 100, y: 100 }, { x: 105, y: 260 }, videoArea);
    expect(result.current.isPseudo).toBe(false);
  });
});

describe("useFullscreen — gestures into fullscreen", () => {
  function renderInPage() {
    return renderHook(() =>
      useFullscreen({ frameRef: { current: frame }, autoRotateEnabled: false }),
    );
  }

  it("opens on a firm upward swipe", async () => {
    const { result } = renderInPage();
    await swipeAsync({ x: 100, y: 300 }, { x: 105, y: 180 }, videoArea);
    expect(result.current.isFullscreen).toBe(true);
  });

  it("ignores a short upward drag", async () => {
    const { result } = renderInPage();
    await swipeAsync({ x: 100, y: 300 }, { x: 100, y: 260 }, videoArea);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("ignores a mostly horizontal drag", async () => {
    const { result } = renderInPage();
    await swipeAsync({ x: 100, y: 300 }, { x: 400, y: 200 }, videoArea);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("ignores a gesture that starts on the control bar", async () => {
    // Dragging the seek bar travels upward as often as not.
    const { result } = renderInPage();
    const seekBar = controlBar.firstElementChild!;
    await swipeAsync({ x: 100, y: 300 }, { x: 105, y: 180 }, seekBar);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("opens when two fingers spread apart", async () => {
    const { result } = renderInPage();
    await pinch(100, 200, videoArea);
    expect(result.current.isFullscreen).toBe(true);
  });

  it("ignores a pinch too small to be deliberate", async () => {
    const { result } = renderInPage();
    await pinch(100, 110, videoArea);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("closes when two fingers come together", async () => {
    const view = await enterPseudo();
    await pinch(200, 100, videoArea);
    expect(view.result.current.isPseudo).toBe(false);
  });

  it("ignores a two-finger tap that goes nowhere", async () => {
    const { result } = renderInPage();
    await pinch(150, 150, videoArea);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("stays put while a gesture already owns the video", async () => {
    // A long press for the speed boost keeps fingers on the frame.
    const view = renderHook(
      (props: { suppressSwipe: boolean }) =>
        useFullscreen({
          frameRef: { current: frame },
          autoRotateEnabled: false,
          suppressSwipe: props.suppressSwipe,
        }),
      { initialProps: { suppressSwipe: true } },
    );
    await swipeAsync({ x: 100, y: 300 }, { x: 105, y: 180 }, videoArea);
    expect(view.result.current.isFullscreen).toBe(false);
  });
});
