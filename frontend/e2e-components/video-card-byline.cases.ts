/**
 * SPEC-CORE-079 I7: the real VideoCard with a long byline, measured with the
 * real stylesheet. jsdom lays nothing out, so "one line" and "one line
 * taller" are only answerable here.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { BYLINE } from "./videoCardByline.data";

const FIXTURE = pathToFileURL(PAGE).href;

let run = 0;

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${FIXTURE}?run=${++run}#video-card-byline`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
}

export function videoCardBylineCases(width: number): void {
  test(`SPEC-CORE-079 I7 the byline stays one line and adds at most one line to the card at ${width}px`, async ({
    page,
  }) => {
    await open(page, width);

    const m = await page.evaluate((bylineText) => {
      const withCard = document.querySelector<HTMLElement>('[data-case="with"]')!;
      const withoutCard = document.querySelector<HTMLElement>('[data-case="without"]')!;
      const byline = [...withCard.querySelectorAll("span")].find(
        (el) => el.textContent === bylineText,
      );
      if (!byline) throw new Error("the card drew no byline");

      const tops = new Set<number>();
      const range = document.createRange();
      range.selectNodeContents(byline);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && rect.height > 0) tops.add(Math.round(rect.top));
      }

      const style = getComputedStyle(byline);
      return {
        text: byline.textContent,
        lines: tops.size,
        lineHeight: parseFloat(style.lineHeight),
        height: byline.getBoundingClientRect().height,
        marginTop: parseFloat(style.marginTop),
        clipped: byline.scrollWidth > byline.clientWidth + 1,
        withHeight: withCard.getBoundingClientRect().height,
        withoutHeight: withoutCard.getBoundingClientRect().height,
      };
    }, BYLINE);

    expect(m.text).toBe(BYLINE);
    expect(m.lines, "the byline occupies one line box").toBe(1);
    expect(m.height).toBeLessThanOrEqual(m.lineHeight + 0.5);

    const grown = m.withHeight - m.withoutHeight;
    expect(grown, "the byline adds its own line, not more").toBeLessThanOrEqual(
      m.height + m.marginTop + 0.5,
    );
    expect(m.clipped, "the fixture's byline is long enough to be cut").toBe(true);
  });
}
