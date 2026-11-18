/**
 * The header's action group in each place PageHeader can draw it, measured
 * with the real component. Compared with the width the browser was given,
 * not `innerWidth`, which a wider page drags out with it.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const ARRANGEMENTS = [
  { id: "page-header-trail-actions", sharesTitleRow: false },
  { id: "page-header-title-field-actions", sharesTitleRow: true },
  { id: "page-header-title-actions", sharesTitleRow: true },
] as const;

const NARROW = [320, 390] as const;

let navigation = 0;

async function open(
  page: import("@playwright/test").Page,
  id: string,
  width: number,
): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", id);
}

for (const { id } of ARRANGEMENTS) {
  for (const width of NARROW) {
    test(`${id} at ${width}px: the page does not scroll sideways and every action is on screen`, async ({
      page,
    }) => {
      await open(page, id, width);

      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        actions: Array.from(document.querySelectorAll("header button")).map((b) => {
          const r = b.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }),
      }));

      expect(m.actions).toHaveLength(2);
      expect(m.scrollWidth).toBeLessThanOrEqual(width);
      for (const a of m.actions) {
        expect(a.left).toBeGreaterThanOrEqual(0);
        expect(a.right).toBeLessThanOrEqual(width);
      }
    });
  }
}

for (const { id, sharesTitleRow } of ARRANGEMENTS) {
  if (!sharesTitleRow) continue;
  test(`${id} at 1280px: the actions stay on the title's row`, async ({ page }) => {
    await open(page, id, 1280);

    const rows = await page.evaluate(() => {
      const header = document.querySelector("header")!;
      const h1 = header.querySelector("h1")!;
      const field = header.querySelector("input");
      const subject = (field ?? h1).getBoundingClientRect();
      const buttons = Array.from(header.querySelectorAll("button")).map((b) =>
        b.getBoundingClientRect(),
      );
      return {
        subject: { top: subject.top, bottom: subject.bottom },
        buttons: buttons.map((r) => ({ top: r.top, bottom: r.bottom })),
      };
    });

    for (const b of rows.buttons) {
      expect(b.top).toBeLessThan(rows.subject.bottom);
      expect(b.bottom).toBeGreaterThan(rows.subject.top);
    }
  });
}

for (const width of NARROW) {
  test(`page-header-title-medium-actions at ${width}px: actions that do not fit beside the title leave it whole`, async ({
    page,
  }) => {
    await open(page, "page-header-title-medium-actions", width);

    const h1 = await page.evaluate(() => {
      const el = document.querySelector("header h1")!;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });

    expect(h1.clientWidth).toBeGreaterThan(0);
    expect(h1.scrollWidth).toBeLessThanOrEqual(h1.clientWidth);
  });

  test(`page-header-title-short-action at ${width}px: an action that fits stays on the title's row`, async ({
    page,
  }) => {
    await open(page, "page-header-title-short-action", width);

    const rows = await page.evaluate(() => {
      const header = document.querySelector("header")!;
      const h1 = header.querySelector("h1")!.getBoundingClientRect();
      const button = header.querySelector("button")!.getBoundingClientRect();
      return { h1: { top: h1.top, bottom: h1.bottom }, button: { top: button.top, bottom: button.bottom } };
    });

    expect(rows.button.top).toBeLessThan(rows.h1.bottom);
    expect(rows.button.bottom).toBeGreaterThan(rows.h1.top);
  });
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

async function scopeEndBoxes(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      title: box("header h1"),
      scopeEnd: box("#scope-end"),
      action: box("#header-action"),
      tabs: box("#tabs"),
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

const onRow = (a: Box, b: Box) => Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

test("page-header-scope-end-actions at 1440px: title, Target, then the action, rightmost, on one row", async ({
  page,
}) => {
  await open(page, "page-header-scope-end-actions", 1440);
  const m = await scopeEndBoxes(page);

  expect(onRow(m.title, m.scopeEnd)).toBe(true);
  expect(onRow(m.title, m.action)).toBe(true);
  expect(m.title.right).toBeLessThanOrEqual(m.scopeEnd.left + 1);
  expect(m.scopeEnd.right).toBeLessThanOrEqual(m.action.left + 1);
  expect(Math.abs(m.action.right - (1440 - 16))).toBeLessThanOrEqual(1);
  expect(m.tabs.top).toBeGreaterThanOrEqual(m.action.bottom - 1);
  expect(m.scrollWidth).toBeLessThanOrEqual(1440);
});

test("page-header-scope-end-actions at 390px: the action is a full-width row after the tabs", async ({
  page,
}) => {
  await open(page, "page-header-scope-end-actions", 390);
  const m = await scopeEndBoxes(page);

  expect(m.action.top).toBeGreaterThanOrEqual(m.tabs.bottom - 1);
  expect(Math.abs(m.action.left - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.action.right - (390 - 16))).toBeLessThanOrEqual(1);
  expect(m.scrollWidth).toBeLessThanOrEqual(390);
});
