/**
 * SPEC-CORE-172 I16: a negated chip whose value is 200 characters long stays
 * inside the chip row at 375 px, truncating the value while 「除外」, the
 * operator's label and ✕ stay visible. jsdom lays nothing out, so this is
 * measured in a real browser.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const ARRANGEMENT = "search-chips-negated-long";
const PHONE = 375;

test(`SPEC-CORE-172 I16 a negated chip with a 200-character folder at ${PHONE}px`, async ({ page }) => {
  await page.setViewportSize({ width: PHONE, height: 800 });
  await page.goto(`${FIXTURE}?run=1#${ARRANGEMENT}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", ARRANGEMENT);

  const row = page.getByRole("group", { name: "Filters" });
  await expect(row).toBeVisible();
  const remove = row.getByRole("button", { name: /Exclude/ });
  await expect(remove).toHaveCount(1);

  const m = await row.evaluate((group) => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    };
    const chips = Array.from(group.children);
    const negated = chips.find((chip) => chip.textContent?.includes("Exclude"));
    const textBox = (needle: string) => {
      if (!negated) return null;
      const walker = document.createTreeWalker(negated, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent?.indexOf(needle) ?? -1;
        if (at >= 0) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + needle.length);
          const r = range.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width };
        }
      }
      return null;
    };
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      row: box(group),
      negated: negated ? box(negated) : null,
      exclude: textBox("Exclude"),
      label: textBox("Folder"),
    };
  });

  expect(m.innerWidth).toBe(PHONE);
  expect(m.scrollWidth).toBeLessThanOrEqual(PHONE);
  expect(m.negated).not.toBeNull();
  expect(m.negated!.width).toBeLessThanOrEqual(m.row.width);
  expect(m.negated!.left).toBeGreaterThanOrEqual(m.row.left);
  expect(m.negated!.right).toBeLessThanOrEqual(m.row.right);

  for (const part of [m.exclude, m.label]) {
    expect(part).not.toBeNull();
    expect(part!.width).toBeGreaterThan(0);
    expect(part!.left).toBeGreaterThanOrEqual(m.negated!.left);
    expect(part!.right).toBeLessThanOrEqual(m.negated!.right);
  }

  await expect(remove).toBeInViewport({ ratio: 1 });
  const x = await remove.boundingBox();
  expect(x).not.toBeNull();
  expect(x!.x + x!.width).toBeLessThanOrEqual(m.negated!.right + 0.5);
});
