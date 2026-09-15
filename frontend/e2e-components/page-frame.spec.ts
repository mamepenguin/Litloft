/**
 * Where a page's title lands inside each PageFrame width, measured with the
 * real PageFrame and PageHeader.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

/** The column caps from `globals.css`, in px at a 16px root. */
const MAX_PX = { full: null, wide: 1152, list: 960, reading: 768 } as const;

/** `PageHeader`'s `py-2`: the frame adds nothing above it. */
const TITLE_TOP = 8;

const WIDTHS = [1425, 375] as const;

let navigation = 0;

for (const width of WIDTHS) {
  for (const frame of Object.keys(MAX_PX) as (keyof typeof MAX_PX)[]) {
    test(`${frame} at ${width}px: the title sits at the shared Y, level with the body's left edge, without overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      const arrangement = `page-frame-${frame}`;
      await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
      await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);

      const m = await page.evaluate(() => {
        const header = document.querySelector("header")!;
        const h1 = header.querySelector("h1")!;
        const body = document.getElementById("page-body")!;
        const frameEl = document.querySelector<HTMLElement>("[data-page-frame]")!;
        return {
          viewport: document.documentElement.clientWidth,
          h1Top: h1.getBoundingClientRect().top - frameEl.getBoundingClientRect().top,
          headerLeft: header.getBoundingClientRect().left,
          headerPaddingLeft: parseFloat(getComputedStyle(header).paddingLeft),
          bodyLeft: body.getBoundingClientRect().left,
          bodyPaddingLeft: parseFloat(getComputedStyle(body).paddingLeft),
          rows: [...header.children].map((row) => ({
            scroll: (row as HTMLElement).scrollWidth,
            client: (row as HTMLElement).clientWidth,
          })),
          headerScroll: header.scrollWidth,
          headerClient: header.clientWidth,
        };
      });

      const cap = MAX_PX[frame];
      const column = cap === null ? m.viewport : Math.min(cap, m.viewport);
      const expectedLeft = (m.viewport - column) / 2;

      expect(m.h1Top).toBe(TITLE_TOP);
      expect(m.headerLeft).toBe(expectedLeft);
      expect(m.bodyLeft).toBe(expectedLeft);
      expect(m.bodyPaddingLeft).toBe(m.headerPaddingLeft);
      expect(m.headerScroll).toBe(m.headerClient);
      for (const row of m.rows) expect(row.scroll).toBe(row.client);
    });
  }
}
