/**
 * A table wider than the reading column scrolls on its own, at a phone width.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

/** One `1em` of the 16px reading body. */
const TABLE_GAP_PX = 16;

async function open(page: Page) {
  await page.goto(`${FIXTURE}#markdown-tables`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator(".markdown-body table")).toHaveCount(2);
}

test("a wide table scrolls inside the column and the page does not", async ({ page }) => {
  await open(page);

  const m = await page.evaluate(() => {
    const body = document.querySelector(".markdown-body")!;
    const [wide, narrow] = Array.from(body.querySelectorAll("table"));
    const scroller = wide.parentElement!;
    const style = getComputedStyle(body);
    return {
      viewport: window.innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      columnWidth:
        body.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
      scrollerWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
      narrowWidth: narrow.getBoundingClientRect().width,
    };
  });

  expect(m.pageScrollWidth).toBe(m.viewport);
  expect(m.scrollerWidth).toBe(m.columnWidth);
  expect(m.scrollerScrollWidth).toBeGreaterThan(m.scrollerWidth);
  expect(m.narrowWidth).toBe(m.columnWidth);
});

test("scrolling sideways over the wide table scrolls the table", async ({ page }) => {
  await open(page);
  const table = page.locator(".markdown-body table").first();
  const box = (await table.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + box.height / 2);
  await page.mouse.wheel(150, 0);

  await expect
    .poll(() => table.evaluate((el) => el.parentElement!.scrollLeft))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
});

test("each table keeps one gap above and below, and the text after it stays outside", async ({
  page,
}) => {
  await open(page);

  const m = await page.evaluate(() => {
    const body = document.querySelector(".markdown-body")!;
    const blocks = Array.from(body.children);
    const rect = (el: Element) => (el.querySelector("table") ?? el).getBoundingClientRect();
    return {
      tags: blocks.map((el) => el.tagName.toLowerCase()),
      gaps: blocks.slice(1).map((el, i) => rect(el).top - rect(blocks[i]).bottom),
    };
  });

  expect(m.tags).toEqual(["p", "div", "div", "p"]);
  expect(m.gaps).toEqual([TABLE_GAP_PX, TABLE_GAP_PX, TABLE_GAP_PX]);
});
