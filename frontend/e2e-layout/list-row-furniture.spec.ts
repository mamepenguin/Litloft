/**
 * Where a list row's trailing controls actually land, and what is left of
 * the name, measured in Chromium with touch emulation on.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "list-row-furniture.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

const SHAPES: Record<string, unknown> = JSON.parse(
  readFileSync(FIXTURE_FILE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface RowMeasurement {
  shape: string;
  row: Box;
  link: Box;
  thumb: Box | null;
  name: Box;
  nameTruncated: boolean;
  controls: { label: string; box: Box }[];
}

interface Measurement {
  viewport: { width: number; height: number };
  coarse: boolean;
  rows: RowMeasurement[];
}

declare global {
  interface Window {
    buildListColumn: (spec: {
      width: number;
      shapes: string[];
      name: string;
    }) => void;
    measureRows: () => Measurement;
  }
}

/** Declared, not read off a measurement. */
const FLOOR_PX = 44;
const THUMB_PX = 96;
const GAP_PX = 12;
const PAD_PX = 10;
const PAD_SM_PX = 8;
const STAR_FINE_PX = 28;
const MORE_FINE_PX = 24;
/** A folder row with its bottom border: the 44px floor, or a 20px line plus padding. */
const FOLDER_ROW_COARSE_PX = 45;

/**
 * 343 and 288 are the row on a 375px and a 320px phone (the page's `px-4`
 * each side). 700 is above `sm`, where `.sm\:p-2` and
 * `.pointer-coarse\:pr-0` set the same property from two single-class
 * rules and only the order Tailwind emits them decides which wins.
 *
 * `fine` is one number for two rows on purpose: the grouping is cancelled
 * on a fine pointer, so the shipped row and the counterfactual are the same
 * box there.
 */
const WIDTHS = [
  {
    width: 343,
    pad: PAD_PX,
    label: "the row on a 375px phone",
    folderFine: 45,
    link: { grouped: 245, separated: 227, fine: 247 },
    name: { grouped: 137, separated: 119, fine: 139 },
  },
  {
    width: 288,
    pad: PAD_PX,
    label: "the row on a 320px phone",
    folderFine: 45,
    link: { grouped: 190, separated: 172, fine: 192 },
    name: { grouped: 82, separated: 64, fine: 84 },
  },
  {
    width: 700,
    pad: PAD_SM_PX,
    label: "a row above the sm breakpoint",
    folderFine: 41,
    link: { grouped: 604, separated: 588, fine: 608 },
    // Above `sm` the row also draws the date beside the name, whose width
    // is the runner's font.
    name: null,
  },
] as const;

/** Long enough to overflow the name column at every width above. */
const LONG_NAME =
  "A filename long enough that the column runs out before the name does, twice over";

const POINTERS = ["coarse", "fine"] as const;

const registered: string[] = [];
const caseId = (width: number, pointer: string) => `${width} @ ${pointer}`;

test("registers exactly the widths and pointer types this file measures", () => {
  expect(registered).toEqual(
    POINTERS.flatMap((p) => WIDTHS.map((w) => caseId(w.width, p))),
  );
  expect(POINTERS).toEqual(["coarse", "fine"]);
  expect(WIDTHS.map((w) => w.width)).toEqual([343, 288, 700]);
  expect(Object.keys(SHAPES).sort()).toEqual([
    "file",
    "fileNoStar",
    "folder",
    "selectable",
    "separated",
  ]);
  expect([...ALL_SHAPES].sort()).toEqual(Object.keys(SHAPES).sort());
});

const ALL_SHAPES = ["file", "fileNoStar", "selectable", "folder", "separated"];

async function measure(page: import("@playwright/test").Page, width: number) {
  await page.setViewportSize({ width: width + 40, height: 900 });
  await page.goto(FIXTURE);
  await page.evaluate(
    (spec) => window.buildListColumn(spec),
    { width, shapes: ALL_SHAPES, name: LONG_NAME },
  );
  const m = await page.evaluate(() => window.measureRows());
  const by = Object.fromEntries(m.rows.map((r) => [r.shape, r]));
  // Against the fixture's table rather than against `ALL_SHAPES`, which
  // is the input the page was built from.
  expect(Object.keys(by).sort()).toEqual(Object.keys(SHAPES).sort());
  return { m, by };
}

test.describe("with a finger", () => {
  test.use({ hasTouch: true });

  for (const w of WIDTHS) {
    registered.push(caseId(w.width, "coarse"));

    test(`groups the trailing controls at ${w.width}px — ${w.label}`, async ({
      page,
    }) => {
      const { m, by } = await measure(page, w.width);
      expect(m.coarse).toBe(true);

      const file = by.file;
      expect(file.row.width).toBe(w.width);

      const [star, more] = file.controls.map((c) => c.box);

      expect(star.width).toBe(FLOOR_PX);
      expect(star.height).toBe(FLOOR_PX);
      expect(more.width).toBe(FLOOR_PX);
      expect(more.height).toBe(FLOOR_PX);

      expect(star.right).toBe(more.left);

      expect(more.right).toBe(file.row.right);
      expect(file.thumb!.left - file.row.left).toBe(w.pad);

      expect(file.link.right).toBe(star.left);

      const folderMore = by.folder.controls[0].box;
      expect(by.folder.row.right).toBe(file.row.right);
      expect(folderMore.right).toBe(more.right);
      expect(folderMore.width).toBe(FLOOR_PX);
      expect(by.folder.row.height).toBe(FOLDER_ROW_COARSE_PX);
      expect(by.folder.thumb!.left).toBe(file.thumb!.left);
      expect(by.folder.name.left).toBe(file.name.left);

      const noStarMore = by.fileNoStar.controls[0].box;
      expect(noStarMore.right).toBe(more.right);

      expect(by.selectable.controls).toHaveLength(1);
      const selStar = by.selectable.controls[0].box;
      expect(selStar.width).toBe(FLOOR_PX);
      expect(selStar.height).toBe(FLOOR_PX);
      expect(selStar.right).toBe(more.right);
      expect(by.selectable.link.right).toBe(selStar.left);
      expect(by.selectable.link.left - by.selectable.row.left).toBe(w.pad);

      const before = by.separated;
      expect(file.link.width).toBe(w.link.grouped);
      expect(file.link.width).toBe(w.width - w.pad - FLOOR_PX * 2);
      expect(before.link.width).toBe(w.link.separated);
      expect(before.link.width).toBe(
        w.width - w.pad * 2 - GAP_PX * 2 - STAR_FINE_PX - FLOOR_PX,
      );
      expect(file.link.width - before.link.width).toBe(
        GAP_PX * 2 + w.pad - (FLOOR_PX - STAR_FINE_PX),
      );

      if (w.name) {
        expect(before.name.width).toBe(w.name.separated);
        expect(file.name.width).toBe(w.name.grouped);
        expect(file.name.width).toBe(file.link.width - THUMB_PX - GAP_PX);
      }

      expect(file.nameTruncated).toBe(true);
      expect(before.nameTruncated).toBe(true);
    });
  }
});

test.describe("with a mouse", () => {
  test.use({ hasTouch: false });

  for (const w of WIDTHS) {
    registered.push(caseId(w.width, "fine"));

    test(`leaves the fine-pointer row alone at ${w.width}px`, async ({
      page,
    }) => {
      const { m, by } = await measure(page, w.width);
      expect(m.coarse).toBe(false);

      const file = by.file;
      const [star, more] = file.controls.map((c) => c.box);

      expect(star.width).toBe(STAR_FINE_PX);
      expect(more.width).toBe(MORE_FINE_PX);
      expect(more.left - star.right).toBe(GAP_PX);
      expect(file.row.right - more.right).toBe(w.pad);
      expect(star.left - file.link.right).toBe(GAP_PX);

      expect(by.folder.row.height).toBe(w.folderFine);
      expect(by.folder.controls[0].box.right).toBe(more.right);
      expect(by.folder.thumb!.left).toBe(file.thumb!.left);
      expect(by.folder.name.left).toBe(file.name.left);

      const before = by.separated;
      expect(before.controls).toHaveLength(2);
      const [starBefore, moreBefore] = before.controls.map((c) => c.box);
      expect(star.width).toBe(starBefore.width);
      expect(more.width).toBe(moreBefore.width);
      expect(more.left - star.right).toBe(moreBefore.left - starBefore.right);
      expect(file.link.width).toBe(before.link.width);
      expect(file.row.right - more.right).toBe(
        before.row.right - moreBefore.right,
      );

      expect(file.link.width).toBe(w.link.fine);
      expect(file.link.width).toBe(
        w.width - w.pad * 2 - GAP_PX * 2 - STAR_FINE_PX - MORE_FINE_PX,
      );
      if (w.name) {
        expect(file.name.width).toBe(w.name.fine);
        expect(before.name.width).toBe(w.name.fine);
        expect(file.name.width).toBe(file.link.width - THUMB_PX - GAP_PX);
      }
      expect(file.nameTruncated).toBe(true);
      expect(before.nameTruncated).toBe(true);
    });
  }
});
