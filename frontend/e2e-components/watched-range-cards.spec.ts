/**
 * SPEC-CORE-141 D4, D5: the real FileCard and VideoCard bars with watched
 * ranges, beside the same cards with none, in both themes.
 * SPEC-CORE-152 D6: a finished card's bar on the same cards.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const RANGES = [
  [0, 15],
  [25, 30],
  [95, 100],
] as const;
const POSITION = 40;
const DURATION = 100;

let run = 0;

async function open(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.goto(`${FIXTURE}?run=${++run}#watched-range-cards`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
}

interface CardMeasure {
  track: { x: number; y: number; width: number; height: number; background: string };
  fills: Array<{ x: number; width: number; y: number; height: number; background: string }>;
  tick: null | {
    x: number;
    y: number;
    width: number;
    height: number;
    background: string;
    topRadius: number;
    bottomRadius: number;
    outline: string;
  };
}

/**
 * The track is the fill's parent. A card with ranges marks its fills
 * `watched-range`; a card without them draws today's single inline-width fill.
 */
function measureCard(page: Page, which: string): Promise<CardMeasure> {
  return page.evaluate((caseName) => {
    const card = document.querySelector(`[data-case="${caseName}"]`)!;
    let fills = Array.from(card.querySelectorAll<HTMLElement>('[data-testid="watched-range"]'));
    if (fills.length === 0) {
      fills = Array.from(card.querySelectorAll<HTMLElement>('[style*="width"]'));
    }
    if (fills.length === 0) throw new Error(`${caseName} draws no fill`);
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return `${r},${g},${b},${(a / 255).toFixed(2)}`;
    };
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const track = fills[0].parentElement!;
    const tickEl = card.querySelector<HTMLElement>('[data-testid="resume-tick"]');
    let tick = null;
    if (tickEl) {
      const style = getComputedStyle(tickEl);
      const shadow = /^((?:rgba?|oklab|oklch|color)\([^)]*\))\s+0px\s+0px\s+0px\s+([0-9.]+px)/.exec(
        style.boxShadow,
      );
      const outline =
        parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none"
          ? `${style.outlineWidth} ${rgba(style.outlineColor)}`
          : parseFloat(style.borderTopWidth) > 0
            ? `${style.borderTopWidth} ${rgba(style.borderTopColor)}`
            : shadow
              ? `${shadow[2]} ${rgba(shadow[1])}`
              : style.boxShadow;
      tick = {
        ...box(tickEl),
        background: rgba(style.backgroundColor),
        topRadius: parseFloat(style.borderTopLeftRadius),
        bottomRadius: parseFloat(style.borderBottomLeftRadius),
        outline,
      };
    }
    return {
      track: { ...box(track), background: rgba(getComputedStyle(track).backgroundColor) },
      fills: fills
        .map((el) => ({ ...box(el), background: rgba(getComputedStyle(el).backgroundColor) }))
        .sort((a, b) => a.x - b.x),
      tick,
    };
  }, which);
}

for (const theme of ["light", "dark"] as const) {
  for (const [kind, height, trackColour] of [
    ["file", 3, "255,255,255,0.20"],
    ["video", 4, "0,0,0,0.50"],
  ] as const) {
    test(`SPEC-CORE-141 D4 D5 ${kind} card in ${theme}: the ranges are filled on today's track, and the tick marks the resume point`, async ({
      page,
    }) => {
      await open(page, theme);
      const today = await measureCard(page, `${kind}-today`);
      const ranged = await measureCard(page, `${kind}-ranges`);

      expect(today.fills).toHaveLength(1);
      expect(today.tick).toBeNull();

      expect(ranged.track.height).toBeCloseTo(height, 0);
      expect(ranged.track.height).toBeCloseTo(today.track.height, 1);
      expect(ranged.track.background).toBe(trackColour);
      expect(ranged.track.background).toBe(today.track.background);

      expect(ranged.fills).toHaveLength(RANGES.length);
      ranged.fills.forEach((fill, i) => {
        const [start, end] = RANGES[i];
        expect(fill.background).toBe(today.fills[0].background);
        if (kind === "video") expect(fill.background).toBe("255,255,255,1.00");
        expect(Math.abs(fill.x - (ranged.track.x + (start / DURATION) * ranged.track.width))).toBeLessThan(1);
        expect(Math.abs(fill.width - ((end - start) / DURATION) * ranged.track.width)).toBeLessThan(1);
        expect(fill.height).toBeCloseTo(ranged.track.height, 0);
      });

      const tick = ranged.tick!;
      expect(tick, "a resume tick").not.toBeNull();
      expect(tick.width).toBeCloseTo(3, 0);
      expect(tick.height).toBeCloseTo(10, 0);
      const resumeX = ranged.track.x + (POSITION / DURATION) * ranged.track.width;
      expect(Math.abs(tick.x + tick.width / 2 - resumeX)).toBeLessThan(1);
      expect(tick.y + tick.height, "rises from the bottom edge").toBeCloseTo(
        ranged.track.y + ranged.track.height,
        0,
      );
      expect(tick.background).toBe("255,255,255,1.00");
      expect(tick.topRadius).toBeGreaterThan(0);
      expect(tick.bottomRadius).toBe(0);
      expect(tick.outline).toBe("1px 0,0,0,0.50");
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const kind of ["file", "video"] as const) {
    test(`SPEC-CORE-152 D6 ${kind} card in ${theme}: a finished card fills its whole track in the in-progress fill colour, with no tick`, async ({
      page,
    }) => {
      await open(page, theme);
      const counts = await page.evaluate((caseName) => {
        const card = document.querySelector(`[data-case="${caseName}"]`)!;
        return {
          ranges: card.querySelectorAll('[data-testid="watched-range"]').length,
          fills: card.querySelectorAll('[data-testid="progress-fill"]').length,
          widths: card.querySelectorAll('[style*="width"]').length,
          ticks: card.querySelectorAll('[data-testid="resume-tick"]').length,
        };
      }, `${kind}-finished`);
      expect(counts).toEqual({ ranges: 0, fills: 1, widths: 1, ticks: 0 });

      const today = await measureCard(page, `${kind}-today`);
      const ranged = await measureCard(page, `${kind}-ranges`);
      const finished = await measureCard(page, `${kind}-finished`);

      expect(finished.tick).toBeNull();
      expect(finished.fills).toHaveLength(1);
      const fill = finished.fills[0];
      expect(Math.abs(fill.x - finished.track.x)).toBeLessThan(1);
      expect(Math.abs(fill.width - finished.track.width)).toBeLessThan(1);
      expect(fill.height).toBeCloseTo(finished.track.height, 0);

      expect(finished.track.height).toBeCloseTo(ranged.track.height, 1);
      expect(finished.track.height).toBeCloseTo(today.track.height, 1);
      expect(finished.track.background).toBe(ranged.track.background);
      expect(fill.background).toBe(ranged.fills[0].background);
      expect(fill.background).toBe(today.fills[0].background);
    });
  }
}
