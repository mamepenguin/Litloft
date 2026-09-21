/**
 * A header row holding more name than it has width, measured in Chromium
 * with the real rows: the file-detail chrome in both of its forms, and the
 * archive toolbar.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

type Box = { left: number; right: number; top: number; bottom: number };
type Cut = { scrollWidth: number; clientWidth: number };

type Row = {
  documentScroll: number;
  documentClient: number;
  trail: Box & Cut;
  ancestors: Cut[];
  leaf: Box & Cut;
  /** Everything visible the row holds beside the trail. */
  controls: Box[];
};

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const isCut = (c: Cut) => c.scrollWidth > c.clientWidth;

async function open(
  page: Page,
  arrangement: string,
  width: number,
  selectors: { row?: string; trail: string },
): Promise<Row> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("about:blank");
  await page.goto(`${FIXTURE}#${arrangement}`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  return page.evaluate((sel) => {
    const measure = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
      };
    };
    const trail = document.querySelector<HTMLElement>(sel.trail)!;
    const row = sel.row
      ? document.querySelector<HTMLElement>(sel.row)!
      : trail.parentElement!;
    const leaf = trail.lastElementChild!;
    // The segments are read off the DOM rather than named, so one added to
    // either row is measured without being registered here.
    const ancestors = [...trail.children]
      .filter((el) => el !== leaf)
      .flatMap((el) => {
        const label = el.querySelector<HTMLElement>("a, button, span") ?? (el as HTMLElement);
        if (!(label.textContent ?? "").trim()) return [];
        return [{ scrollWidth: label.scrollWidth, clientWidth: label.clientWidth }];
      });
    return {
      documentScroll: document.documentElement.scrollWidth,
      documentClient: document.documentElement.clientWidth,
      trail: measure(trail),
      ancestors,
      leaf: measure(leaf),
      controls: [...row.children]
        .filter((el) => !el.contains(trail) && (el as HTMLElement).offsetParent !== null)
        .map(measure),
    };
  }, selectors);
}

const CASES = [
  {
    name: "the file-detail chrome",
    arrangement: "file-detail-chrome-deep",
    // Below `md` this row draws a back control instead of a trail, so the
    // trail is only measurable at the widths that draw it.
    widths: [768, 1024],
    selectors: {
      row: "[data-testid='file-detail-chrome']",
      trail: "[data-testid='file-detail-chrome'] nav",
    },
  },
  {
    name: "the archive toolbar",
    arrangement: "archive-toolbar-deep",
    widths: [375, 768, 1024],
    selectors: { trail: "[data-testid='archive-trail']" },
  },
] as const;

for (const c of CASES) {
  for (const width of c.widths) {
    test(`${c.name} at ${width}px: the trail stays inside its own box`, async ({
      page,
    }) => {
      const m = await open(page, c.arrangement, width, c.selectors);
      expect(isCut(m.trail)).toBe(false);
      expect(m.documentScroll).toBe(m.documentClient);
      expect(m.controls.length).toBeGreaterThan(0);
      for (const control of m.controls) expect(overlaps(m.trail, control)).toBe(false);
    });

    test(`${c.name} at ${width}px: an ancestor gives way, and the last segment is what stays`, async ({
      page,
    }) => {
      const m = await open(page, c.arrangement, width, c.selectors);
      // The fixture's path fits at none of these widths, so something is
      // always cut; the case is which segment it is.
      expect(m.ancestors.some(isCut)).toBe(true);
      expect(isCut(m.leaf)).toBe(false);
      expect(m.leaf.clientWidth).toBeGreaterThan(0);
      expect(m.leaf.right).toBeLessThanOrEqual(m.trail.right);
    });
  }
}

/**
 * Below `md` the same row draws no trail: a back control naming the parent
 * folder, and — for a note — the rename control, which is the file's name
 * and a button at once.
 */
test("a note's row on a phone: the name and the parent folder share the width, and neither leaves the row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto("about:blank");
  await page.goto(`${FIXTURE}#file-detail-chrome-note`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);

  const m = await page.evaluate(() => {
    const measure = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
      };
    };
    const row = document.querySelector<HTMLElement>(
      "[data-testid='file-detail-chrome']",
    )!;
    const back = document.querySelector<HTMLElement>(
      "[data-testid='file-detail-back']",
    )!;
    const leading = back.parentElement!;
    // The rename control is the only thing in the row that is both the
    // file's name and a control, so it is found by what it is.
    const name = leading.querySelector<HTMLElement>("button")!;
    return {
      documentScroll: document.documentElement.scrollWidth,
      documentClient: document.documentElement.clientWidth,
      row: measure(row),
      leading: measure(leading),
      back: measure(back),
      name: measure(name),
      controls: [...row.children]
        .filter((el) => el !== leading && (el as HTMLElement).offsetParent !== null)
        .map(measure),
    };
  });

  expect(m.documentScroll).toBe(m.documentClient);
  expect(isCut(m.row)).toBe(false);
  expect(isCut(m.leading)).toBe(false);

  // Both give way; neither is starved to nothing by the other.
  expect(isCut(m.back)).toBe(false);
  expect(m.back.clientWidth).toBeGreaterThan(0);
  expect(m.name.clientWidth).toBeGreaterThan(0);
  expect(m.name.right).toBeLessThanOrEqual(m.leading.right);

  expect(m.controls.length).toBe(3);
  for (const control of m.controls) expect(overlaps(m.name, control)).toBe(false);
});
