/**
 * The search results page's header and results bar, drawn by the real
 * `SearchQueryHeader` and `FolderToolbar` and measured with the real
 * stylesheet: jsdom lays nothing out.
 *
 * Each arrangement renders the page body only (no app toolbar), in English,
 * with the document as the scroll area. Files counts 12 results and Passages
 * 3 files and 7 passages in every arrangement, so the count reads the same
 * with and without the Scene search checkbox. Scene search on renders a
 * stand-in shelf with `data-testid="scene-shelf"` in `search-results-top`.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

export const ARRANGEMENT = {
  files: "search-results-bar-files",
  filesType: "search-results-bar-files-type",
  filesScene: "search-results-bar-files-scene",
  filesOperator: "search-results-bar-files-operator",
  passages: "search-results-bar-passages",
  passagesScene: "search-results-bar-passages-scene",
  passagesOperator: "search-results-bar-passages-operator",
  sticky: "search-results-bar-sticky",
  smartFolderChanged: "search-results-bar-smart-folder-changed",
} as const;

let navigation = 0;

export async function open(page: Page, id: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", id);
  await expect(page.getByRole("textbox", { name: "Search query" })).toBeVisible();
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  height: number;
}

export interface Measured {
  innerWidth: number;
  scrollWidth: number;
  field: Box;
  bar: Box;
  barHoldsField: boolean;
  aboveField: string[];
  switches: Box[];
  checkboxes: Box[];
  counts: Array<Box & { lines: number }>;
  mores: Box[];
  sorts: Box[];
  views: Box[];
  filters: number;
  shelf: Box | null;
  listRow: (Box & { maxWidth: string }) | null;
  coarse: boolean;
}

/** Everything the cases read, from one pass over the laid-out page. */
export function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    };
    const name = (el: Element) =>
      (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
    const shown = (els: Element[]) => els.filter(visible);

    const field = document.querySelector('input[aria-label="Search query"]')!;
    const fieldBox = box(field);

    const switches = shown([...document.querySelectorAll('[role="group"][aria-label="Show"]')]);
    const checkboxes = shown(
      [...document.querySelectorAll('input[type="checkbox"]')].map((el) => el.closest("label") ?? el),
    );
    const buttons = [...document.querySelectorAll("button")];
    const mores = shown(buttons.filter((b) => name(b) === "More actions"));
    const sorts = shown(buttons.filter((b) => /^Sort/.test(name(b))));
    const views = shown(buttons.filter((b) => /^View/.test(name(b))));
    const filters = shown(buttons.filter((b) => /^Filter/.test(name(b)))).length;

    const COUNT = /^(\d+ items?|\d+ files? · \d+ passages?|\d+ passages?)$/;
    const counts = shown(
      [...document.querySelectorAll("body *")].filter(
        (el) =>
          [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) &&
          COUNT.test((el.textContent ?? "").trim()),
      ),
    ).map((el) => {
      const tops = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
        .flatMap((n) => {
          const range = document.createRange();
          range.selectNodeContents(n);
          return [...range.getClientRects()].map((r) => Math.round(r.top));
        });
      return { ...box(el), lines: new Set(tops).size };
    });

    const anchors = [switches[0] ?? checkboxes[0], mores[0]].filter(Boolean) as Element[];
    let bar: Element | null = anchors[0] ?? null;
    while (bar && !anchors.every((el) => bar!.contains(el))) bar = bar.parentElement;

    const aboveField = [...document.body.querySelectorAll("*")]
      .filter((el) => !el.contains(field) && !field.contains(el) && visible(el))
      .filter((el) => el.getBoundingClientRect().bottom <= fieldBox.top + 0.5)
      .map((el) => `${el.tagName.toLowerCase()} ${name(el).slice(0, 40)}`);

    const shelf = document.querySelector('[data-testid="scene-shelf"]');
    const listRow = document.querySelector('[class*="max-w-list-row"]');

    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      field: fieldBox,
      bar: bar ? box(bar) : { left: 0, right: 0, top: 0, bottom: 0, height: 0 },
      barHoldsField: bar ? bar.contains(field) : true,
      aboveField,
      switches: switches.map(box),
      checkboxes: checkboxes.map(box),
      counts,
      mores: mores.map(box),
      sorts: sorts.map(box),
      views: views.map(box),
      filters,
      shelf: shelf ? box(shelf) : null,
      listRow: listRow ? { ...box(listRow), maxWidth: getComputedStyle(listRow).maxWidth } : null,
      coarse: matchMedia("(pointer: coarse)").matches,
    };
  });
}

export function overlapVertically(a: Box, b: Box): boolean {
  return a.top < b.bottom && b.top < a.bottom;
}

/** SPEC-CORE-066 I1: no visible element in the page body sits above the field. */
export function nothingAboveTheField(width: number): void {
  for (const id of Object.values(ARRANGEMENT)) {
    if (id === ARRANGEMENT.sticky || id === ARRANGEMENT.smartFolderChanged) continue;
    test(`SPEC-CORE-066 I1 ${id} at ${width}px: nothing sits above the query field`, async ({ page }) => {
      await open(page, id, width);
      const m = await measure(page);
      expect(m.aboveField).toEqual([]);
    });
  }
}

/** SPEC-CORE-066 I2: one visible switch, count and …, and no Filter. */
export function oneOfEach(width: number): void {
  const ids = [
    ARRANGEMENT.files,
    ARRANGEMENT.filesScene,
    ARRANGEMENT.filesOperator,
    ARRANGEMENT.passages,
    ARRANGEMENT.passagesOperator,
  ];
  for (const id of ids) {
    test(`SPEC-CORE-066 I2 ${id} at ${width}px: one switch, one count, one …, no Filter`, async ({ page }) => {
      await open(page, id, width);
      const m = await measure(page);
      expect(m.switches).toHaveLength(1);
      expect(m.counts).toHaveLength(1);
      expect(m.mores).toHaveLength(1);
      expect(m.filters).toBe(0);
    });
  }
}

/** SPEC-CORE-066 I5: removing the checkbox moves nothing else in the bar. */
export function positionsHoldWithoutTheCheckbox(width: number): void {
  test(`SPEC-CORE-066 I5 at ${width}px: the bar's controls keep their x without Scene search`, async ({ page }) => {
    await open(page, ARRANGEMENT.files, width);
    const withBox = await measure(page);
    await open(page, ARRANGEMENT.filesOperator, width);
    const without = await measure(page);

    expect(withBox.checkboxes).toHaveLength(1);
    expect(without.checkboxes).toHaveLength(0);
    const xs = (m: Measured) => ({
      switch: m.switches.map((b) => [Math.round(b.left), Math.round(b.right)]),
      count: m.counts.map((b) => [Math.round(b.left), Math.round(b.right)]),
      view: m.views.map((b) => [Math.round(b.left), Math.round(b.right)]),
      sort: m.sorts.map((b) => [Math.round(b.left), Math.round(b.right)]),
      more: m.mores.map((b) => [Math.round(b.left), Math.round(b.right)]),
    });
    expect(xs(withBox).more).toHaveLength(1);
    expect(xs(without)).toEqual(xs(withBox));
  });
}

export const OVERWRITE_NAME = "Overwrite “Fixture folder”";

export interface OverwriteMeasured {
  button: Box;
  addFilter: Box;
  row: Box;
  lastInRow: boolean;
  others: Box[];
}

export async function openChanged(page: Page, width: number): Promise<void> {
  await open(page, ARRANGEMENT.smartFolderChanged, width);
  await expect(page.getByRole("button", { name: OVERWRITE_NAME, exact: true })).toBeVisible();
}

export function measureOverwrite(page: Page): Promise<OverwriteMeasured> {
  return page.evaluate((overwriteName) => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== "hidden";
    };
    const name = (el: Element) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
    const buttons = [...document.querySelectorAll("button")];
    const button = buttons.find((b) => name(b) === overwriteName)!;
    const addFilter = buttons.find((b) => name(b) === "Add filter")!;

    let row: Element | null = addFilter;
    while (row && !row.contains(button)) row = row.parentElement;
    const rowRect = row!.getBoundingClientRect();
    const style = getComputedStyle(row!);
    const rowBox = {
      left: rowRect.left + parseFloat(style.paddingLeft),
      right: rowRect.right - parseFloat(style.paddingRight),
      top: rowRect.top,
      bottom: rowRect.bottom,
      height: rowRect.height,
    };
    const inRow = [...row!.querySelectorAll("button")].filter(visible);
    const others = inRow.filter((b) => b !== button);
    return {
      button: box(button),
      addFilter: box(addFilter),
      row: rowBox,
      lastInRow: inRow[inRow.length - 1] === button,
      others: others.map(box),
    };
  }, OVERWRITE_NAME);
}
