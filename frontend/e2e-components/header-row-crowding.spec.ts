/**
 * A header row holding more name than it has width, measured in Chromium
 * with the real rows: the folder listing's header, the file-detail chrome in
 * both of its forms, and the archive toolbar.
 *
 * Both rows wrap some segments and not others, and a wrapper whose child
 * truncates never reports that child's overflow, so every name here is
 * measured on the element that carries the text — `labelOf`.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

type Box = { left: number; right: number; top: number; bottom: number };
type Cut = { scrollWidth: number; clientWidth: number };
type Part = Box & Cut;

type Row = {
  documentScroll: number;
  documentClient: number;
  trail: Part;
  ancestors: Part[];
  leaf: Part;
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
    const labelOf = (el: Element): HTMLElement =>
      el.querySelector<HTMLElement>("a, button, span") ?? (el as HTMLElement);
    const measure = (el: Element): Part => {
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
      .map(labelOf)
      .filter((label) => (label.textContent ?? "").trim())
      .map(measure);
    return {
      documentScroll: document.documentElement.scrollWidth,
      documentClient: document.documentElement.clientWidth,
      trail: measure(trail),
      ancestors,
      leaf: measure(labelOf(leaf)),
      controls: [...row.children]
        .filter((el) => !el.contains(trail) && (el as HTMLElement).offsetParent !== null)
        .map(measure),
    };
  }, selectors);
}

/**
 * `leafCut` is declared, not read off the run. At the phone width the
 * fixture's path does not fit even with every ancestor at zero, so the last
 * segment has to give too; above it there is room and it must not.
 */
const NARROW_TO_WIDE = [
  { px: 375, leafCut: true },
  { px: 768, leafCut: false },
  { px: 1024, leafCut: false },
] as const;

const CASES = [
  {
    name: "the folder listing header",
    arrangement: "folder-listing-header-deep",
    widths: NARROW_TO_WIDE,
    // The trail's own row inside the header is the nav's parent.
    selectors: { trail: "header nav" },
    controls: 1,
  },
  {
    name: "the file-detail chrome",
    arrangement: "file-detail-chrome-deep",
    // Below `md` this row draws a back control instead of a trail, so the
    // trail is only measurable at the widths that draw it.
    widths: NARROW_TO_WIDE.filter((w) => w.px >= 768),
    selectors: {
      row: "[data-testid='file-detail-chrome']",
      trail: "[data-testid='file-detail-chrome'] nav",
    },
    controls: 2,
  },
  {
    name: "the archive toolbar",
    arrangement: "archive-toolbar-deep",
    widths: NARROW_TO_WIDE,
    selectors: { trail: "[data-testid='archive-trail']" },
    controls: 1,
  },
] as const;

for (const c of CASES) {
  for (const { px, leafCut } of c.widths) {
    test(`${c.name} at ${px}px: the trail stays inside its own box`, async ({
      page,
    }) => {
      const m = await open(page, c.arrangement, px, c.selectors);
      expect(isCut(m.trail)).toBe(false);
      expect(m.documentScroll).toBe(m.documentClient);
      expect(m.controls.length).toBe(c.controls);
      for (const control of m.controls) expect(overlaps(m.trail, control)).toBe(false);
    });

    test(`${c.name} at ${px}px: the ancestors give way, and the last segment gives last`, async ({
      page,
    }) => {
      const m = await open(page, c.arrangement, px, c.selectors);
      // The fixture's path fits at none of these widths, so something is
      // always cut; the case is which segment it is.
      expect(m.ancestors.some(isCut)).toBe(true);
      expect(isCut(m.leaf)).toBe(leafCut);
      // Where the last segment does give, it gives only once there is
      // nothing left to take from the rest.
      if (leafCut) expect(m.ancestors.every(isCut)).toBe(true);
      // Not `> 0`: a segment narrowed to its ellipsis passes that and holds
      // nothing. The last segment is the widest name in the trail.
      expect(m.leaf.clientWidth).toBeGreaterThan(
        Math.max(...m.ancestors.map((a) => a.clientWidth)),
      );
      expect(m.leaf.right).toBeLessThanOrEqual(m.trail.right);
    });
  }
}

/**
 * Neither of the two names sharing a row may be reduced to its ellipsis by
 * the other. A quarter of the box they share is the floor: below it a label
 * holds nothing worth reading, and "both gave way" and "one took everything"
 * are otherwise the same measurement.
 */
const SHARE_FLOOR = 0.25;

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
    const labelOf = (el: Element): HTMLElement =>
      el.querySelector<HTMLElement>("a, button, span") ?? (el as HTMLElement);
    const measure = (el: Element): Part => {
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
    return {
      documentScroll: document.documentElement.scrollWidth,
      documentClient: document.documentElement.clientWidth,
      row: measure(row),
      leading: measure(leading),
      leadingCount: leading.children.length,
      back: measure(labelOf(back)),
      // By position, not by tag: the back control is a button too whenever
      // the host supplies its own handler.
      name: measure(labelOf(leading.lastElementChild!)),
      controls: [...row.children]
        .filter((el) => el !== leading && (el as HTMLElement).offsetParent !== null)
        .map(measure),
    };
  });

  expect(m.documentScroll).toBe(m.documentClient);
  expect(isCut(m.row)).toBe(false);
  expect(isCut(m.leading)).toBe(false);

  // Both names are present, or the two measurements below are one measurement
  // taken twice.
  expect(m.leadingCount).toBe(2);
  const floor = m.leading.clientWidth * SHARE_FLOOR;
  expect(m.back.clientWidth).toBeGreaterThan(floor);
  expect(m.name.clientWidth).toBeGreaterThan(floor);
  expect(m.name.right).toBeLessThanOrEqual(m.leading.right);

  expect(m.controls.length).toBe(3);
  for (const control of m.controls) expect(overlaps(m.name, control)).toBe(false);
});
