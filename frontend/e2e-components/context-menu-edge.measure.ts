/**
 * SPEC-CORE-178 I3: what a `ContextMenu` looks like in every frame it is
 * painted in, read from the page in a `requestAnimationFrame` queued by a
 * mutation observer, so the first frame after it mounts or moves is caught.
 */

import { expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let run = 0;

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
  fullWidth: number;
  fullHeight: number;
  innerWidth: number;
  innerHeight: number;
  opacity: number;
}

export async function openArrangement(page: Page, id: string): Promise<void> {
  await page.goto(`${FIXTURE}?run=${++run}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", id);
}

/** Starts recording a frame for every mutation while a menu is on the page. */
export async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    type W = Window & { __menuFrames?: unknown[]; __menuObserver?: MutationObserver };
    const w = window as W;
    w.__menuObserver?.disconnect();
    w.__menuFrames = [];

    const menuBox = (): HTMLElement | null => {
      const row = document.querySelector<HTMLElement>('[role="menuitem"]');
      if (!row) return null;
      for (let el: HTMLElement | null = row; el; el = el.parentElement) {
        if (el.hasAttribute("data-dismiss-scrim")) break;
        if (getComputedStyle(el).position === "fixed") return el;
      }
      return row.parentElement;
    };

    const record = () => {
      const menu = menuBox();
      if (!menu) return;
      const box = menu.getBoundingClientRect();
      let opacity = 1;
      for (let el: HTMLElement | null = menu; el; el = el.parentElement) {
        opacity *= Number(getComputedStyle(el).opacity);
      }
      w.__menuFrames!.push({
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        fullWidth: menu.offsetWidth,
        fullHeight: menu.offsetHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        opacity,
      });
    };

    w.__menuObserver = new MutationObserver(() => {
      requestAnimationFrame(record);
    });
    w.__menuObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  });
}

export async function recordedFrames(page: Page): Promise<Frame[]> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  return page.evaluate(() => (window as Window & { __menuFrames?: Frame[] }).__menuFrames ?? []);
}

/** Where §1 puts the menu's top-left corner for a press at (x, y). */
export function expectedCorner(frame: Frame, x: number, y: number): { left: number; top: number } {
  return {
    left: Math.max(8, Math.min(x, frame.innerWidth - frame.fullWidth - 8)),
    top: Math.max(8, Math.min(y, frame.innerHeight - frame.fullHeight - 8)),
  };
}

/** Every recorded frame is the menu at full size, full opacity and its clamped place. */
export function expectEveryFrameFinal(frames: Frame[], x: number, y: number): void {
  expect(frames.length, "no frame with the menu in it was recorded").toBeGreaterThan(0);
  frames.forEach((frame, index) => {
    const corner = expectedCorner(frame, x, y);
    const seen = {
      left: Math.round(frame.left),
      top: Math.round(frame.top),
      width: Math.round(frame.width),
      height: Math.round(frame.height),
      opacity: frame.opacity,
    };
    expect(seen, `frame ${index}`).toEqual({
      left: Math.round(corner.left),
      top: Math.round(corner.top),
      width: frame.fullWidth,
      height: frame.fullHeight,
      opacity: 1,
    });
  });
}

/**
 * A touch held at a point, through CDP: `page.touchscreen` has only `tap`, and
 * `useContextMenu` answers a 500 ms hold. The touch is still down when this
 * returns; call the returned function to lift it.
 */
export async function holdTouch(
  page: Page,
  x: number,
  y: number,
  holdMs: number,
): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(holdMs);
  return async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  };
}
