/**
 * The reader's bar on a phone (coarse pointer) and on a desktop (fine
 * pointer), against the real stylesheet.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

export function epubBarCases(): void {
  test("the bar's rows and resting thumb are sized for the pointer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    await page.goto(`${FIXTURE}#epub-bar`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
    const m = await page.evaluate(() => {
      const knob = document.querySelector('[data-testid="epub-position-knob"]')!;
      const buttons = [...document.querySelectorAll('[data-testid="epub-position-bar"] button')];
      return {
        coarse: matchMedia("(pointer: coarse)").matches,
        scrub: document.querySelector("[data-player-scrub]")!.getBoundingClientRect().height,
        controls: document.querySelector('[data-testid="epub-position-line"]')!.parentElement!.getBoundingClientRect().height,
        knobOpacity: getComputedStyle(knob).opacity,
        knobSize: knob.getBoundingClientRect().width,
        buttons: buttons.map((b) => Math.round(b.getBoundingClientRect().height)),
      };
    });
    expect(m.scrub).toBe(m.coarse ? 44 : 20);
    expect(m.controls).toBe(m.coarse ? 44 : 40);
    expect(m.knobOpacity).toBe(m.coarse ? "1" : "0");
    if (m.coarse) expect(m.knobSize).toBe(8);
    expect(m.buttons).toEqual([m.coarse ? 44 : 32, m.coarse ? 44 : 32, m.coarse ? 44 : 32]);
  });
}
