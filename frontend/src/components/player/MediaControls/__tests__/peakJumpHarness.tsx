import { act, fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";

/**
 * Test contract for the jump control (SPEC-CORE-151): the button is found by
 * its accessible name, the label by its text inside a `role="status"` region.
 */
export const JUMP = "Jump to most watched";

/**
 * Five spots at s = 5, D = 100, ordered 50, 25, 10, 75, 85:
 * - 50: segments 10-12 at levels 2, 3, 2 (one spot across the 2/3 change), 15 s, strength 3;
 * - 25: segment 5 at level 3, 5 s;
 * - 10: segments 2-3 at level 2, 10 s, cut from 25 by segment 4 having no row;
 * - 75 and 85: segments 15 and 17 at level 2, cut by segment 16 at level 1;
 * - segment 19 at level 1 is no spot.
 */
export const FIVE_SPOTS = {
  2: 10,
  3: 10,
  5: 15,
  10: 10,
  11: 15,
  12: 10,
  15: 10,
  16: 5,
  17: 10,
  19: 5,
};
export const FIVE_ORDER = [50, 25, 10, 75, 85];

export function jumpButton(): HTMLElement | null {
  return screen.queryByRole("button", { name: JUMP });
}

export function pressJump() {
  const button = jumpButton();
  if (!button) throw new Error("the jump button is not rendered");
  act(() => {
    fireEvent.click(button);
  });
}

const LABEL = /^Most watched (\d+) \/ (\d+)$/;

/** The label's text, or null when none is on screen. */
export function label(): string | null {
  const el = screen.queryByText(LABEL);
  return el ? el.textContent : null;
}

export function labelElement(): HTMLElement | null {
  return screen.queryByText(LABEL);
}

export function lastSeek(mc: { seek: unknown }): number | undefined {
  const calls = vi.mocked(mc.seek as (s: number) => void).mock.calls;
  return calls.length ? calls[calls.length - 1][0] : undefined;
}

// ---------------------------------------------------------------- frame width

let frameWidth = 900;
let resizeCallbacks: Array<() => void> = [];
const realRect = HTMLElement.prototype.getBoundingClientRect;
let rectSpy: { mockRestore: () => void } | null = null;

/** Undoes `installFrameWidth` / `installEveryWidth`. */
export function restoreWidths() {
  rectSpy?.mockRestore();
  rectSpy = null;
}

function rect(width: number): DOMRect {
  const height = (width * 9) / 16;
  return {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Makes the harness frame (`data-testid="frame"`) report `width`, and
 * replaces ResizeObserver so `resizeFrame` can announce a change.
 */
export function installFrameWidth(width: number) {
  frameWidth = width;
  resizeCallbacks = [];
  restoreWidths();
  rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset.testid === "frame") return rect(frameWidth);
    return realRect.call(this);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

export function resizeFrame(width: number) {
  act(() => {
    frameWidth = width;
    resizeCallbacks.forEach((callback) => callback());
  });
}

/** Every element reports `width`: for players whose frame the test does not own. */
export function installEveryWidth(width: number) {
  restoreWidths();
  rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() =>
    rect(width),
  );
}

export function layoutOf(): string {
  for (const [id, name] of [
    ["touch-controls-root", "touch"],
    ["compact-controls-root", "compact"],
    ["control-bar", "pointer"],
  ]) {
    if (document.querySelector(`[data-testid="${id}"]`)) return name;
  }
  throw new Error("no control layout rendered");
}

// ---------------------------------------------------------------- touch

export const WITHIN = 50;
export const FRAME_WIDTH = 400;
export const RIGHT_X = 300;

function overlay(): HTMLElement {
  const el = document.querySelector<HTMLElement>("[data-player-gestures]");
  if (!el) throw new Error("gesture overlay not found");
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(FRAME_WIDTH),
  });
  return el;
}

function firePointer(target: EventTarget, type: string, init: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: 0, clientY: 0, pointerId: 1, pointerType: "touch", ...init });
  act(() => {
    target.dispatchEvent(event);
  });
}

export function tap(x = RIGHT_X) {
  firePointer(overlay(), "pointerdown", { clientX: x, clientY: 50 });
  firePointer(window, "pointerup", { clientX: x, clientY: 50 });
}

const HIDDEN_CLASSES = ["opacity-0", "invisible", "hidden"];

export function drawn(el: HTMLElement | null): boolean {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (HIDDEN_CLASSES.some((c) => node!.classList.contains(c))) return false;
  }
  return el !== null;
}

export function takesTouches(el: HTMLElement | null): boolean {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.classList.contains("pointer-events-none")) return false;
    if (node.classList.contains("pointer-events-auto")) return true;
  }
  return false;
}

function live(el: HTMLElement | null): boolean {
  return drawn(el) && takesTouches(el);
}

export function chrome(): string {
  const top = document.querySelector<HTMLElement>('[data-testid="top-controls"]');
  const bottom = document.querySelector<HTMLElement>('[data-testid="bottom-controls"]');
  const centre = Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid="transport"] button'),
  );
  const t = live(top);
  const b = live(bottom);
  const c = centre.some(live);
  if (t && b && c) return "whole";
  if (b && !t && !c) return "bottom-only";
  if (!t && !b && !c) return "hidden";
  return `mixed(top=${t},bottom=${b},centre=${c})`;
}

/** Snapshot of everything in Web Storage. */
export function storageSnapshot(): string {
  const dump = (s: Storage) => {
    const out: Record<string, string | null> = {};
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i)!;
      out[key] = s.getItem(key);
    }
    return out;
  };
  return JSON.stringify({ local: dump(localStorage), session: dump(sessionStorage) });
}
