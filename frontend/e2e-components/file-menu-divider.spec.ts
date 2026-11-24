/**
 * SPEC-CORE-150 rule 1, I6 and D1, measured: a caller's leading rows, one 1px divider,
 * then today's rows, in the unchanged 176px menu with 14px icons and today's row height.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let run = 0;

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${FIXTURE}?run=${++run}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  // The menu scales in; boxes read mid-animation are scaled with it.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}

interface Child {
  row: string | null;
  top: number;
  bottom: number;
  height: number;
  width: number;
  icon: { width: number; height: number } | null;
}

/** The menu's children in order, with their boxes; `row` is null for anything not a menu row. */
async function measure(page: Page): Promise<{ menuWidth: number; children: Child[] }> {
  return page.evaluate(() => {
    const first = document.querySelector('[role="menuitem"]') as HTMLElement;
    const menu = first.parentElement as HTMLElement;
    return {
      menuWidth: menu.getBoundingClientRect().width,
      children: [...menu.children].map((el) => {
        const box = el.getBoundingClientRect();
        const svg = el.querySelector("svg")?.getBoundingClientRect();
        return {
          row: el.getAttribute("role") === "menuitem" ? (el.textContent ?? "").trim() : null,
          top: box.top,
          bottom: box.bottom,
          height: box.height,
          width: box.width,
          icon: svg ? { width: svg.width, height: svg.height } : null,
        };
      }),
    };
  });
}

test("SPEC-CORE-150 I6 D1 the extra rows, one 1px divider, then today's rows, in today's menu", async ({ page }) => {
  await open(page, "file-menu-today");
  const today = await measure(page);
  expect(today.children.every((c) => c.row !== null)).toBe(true);

  await open(page, "file-menu-extra");
  const extra = await measure(page);

  expect(extra.children.map((c) => c.row)).toEqual([
    "Not interested",
    "Second extra",
    null,
    ...today.children.map((c) => c.row),
  ]);
  expect(extra.menuWidth).toBe(today.menuWidth);
  expect(extra.menuWidth).toBe(176);

  const divider = extra.children[2];
  expect(divider.height).toBe(1);
  expect(divider.top).toBeGreaterThanOrEqual(extra.children[1].bottom - 0.5);
  expect(divider.bottom).toBeLessThanOrEqual(extra.children[3].top + 0.5);

  const rowHeight = today.children[0].height;
  for (const child of extra.children.filter((c) => c.row !== null)) {
    expect(child.height, child.row!).toBeCloseTo(rowHeight, 0);
    expect(child.icon, child.row!).toEqual({ width: 14, height: 14 });
  }
});

test("SPEC-CORE-150 D4 a disabled extra row is greyed and the menu keeps its rows", async ({ page }) => {
  await open(page, "file-menu-extra");

  const disabled = page.getByRole("menuitem", { name: "Second extra" });
  const enabled = page.getByRole("menuitem", { name: "Not interested" });
  await expect(disabled).toBeDisabled();
  const [dim, full] = await Promise.all(
    [disabled, enabled].map((row) => row.evaluate((el) => Number(getComputedStyle(el).opacity))),
  );
  expect(dim).toBeLessThan(full);
});
