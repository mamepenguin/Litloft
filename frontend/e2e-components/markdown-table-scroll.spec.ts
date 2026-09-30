/**
 * A table wider than the reading column scrolls on its own, at a phone width.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

test("a wide table scrolls inside the column and the page does not", async ({ page }) => {
  await page.goto(`${FIXTURE}#markdown-tables`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator(".markdown-body table")).toHaveCount(2);

  const m = await page.evaluate(() => {
    const body = document.querySelector(".markdown-body")!;
    const [wide, narrow] = Array.from(body.querySelectorAll("table"));
    const scroller = wide.parentElement!;
    scroller.scrollLeft = 50;
    const bodyBox = body.getBoundingClientRect();
    const content = parseFloat(getComputedStyle(body).paddingLeft) + parseFloat(getComputedStyle(body).paddingRight);
    return {
      viewport: window.innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      columnWidth: bodyBox.width - content,
      scrollerWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
      scrolledTo: scroller.scrollLeft,
      narrowWidth: narrow.getBoundingClientRect().width,
    };
  });

  expect(m.pageScrollWidth).toBe(m.viewport);
  expect(m.scrollerWidth).toBe(m.columnWidth);
  expect(m.scrollerScrollWidth).toBeGreaterThan(m.scrollerWidth);
  expect(m.scrolledTo).toBe(50);
  expect(m.narrowWidth).toBe(m.columnWidth);
});
