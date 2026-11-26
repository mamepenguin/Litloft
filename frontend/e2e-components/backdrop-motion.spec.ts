/**
 * SPEC-CORE-181 I4 — a dim drawn with `animate-backdrop-in` runs one opacity
 * animation from 0 to 1 over 150ms, and none to speak of under reduced
 * motion. Read off the animation the browser is running, not the class name.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function open(page: Page): Promise<void> {
  await page.goto(`${FIXTURE}?run=${++navigation}#backdrop-in`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "backdrop-in");
}

interface Reading {
  found: boolean;
  count: number;
  playState: string | null;
  properties: string[];
  duration: number | null;
  opacityAtStart: string | null;
  opacityHalfway: string | null;
  opacityAtEnd: string | null;
}

/**
 * Mounts the dim and reads it in the frame it first appears, so a 150ms
 * animation is still running when it is asked about.
 */
async function readDim(page: Page, trigger: string, dim: string): Promise<Reading> {
  return page.evaluate(
    async ({ trigger, dim }) => {
      (document.querySelector(trigger) as HTMLElement).click();
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const el = document.querySelector(dim) as HTMLElement | null;
      if (!el) {
        return {
          found: false,
          count: 0,
          playState: null,
          properties: [],
          duration: null,
          opacityAtStart: null,
          opacityHalfway: null,
          opacityAtEnd: null,
        };
      }
      const animations = el.getAnimations();
      const reading = {
        found: true,
        count: animations.length,
        playState: null as string | null,
        properties: [] as string[],
        duration: null as number | null,
        opacityAtStart: null as string | null,
        opacityHalfway: null as string | null,
        opacityAtEnd: null as string | null,
      };
      if (animations.length !== 1) return reading;
      const animation = animations[0];
      const effect = animation.effect as KeyframeEffect;
      reading.playState = animation.playState;
      const ignored = new Set(["offset", "computedOffset", "easing", "composite"]);
      reading.properties = [
        ...new Set(
          effect
            .getKeyframes()
            .flatMap((frame) => Object.keys(frame).filter((key) => !ignored.has(key))),
        ),
      ].sort();
      const duration = Number(effect.getComputedTiming().duration);
      reading.duration = duration;
      animation.pause();
      animation.currentTime = 0;
      reading.opacityAtStart = getComputedStyle(el).opacity;
      animation.currentTime = duration / 2;
      reading.opacityHalfway = getComputedStyle(el).opacity;
      animation.currentTime = duration;
      reading.opacityAtEnd = getComputedStyle(el).opacity;
      return reading;
    },
    { trigger, dim },
  );
}

const DIMS = [
  { name: "an element drawn with the utility", trigger: "#open-bare", dim: "#bare-dim" },
  { name: "the phone menu scrim (MENU_SCRIM)", trigger: "#open-menu", dim: "[data-dismiss-scrim]" },
] as const;

for (const { name, trigger, dim } of DIMS) {
  test(`SPEC-CORE-181 I4 ${name} runs one opacity animation from 0 to 1 over 150ms`, async ({
    page,
  }) => {
    await open(page);
    const reading = await readDim(page, trigger, dim);

    expect(reading.found).toBe(true);
    expect(reading.count).toBe(1);
    expect(reading.playState).toBe("running");
    expect(reading.properties).toEqual(["opacity"]);
    expect(reading.duration).toBe(150);
    expect(reading.opacityAtStart).toBe("0");
    expect(Number(reading.opacityHalfway)).toBeGreaterThan(0);
    expect(Number(reading.opacityHalfway)).toBeLessThan(1);
    expect(reading.opacityAtEnd).toBe("1");
  });

  test(`SPEC-CORE-181 I4 ${name} runs it in under 1ms under reduced motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const reading = await readDim(page, trigger, dim);

    expect(reading.found).toBe(true);
    expect(reading.count).toBe(1);
    expect(reading.properties).toEqual(["opacity"]);
    expect(reading.duration).not.toBeNull();
    expect(reading.duration!).toBeLessThan(1);
  });
}
