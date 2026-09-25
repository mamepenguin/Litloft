/**
 * Carrying a player frame between its slot and the viewport when
 * pseudo-fullscreen opens and closes, in a real browser, for a caller that
 * pins the frame a commit late (the real VideoPlayer) and one that pins it in
 * the same render (the shape of the YouTube embed).
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

declare global {
  interface Window {
    __animations: Animation[];
    __holdAnimations: boolean;
  }
}

const ARRANGEMENTS = [
  { id: "player-transition", sibling: null },
  { id: "player-transition-same-render", sibling: "#sibling-row" },
] as const;

const ORIENTATIONS = [
  { name: "portrait", width: 393, height: 851 },
  { name: "landscape", width: 851, height: 393 },
] as const;

async function arrange(page: Page, id: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    // Pseudo-fullscreen is the fallback for a platform that refuses the
    // real thing; Chromium would otherwise grant it.
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("refused"));
    window.__animations = [];
    window.__holdAnimations = false;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const animation = animate.apply(this, args);
      if (window.__holdAnimations) animation.pause();
      window.__animations.push(animation);
      return animation;
    };
  });
  await page.goto(`${FIXTURE}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", id);
}

const frame = (page: Page) => page.locator("#player [data-testid='player-frame']");
const fullscreenButton = (page: Page) =>
  frame(page).getByRole("button", { name: "Full screen", exact: true });

/**
 * In landscape the frame is taller than the viewport, and clicking the
 * button would scroll the page first; bring it into view before measuring
 * the slot the frame leaves.
 */
async function reachButton(page: Page) {
  await fullscreenButton(page).scrollIntoViewIfNeeded();
}

async function rectOf(page: Page, selector: string): Promise<Box> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/** The frame as drawn: its transformed box, inset by its clip scaled with it. */
async function visibleFrame(page: Page): Promise<Box> {
  return frame(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const scale = r.width / (el as HTMLElement).offsetWidth;
    const clip = getComputedStyle(el).clipPath;
    const numbers = (clip.match(/inset\(([^)]*)\)/)?.[1] ?? "0px")
      .split("round")[0]
      .trim()
      .split(/\s+/)
      .map((v) => parseFloat(v));
    const [top, right = top, bottom = top, left = right] = numbers;
    return {
      left: r.left + left * scale,
      top: r.top + top * scale,
      width: r.width - (left + right) * scale,
      height: r.height - (top + bottom) * scale,
    };
  });
}

function expectSameBox(actual: Box, expected: Box) {
  for (const key of ["left", "top", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(1);
  }
}

async function enter(page: Page) {
  await fullscreenButton(page).click();
}

async function settlesAt(page: Page, box: Box) {
  await expect
    .poll(async () => {
      const drawn = await visibleFrame(page);
      return (["left", "top", "width", "height"] as const).every(
        (key) => Math.abs(drawn[key] - box[key]) <= 1,
      );
    })
    .toBe(true);
  await expect(frame(page)).not.toHaveAttribute("data-fullscreen-moving", /.*/);
}

for (const { id, sibling } of ARRANGEMENTS) {
  for (const orientation of ORIENTATIONS) {
    test.describe(`${id}, ${orientation.name}`, () => {
      test("the first frame of the entry is drawn over the inline slot, and only the picture is reachable", async ({
        page,
      }) => {
        await arrange(page, id, orientation);
        await reachButton(page);
        const inline = await rectOf(page, "#player [data-testid='player-frame']");
        await page.evaluate(() => {
          window.__holdAnimations = true;
        });
        await enter(page);
        await expect(frame(page)).toHaveAttribute("data-fullscreen-moving", "true");

        expectSameBox(await visibleFrame(page), inline);

        const visible = await visibleFrame(page);
        const probe = await frame(page).evaluate(
          (el, [x, y]) => ({
            hitIsFrame: document.elementFromPoint(x, y) === el,
            chrome: Array.from(el.querySelectorAll("[data-player-chrome]")).map(
              (c) => getComputedStyle(c).opacity,
            ),
          }),
          // The middle of what is on screen: in landscape the slot runs off
          // the top of the viewport.
          [
            visible.left + visible.width / 2,
            (Math.max(visible.top, 0) +
              Math.min(visible.top + visible.height, orientation.height)) /
              2,
          ] as const,
        );
        expect(probe).toEqual({ hitIsFrame: true, chrome: probe.chrome.map(() => "0") });
        expect(probe.chrome.length).toBeGreaterThan(0);
      });

      test("the entry settles over the whole viewport, and the exit lands back on the slot", async ({
        page,
      }) => {
        await arrange(page, id, orientation);
        await reachButton(page);
        const inline = await rectOf(page, "#player [data-testid='player-frame']");
        const after = await rectOf(page, "#after-player");
        const row = sibling ? await rectOf(page, sibling) : null;

        await enter(page);
        await settlesAt(page, {
          left: 0,
          top: 0,
          width: orientation.width,
          height: orientation.height,
        });
        const hits = await frame(page).evaluate((el, vp) => {
          const points = {
            header: [vp.width / 2, 20],
            centre: [vp.width / 2, vp.height / 2],
            bottom: [vp.width / 2, vp.height - 4],
          } as const;
          return Object.fromEntries(
            Object.entries(points).map(([name, [x, y]]) => [
              name,
              el.contains(document.elementFromPoint(x, y)),
            ]),
          );
        }, orientation);
        expect(hits).toEqual({ header: true, centre: true, bottom: true });
        expect((await rectOf(page, "#after-player")).top).toBeCloseTo(after.top, 0);
        if (sibling && row) expect((await rectOf(page, sibling)).top).toBeCloseTo(row.top, 0);

        await page.keyboard.press("Escape");
        await expect(frame(page)).not.toHaveAttribute("data-pseudo-fullscreen", /.*/);
        await settlesAt(page, inline);

        expect(await page.locator("html").getAttribute("data-player-fullscreen")).toBeNull();
        expect((await rectOf(page, "#after-player")).top).toBeCloseTo(after.top, 0);
        if (sibling && row) expect((await rectOf(page, sibling)).top).toBeCloseTo(row.top, 0);
      });

      test("reduced motion pins the frame at once and never animates", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await arrange(page, id, orientation);
        await enter(page);
        await expect(frame(page)).toHaveAttribute("data-pseudo-fullscreen", "true");
        expectSameBox(await rectOf(page, "#player [data-testid='player-frame']"), {
          left: 0,
          top: 0,
          width: orientation.width,
          height: orientation.height,
        });
        expect(await page.evaluate(() => window.__animations.length)).toBe(0);
      });
    });
  }
}
