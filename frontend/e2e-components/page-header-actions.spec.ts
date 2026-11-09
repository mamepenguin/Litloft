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
