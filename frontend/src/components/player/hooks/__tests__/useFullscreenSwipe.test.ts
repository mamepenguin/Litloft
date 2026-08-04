import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen } from "../useFullscreen";

// jsdom does not construct TouchEvent, so build the minimal shape the
// hook reads and dispatch it as a plain bubbling Event.
function touchEvent(
  type: "touchstart" | "touchend" | "touchcancel",
  points: Array<{ x: number; y: number }>,
): Event {
  const event = new Event(type, { bubbles: true });
  const list = points.map(({ x, y }) => ({ clientX: x, clientY: y }));
  Object.defineProperty(event, "touches", {
    value: type === "touchstart" ? list : [],
  });
  Object.defineProperty(event, "changedTouches", { value: list });
  return event;
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

  it("ignores multi-touch gestures", async () => {
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
