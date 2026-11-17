import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { addMenuCases } from "./add-menu.cases";

addMenuCases();

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function openAt(page: Page, arrangement: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);
  const trigger = page.getByRole("button", { name: /^(Add|追加)/ });
  const box = (await trigger.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("menu")).toBeVisible();
}

const ARRANGEMENTS = [
  ["add-menu", "left edge, en"],
  ["add-menu-right", "right edge, en"],
  ["add-menu-ja", "left edge, ja"],
  ["add-menu-ja-right", "right edge, ja"],
] as const;

for (const width of [393, 320]) {
  for (const [arrangement, label] of ARRANGEMENTS) {
    test(`SPEC-CORE-123 I4: each core row is one whole line inside the window at ${width}px, ${label}`, async ({
      page,
    }) => {
      await openAt(page, arrangement, width);
      const report = await page.evaluate(() => {
        const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
        const menuBox = menu.getBoundingClientRect();
        const rows = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        return {
          count: rows.length,
          menu: {
            left: menuBox.left,
            right: menuBox.right,
            top: menuBox.top,
            bottom: menuBox.bottom,
          },
          viewport: { w: window.innerWidth, h: window.innerHeight },
          rows: rows.map((row) => {
            const rowBox = row.getBoundingClientRect();
            const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
            const tops = new Set<number>();
            let textLeft = Infinity;
            let textRight = -Infinity;
            let ellipsis = false;
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!n.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(n);
              for (const r of Array.from(range.getClientRects())) {
                tops.add(Math.round(r.top));
                textLeft = Math.min(textLeft, r.left);
                textRight = Math.max(textRight, r.right);
              }
              ellipsis ||= getComputedStyle(n.parentElement!).textOverflow === "ellipsis";
            }
            return {
              text: row.textContent!.trim(),
              lines: tops.size,
              overflows: row.scrollWidth > row.clientWidth,
              ellipsis,
              textInRow: textLeft >= rowBox.left - 0.5 && textRight <= rowBox.right + 0.5,
              textInMenu: textLeft >= menuBox.left - 0.5 && textRight <= menuBox.right + 0.5,
            };
          }),
        };
      });
      expect(report.count).toBe(3);
      for (const row of report.rows) {
        expect(row, row.text).toMatchObject({
          lines: 1,
          overflows: false,
          ellipsis: false,
          textInRow: true,
          textInMenu: true,
        });
      }
      expect(report.menu.left).toBeGreaterThanOrEqual(0);
      expect(report.menu.right).toBeLessThanOrEqual(report.viewport.w);
      expect(report.menu.top).toBeGreaterThanOrEqual(0);
      expect(report.menu.bottom).toBeLessThanOrEqual(report.viewport.h);
    });
  }
}

test("SPEC-CORE-123 I2: the ja menu names the three actions in order", async ({ page }) => {
  await openAt(page, "add-menu-ja", 393);
  await expect(page.getByRole("menuitem")).toHaveText([
    "ファイルをアップロード",
    "フォルダをアップロード",
    "新規フォルダ",
  ]);
});

test("SPEC-CORE-123 I5: an item without the no-wrap option still wraps a long label", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#action-menu-item-long-label`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "action-menu-item-long-label",
  );
  const lines = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('[role="menuitem"]')!;
    const tops = new Set<number>();
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) tops.add(Math.round(r.top));
    }
    return tops.size;
  });
  expect(lines).toBeGreaterThan(1);
});
