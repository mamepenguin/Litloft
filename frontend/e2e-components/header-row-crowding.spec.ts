/**
 * A header row holding more name than it has width, measured in Chromium
 * with the real rows: the folder listing's header, the file-detail chrome in
 * each of the forms it draws, and the archive toolbar.
 *
 * A name that cannot narrow does not always leave its box — it can wrap, and
 * grow the row instead. Every case here measures how many line boxes a label
 * occupies as well as where its edges are.
 *
 * Both rows wrap some segments and not others, and a wrapper whose child
 * truncates never reports that child's overflow, so every name is measured on
 * the element that carries the text — `labelOf`.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

type Box = { left: number; right: number; top: number; bottom: number };
type Cut = { scrollWidth: number; clientWidth: number };
type Part = Box & Cut & { lines: number; text: string };

/**
 * `scrollWidth` and `clientWidth` are integer reads of a fractional layout,
 * so a label that fits to within a fraction of a pixel reports one more than
 * the other. A pixel of slack keeps that off the result.
 */
const isCut = (c: Cut) => c.scrollWidth > c.clientWidth + 1;

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

type Row = {
  documentScroll: number;
  documentClient: number;
  trail: Part;
  ancestors: Part[];
  leaf: Part;
  /** The folded-trail marker's accessible name, or null when it is absent. */
  marker: string | null;
  /** Every name the trail draws, in order, the marker written as "…". */
  names: string[];
  /** Everything visible the row holds beside the trail. */
  controls: Box[];
};

/**
 * Runs in the page. Shared by every case below, which is why it is a string
 * rather than a closure: `page.evaluate` sends one function, not a scope.
 */
const MEASURE = `
  const labelOf = (el) => el.querySelector("a, button, span") ?? el;
  // Distinct tops rather than a rect count: a range over a truncated label
  // yields more than one rect on the same line.
  const lines = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set();
    for (const r of range.getClientRects()) {
      if (r.width > 0 && r.height > 0) tops.add(Math.round(r.top));
    }
    return tops.size;
  };
  const measure = (el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      lines: lines(el), text: (el.textContent ?? "").trim(),
    };
  };
`;

async function openPage(page: Page, arrangement: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("about:blank");
  await page.goto(`${FIXTURE}#${arrangement}`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
}

async function readTrail(
  page: Page,
  selectors: { row?: string; trail: string },
): Promise<Row> {
  return page.evaluate(
    new Function(
      "sel",
      `${MEASURE}
      const trail = document.querySelector(sel.trail);
      const row = sel.row ? document.querySelector(sel.row) : trail.parentElement;
      const leaf = trail.lastElementChild;
      // The segments are read off the DOM rather than named, so one added to
      // either row is measured without being registered here.
      const named = [...trail.children]
        .map(labelOf)
        .filter((label) => (label.textContent ?? "").trim());
      const leafLabel = labelOf(leaf);
      const marker = named.find((el) => el.textContent.trim() === "\\u2026");
      return {
        documentScroll: document.documentElement.scrollWidth,
        documentClient: document.documentElement.clientWidth,
        trail: measure(trail),
        ancestors: named.filter((el) => el !== leafLabel && el !== marker).map(measure),
        leaf: measure(leafLabel),
        marker: marker ? marker.getAttribute("aria-label") : null,
        names: named.map((el) => el.textContent.trim()),
        controls: [...row.children]
          .filter((el) => !el.contains(trail) && el.offsetParent !== null)
          .map(measure),
      };`,
    ) as (sel: { row?: string; trail: string }) => Row,
    selectors,
  );
}

/**
 * `leafCut` and `ancestors` are declared, not read off the run. At the phone
 * width the fixture's path does not fit even with every ancestor at zero, so
 * the last segment has to give too; above it there is room and it must not.
 */
const NARROW_TO_WIDE = [
  { px: 375, leafCut: true },
  { px: 768, leafCut: false },
  { px: 1024, leafCut: false },
] as const;

/**
 * A link narrower than this holds no characters and is not something a
 * finger or a pointer can land on.
 */
const REACHABLE_PX = 24;

const FILE_DETAIL = {
  row: "[data-testid='file-detail-chrome']",
  trail: "[data-testid='file-detail-chrome'] nav",
} as const;

const CASES = [
  {
    name: "the folder listing header",
    arrangement: "folder-listing-header-deep",
    widths: NARROW_TO_WIDE,
    // The trail's own row inside the header is the nav's parent.
    selectors: { trail: "header nav" },
    controls: 1,
    // Drive, marker, parent, leaf — the marker and the leaf are counted
    // separately, leaving the drive and the parent.
    ancestors: 2,
  },
  {
    name: "the file-detail chrome",
    arrangement: "file-detail-chrome-deep",
    // Below `md` this row draws a back control instead of a trail, so the
    // trail is only measurable at the widths that draw it.
    widths: [
      { px: 768, leafCut: true },
      { px: 1024, leafCut: false },
    ] as const,
    selectors: FILE_DETAIL,
    controls: 2,
    // The caller draws the leaf, so the trail's own last item is an
    // ancestor: drive, marker, parent.
    ancestors: 2,
  },
  {
    name: "the file-detail chrome during collection playback",
    arrangement: "file-detail-chrome-collection",
    // This form draws the back control beside the trail at every width, and
    // caps it at 45%, so the trail has roughly half the row and the name
    // gives at one width more than the others.
    widths: [
      { px: 768, leafCut: true },
      { px: 1024, leafCut: false },
    ] as const,
    selectors: FILE_DETAIL,
    // Three, not two: this is the form that draws the back control beside
    // the trail rather than instead of it.
    controls: 3,
    ancestors: 2,
  },
  {
    name: "the archive toolbar",
    arrangement: "archive-toolbar-deep",
    widths: NARROW_TO_WIDE,
    selectors: { trail: "[data-testid='archive-trail']" },
    controls: 1,
    ancestors: 2,
  },
] as const;

for (const c of CASES) {
  for (const { px, leafCut } of c.widths) {
    test(`${c.name} at ${px}px: the trail stays inside its own box, on one line`, async ({
      page,
    }) => {
      await openPage(page, c.arrangement, px);
      const m = await readTrail(page, c.selectors);
      expect(isCut(m.trail)).toBe(false);
      expect(m.documentScroll).toBe(m.documentClient);
      for (const label of [...m.ancestors, m.leaf]) expect(label.lines).toBe(1);
      expect(m.controls.length).toBe(c.controls);
      for (const control of m.controls) expect(overlaps(m.trail, control)).toBe(false);
    });

    test(`${c.name} at ${px}px: the ancestors give way, and the last segment gives last`, async ({
      page,
    }) => {
      await openPage(page, c.arrangement, px);
      const m = await readTrail(page, c.selectors);
      // Declared: a count read off the run cannot notice a segment that
      // stopped being drawn.
      expect(m.ancestors.length).toBe(c.ancestors);
      expect(isCut(m.leaf)).toBe(leafCut);
      // The ordering, whichever width this is: the last segment gives only
      // once there is nothing left to take from the rest.
      if (isCut(m.leaf)) expect(m.ancestors.every(isCut)).toBe(true);
      expect(m.leaf.right).toBeLessThanOrEqual(m.trail.right);
      // Narrowing costs legibility, not reach.
      for (const a of m.ancestors) expect(a.clientWidth).toBeGreaterThan(REACHABLE_PX);
    });
  }
}

/**
 * A trail too deep to draw keeps where the reader is and how they got into
 * the drive, and folds what is between behind a marker that leads to the
 * deepest of them.
 */
const FOLD_CASES = [
  {
    name: "the folder listing header",
    arrangement: "folder-listing-header-deep",
    selectors: { trail: "header nav" },
    names: ["Household Archive", "…", "Screenshots", "Archived-2026-Originals-And-Masters"],
    marker: "Attachments",
  },
  {
    name: "the archive toolbar",
    arrangement: "archive-toolbar-deep",
    selectors: { trail: "[data-testid='archive-trail']" },
    names: ["backup-2026-09.zip", "…", "Screenshots", "Archived-2026-Originals-And-Masters"],
    marker: "Attachments",
  },
  {
    name: "the file-detail chrome",
    arrangement: "file-detail-chrome-deep",
    selectors: FILE_DETAIL,
    names: [
      "Household Archive",
      "…",
      "Archived-2026-Originals-And-Masters",
      "2026-09-annual-report-final-revision-board-approved-copy-for-distribution.md",
    ],
    marker: "Screenshots",
  },
] as const;

for (const c of FOLD_CASES) {
  test(`${c.name}: a trail too deep to draw folds behind one marker`, async ({
    page,
  }) => {
    await openPage(page, c.arrangement, 1024);
    const m = await readTrail(page, c.selectors);
    expect(m.names).toEqual([...c.names]);
    expect(m.marker).toBe(c.marker);
  });
}

test("a trail shallow enough to draw is drawn whole", async ({ page }) => {
  await openPage(page, "folder-listing-header-shallow", 1024);
  const m = await readTrail(page, { trail: "header nav" });
  expect(m.names).toEqual(["Household Archive", "Documents", "Reference"]);
  expect(m.marker).toBe(null);
});

/**
 * Below `md` the same row draws no trail: a back control naming the parent
 * folder, and — for a note — the rename control, which is the file's name
 * and a button at once.
 */
async function readLeadingRow(page: Page) {
  return page.evaluate(
    new Function(`${MEASURE}
    const row = document.querySelector("[data-testid='file-detail-chrome']");
    const back = document.querySelector("[data-testid='file-detail-back']");
    const leading = back.parentElement;
    return {
      documentScroll: document.documentElement.scrollWidth,
      documentClient: document.documentElement.clientWidth,
      row: measure(row),
      leading: measure(leading),
      leadingCount: leading.children.length,
      back: measure(labelOf(back)),
      // By position, not by tag: the back control is a button too whenever
      // the host supplies its own handler.
      name: measure(labelOf(leading.lastElementChild)),
      controls: [...row.children]
        .filter((el) => el !== leading && el.offsetParent !== null)
        .map(measure),
    };`) as () => {
      documentScroll: number;
      documentClient: number;
      row: Part;
      leading: Part;
      leadingCount: number;
      back: Part;
      name: Part;
      controls: Box[];
    },
  );
}

test("a note's row on a phone: the name and the parent folder give way together", async ({
  page,
}) => {
  await openPage(page, "file-detail-chrome-note", 390);
  const m = await readLeadingRow(page);

  expect(m.documentScroll).toBe(m.documentClient);
  expect(isCut(m.row)).toBe(false);
  expect(isCut(m.leading)).toBe(false);

  // Both names are present, or the two measurements below are one
  // measurement taken twice.
  expect(m.leadingCount).toBe(2);
  // Declared: this arrangement asks for more than the row has, so each of
  // the two has to give. One of them whole is one of them having taken
  // everything — which is what `flex-none` and `flex-1` each do here.
  expect(isCut(m.back)).toBe(true);
  expect(isCut(m.name)).toBe(true);
  expect(m.back.lines).toBe(1);
  expect(m.name.lines).toBe(1);
  expect(m.name.right).toBeLessThanOrEqual(m.leading.right);

  expect(m.controls.length).toBe(3);
  for (const control of m.controls) expect(overlaps(m.name, control)).toBe(false);
});

test("a plain file's row on a phone: the back control is the only name, and it stays in the row", async ({
  page,
}) => {
  await openPage(page, "file-detail-chrome-plain-phone", 390);
  const m = await readLeadingRow(page);

  expect(m.documentScroll).toBe(m.documentClient);
  expect(isCut(m.leading)).toBe(false);
  // No `titleNode`, so the row drops the file's name here and the back
  // control is alone.
  expect(m.leadingCount).toBe(1);
  expect(m.back.lines).toBe(1);
  expect(m.back.right).toBeLessThanOrEqual(m.leading.right);
  expect(m.controls.length).toBe(2);
  for (const control of m.controls) expect(overlaps(m.leading, control)).toBe(false);
});
