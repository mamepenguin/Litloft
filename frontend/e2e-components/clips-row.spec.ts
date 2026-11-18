/**
 * SPEC-ADDON-138 I8: a Clips card has its final box before its cover answer
 * arrives, a 4:3 cover and a title of at most two lines. Boxes, so measured in
 * a real browser; jsdom lays nothing out.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let run = 0;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Card {
  card: Box;
  cover: Box;
  title: Box & { lineHeight: number; clipped: boolean };
  meta: Box;
  hasPicture: boolean;
}

async function open(page: Page, width: number, hold: boolean): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${FIXTURE}?run=${++run}${hold ? "&hold=1" : ""}#clips-row`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "clips-row");
  await expect(page.locator("#clips-cards li")).toHaveCount(6);
}

function measure(page: Page): Promise<Card[]> {
  return page.evaluate(() => {
    const box = (element: Element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return [...document.querySelectorAll<HTMLElement>("#clips-cards li > a")].map((card) => {
      const [cover, title, meta] = [...card.children] as HTMLElement[];
      return {
        card: box(card),
        cover: box(cover),
        title: {
          ...box(title),
          lineHeight: parseFloat(getComputedStyle(title).lineHeight),
          clipped: title.scrollHeight > title.clientHeight + 1,
        },
        meta: box(meta),
        hasPicture: cover.querySelector("img") !== null,
      };
    });
  });
}

for (const width of [390, 1280]) {
  test(`SPEC-ADDON-138 I8 at ${width}px a card has a 4:3 cover, a title of at most two lines, and the same box before and after its cover arrives`, async ({
    page,
  }) => {
    await open(page, width, true);
    const before = await measure(page);
    expect(before.every((c) => !c.hasPicture), "no picture has arrived").toBe(true);

    for (const c of before) {
      expect(Math.abs(c.cover.width / c.cover.height - 4 / 3), "cover is 4:3").toBeLessThanOrEqual(0.01);
      expect(c.title.height, "title is at most two lines").toBeLessThanOrEqual(c.title.lineHeight * 2 + 0.5);
    }
    expect(
      before.some((c) => c.title.clipped),
      "a title longer than two lines is cut to two",
    ).toBe(true);

    await page.evaluate(() => window.__releaseClipCovers?.());
    await expect(page.locator("#clips-cards li img").first()).toBeVisible();
    await expect(page.locator("#clips-cards li img")).toHaveCount(3);

    const after = await measure(page);
    expect(after.filter((c) => c.hasPicture)).toHaveLength(3);
    expect(after).toHaveLength(before.length);
    after.forEach((c, i) => {
      for (const part of ["card", "cover", "title", "meta"] as const) {
        for (const key of ["x", "y", "width", "height"] as const) {
          expect(Math.abs(c[part][key] - before[i][part][key]), `card ${i} ${part}.${key}`).toBeLessThanOrEqual(0.5);
        }
      }
    });
  });
}
