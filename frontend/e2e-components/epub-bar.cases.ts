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

  test("while the book opens, the bar's buttons are disabled in the disabled colour, not faded", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    await page.goto(`${FIXTURE}#epub-bar-loading`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
    const buttons = page.locator('[data-testid="epub-position-bar"] button');
    await expect(buttons).toHaveCount(3);
    for (const i of [0, 1, 2]) {
      await expect(buttons.nth(i)).toBeDisabled();
      const look = await buttons.nth(i).evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--warm-silver").trim();
        document.body.append(probe);
        const silver = getComputedStyle(probe).color;
        probe.remove();
        return { opacity: getComputedStyle(el).opacity, colour: getComputedStyle(el).color, silver };
      });
      expect(look.opacity).toBe("1");
      expect(look.colour).toBe(look.silver);
    }
  });

  test("while the thumb is held it grows and takes the accent, and the bubble stays in the bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    await page.goto(`${FIXTURE}#epub-bar`);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
    const row = (await page.locator("[data-player-scrub]").boundingBox())!;
    await page.mouse.move(row.x + row.width * 0.5, row.y + row.height / 2);
    await page.mouse.down();
    const m = await page.evaluate(() => {
      const tokenRgb = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        document.body.append(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        return rgb;
      };
      const knob = document.querySelector('[data-testid="epub-position-knob"]')!;
      const bubble = document.querySelector('[data-testid="epub-position-bubble"]')!.getBoundingClientRect();
      const row = document.querySelector("[data-player-scrub]")!.getBoundingClientRect();
      return {
        coarse: matchMedia("(pointer: coarse)").matches,
        accent: tokenRgb("--accent"),
        knobSize: knob.getBoundingClientRect().width,
        knobColour: getComputedStyle(knob).backgroundColor,
        fill: getComputedStyle(document.querySelector('[data-testid="epub-position-fill"]')!).backgroundColor,
        bubble: { left: bubble.left, right: bubble.right, width: bubble.width },
        row: { left: row.left, right: row.right },
      };
    });
    await page.mouse.up();
    expect(m.knobSize).toBe(m.coarse ? 20 : 14);
    expect(m.knobColour).toBe(m.accent);
    expect(m.fill).toBe(m.accent);
    expect(m.bubble.width).toBeLessThanOrEqual(256);
    expect(m.bubble.left).toBeGreaterThanOrEqual(m.row.left);
    expect(m.bubble.right).toBeLessThanOrEqual(m.row.right);
  });
}
