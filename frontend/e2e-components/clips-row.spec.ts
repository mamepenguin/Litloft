/**
 * SPEC-ADDON-100 D4: a Clips row with a long title and a long excerpt. The
 * two text lines and the position of the folder and date are boxes, so they
 * are measured in a real browser; jsdom lays nothing out.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let run = 0;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface TextBox extends Box {
  lineHeight: number;
  scrollWidth: number;
  clientWidth: number;
  whiteSpace: string;
}

interface Row {
  row: Box;
  column: Box;
  title: TextBox;
  excerpt: TextBox;
  phoneMeta: Box | null;
  sideFolder: Box | null;
  sideDate: Box | null;
}

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${FIXTURE}?run=${++run}#clips-row`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "clips-row");
  await expect(page.locator("#clips-rows li")).toHaveCount(2);
}

function measure(page: Page): Promise<Row[]> {
  return page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const drawn = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const textBox = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        ...box(element),
        lineHeight: parseFloat(style.lineHeight),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        whiteSpace: style.whiteSpace,
      };
    };

    return [...document.querySelectorAll<HTMLElement>("#clips-rows li > a")].map((row) => {
      const excerpt = row.querySelector<HTMLElement>('[data-testid="note-excerpt"]')!;
      const column = excerpt.parentElement as HTMLElement;
      const title = excerpt.previousElementSibling as HTMLElement;
      const phoneMeta = excerpt.nextElementSibling as HTMLElement;
      const side = [...row.children].filter(
        (child) => child !== column && child.getAttribute("aria-hidden") !== "true",
      );
      return {
        row: box(row),
        column: box(column),
        title: textBox(title),
        excerpt: textBox(excerpt),
        phoneMeta: drawn(phoneMeta) ? box(phoneMeta) : null,
        sideFolder: drawn(side[0]) ? box(side[0]) : null,
        sideDate: drawn(side[1]) ? box(side[1]) : null,
      };
    });
  });
}

function expectOneLine(text: TextBox, label: string): void {
  expect(text.whiteSpace, `${label}: no wrapping`).toBe("nowrap");
  expect(text.height, `${label}: one line tall`).toBeLessThanOrEqual(text.lineHeight * 1.3);
  expect(text.scrollWidth, `${label}: the text is longer than the box`).toBeGreaterThan(
    text.clientWidth,
  );
}

test("SPEC-ADDON-100 D4 at 390px a long title and excerpt stay on one line and the meta moves under the excerpt", async ({
  page,
}) => {
  await open(page, 390);
  const rows = await measure(page);
  expect(rows).toHaveLength(2);

  for (const row of rows) {
    expectOneLine(row.title, "title");
    expectOneLine(row.excerpt, "excerpt");

    expect(row.sideFolder, "the folder column is not drawn").toBeNull();
    expect(row.sideDate, "the date column is not drawn").toBeNull();
    expect(row.phoneMeta, "the phone meta line is drawn").not.toBeNull();
    expect(row.phoneMeta!.top, "the meta line starts under the excerpt").toBeGreaterThanOrEqual(
      row.excerpt.bottom - 0.5,
    );
    expect(row.phoneMeta!.bottom, "the meta line stays in the row").toBeLessThanOrEqual(
      row.row.bottom + 0.5,
    );
    expect(row.phoneMeta!.left).toBeGreaterThanOrEqual(row.row.left - 0.5);
    expect(row.phoneMeta!.right).toBeLessThanOrEqual(row.row.right + 0.5);
  }
});

test("SPEC-ADDON-100 D4 at 1280px a long title and excerpt stay on one line and the meta sits on the right", async ({
  page,
}) => {
  await open(page, 1280);
  const rows = await measure(page);
  expect(rows).toHaveLength(2);

  for (const row of rows) {
    expectOneLine(row.title, "title");
    expectOneLine(row.excerpt, "excerpt");

    expect(row.phoneMeta, "the phone meta line is not drawn").toBeNull();
    expect(row.sideFolder, "the folder is drawn").not.toBeNull();
    expect(row.sideDate, "the date is drawn").not.toBeNull();

    const middle = (row.row.left + row.row.right) / 2;
    expect(row.sideFolder!.left, "the folder is in the right half").toBeGreaterThan(middle);
    expect(row.sideFolder!.left, "the folder is right of the text column").toBeGreaterThanOrEqual(
      row.column.right - 1,
    );
    expect(row.sideDate!.left, "the date follows the folder").toBeGreaterThanOrEqual(
      row.sideFolder!.right - 0.5,
    );
    expect(row.sideDate!.right, "the date stays in the row").toBeLessThanOrEqual(
      row.row.right + 0.5,
    );

    const overlap =
      Math.min(row.column.bottom, row.sideFolder!.bottom) -
      Math.max(row.column.top, row.sideFolder!.top);
    expect(overlap, "the meta is beside the text, not below it").toBeGreaterThan(0);
  }
});
