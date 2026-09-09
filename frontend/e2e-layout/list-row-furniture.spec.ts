/**
 * Where a list row's trailing controls actually land, and what is left of
 * the name, measured in Chromium.
 *
 * ## Why this exists at all
 *
 * The defect is a width: on a phone the name column of a file row was
 * 119px of a 343px row, while the two controls beside it disagreed about
 * the touch floor — the star 28px and the `⋮` 44px — and the row drew a
 * 12px gap and 10px of its own padding on top of padding those controls
 * already carry inside themselves.
 *
 * None of that is a class name. `pointer-coarse:h-11` in a class list is a
 * string, and jsdom's `getBoundingClientRect()` is zeros, so no unit test
 * in this repository can tell a 44px target from a 28px one or say what
 * either leaves the name. This runs the real cascade in a real engine with
 * touch emulation on, and asserts the boxes.
 *
 * ## What it can see
 *
 * That both controls reach 44px on a coarse pointer and neither does on a
 * fine one; that nothing is drawn between them or after them on a coarse
 * pointer, so the row's own spacing is not added to theirs; that the
 * trailing padding survives at the `sm` breakpoint, where `sm:p-2` and
 * `pointer-coarse:pr-0` set the same property and only the emitted order
 * decides which wins; that the file rows and the folder rows end at the
 * same place, which is what keeps the two `⋮` columns lined up; that a
 * fine pointer measures the row it measured before the change, box for
 * box; and how much of the row the name gets, against the same row drawn
 * the way it was drawn before.
 *
 * ## What it cannot see
 *
 * Named so a green tick is not read as covering them.
 *
 * **Nothing here runs a component.** This file measures markup the fixture
 * writes, so reverting `FileListRow` to the separated layout leaves every
 * case below green. `listRowFurnitureFixtureParity.test.tsx` is what
 * connects the two: it renders the real rows in each state and compares
 * their trees with the fixture's. Two claims, neither of which is the
 * other.
 *
 * **No app is running**, so there is no page around the column: the row's
 * distance from the *screen* edge is the page's `px-4` plus what is
 * measured here, and that addition belongs in the PR body rather than in
 * an assertion this file could not check.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE_FILE = resolve(__dirname, "fixtures", "list-row-furniture.html");
const FIXTURE = pathToFileURL(FIXTURE_FILE).href;

/**
 * The shapes the fixture declares, read rather than restated. A name
 * written again here could not disagree with the table it is about.
 */
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

/**
 * The touch floor, and the boxes the row is built out of. Written here as
 * the numbers the assertions expect, not read off a measurement — a
 * threshold copied from the thing it checks cannot disagree with it
 * (`review-workflow.md`, detector rule 5).
 */
const FLOOR_PX = 44;
const THUMB_PX = 96;
/** `gap-3` — between the thumbnail and the name, and once more per gap the row draws. */
const GAP_PX = 12;
/** `p-2.5` under `sm`, `sm:p-2` at and above it. */
const PAD_PX = 10;
const PAD_SM_PX = 8;
/** The star's fine-pointer box: a 16px glyph in `p-1.5`. */
const STAR_FINE_PX = 28;
/** The overflow's fine-pointer box: `h-6 w-6`. */
const MORE_FINE_PX = 24;

/**
 * The column widths measured, and what the row is at each.
 *
 * 343 is the row a 375px phone draws (the page's `px-4` each side), and it
 * is the width every number in the report was taken at. 288 is the same
 * row on a 320px screen — the narrowest this app is drawn on, and the
 * width at which the name has least to give. 700 is above the `sm`
 * breakpoint, which is not decoration: `sm:p-2` and `pointer-coarse:pr-0`
 * set the same property from two single-class rules, so which one wins is
 * decided by the order Tailwind emits them and by nothing in either class
 * list. A suite that only ran under `sm` would never ask.
 *
 * The expected numbers are declared per width rather than derived from the
 * width, so that changing a width without changing what it should produce
 * is red.
 *
 * `fine` is one number for two rows on purpose: the grouping is cancelled
 * on a fine pointer, so the shipped row and the counterfactual are the same
 * box there, and the fine block asserts both against it.
 */
const WIDTHS = [
  {
    width: 343,
    pad: PAD_PX,
    label: "the row on a 375px phone",
    link: { grouped: 245, separated: 227, fine: 247 },
    name: { grouped: 137, separated: 119, fine: 139 },
  },
  {
    width: 288,
    pad: PAD_PX,
    label: "the row on a 320px phone",
    link: { grouped: 190, separated: 172, fine: 192 },
    name: { grouped: 82, separated: 64, fine: 84 },
  },
  {
    width: 700,
    pad: PAD_SM_PX,
    label: "a row above the sm breakpoint",
    link: { grouped: 604, separated: 588, fine: 608 },
    // Above `sm` the row also draws the date beside the name, so what the
    // name gets is the text block minus a `gap-2` and a string whose width
    // is the runner's font and the fixture's own placeholder date. The
    // link is the column this fixture can speak for at this width.
    name: null,
  },
] as const;

/**
 * Long enough to overflow the name column at every width above, so what is
 * measured is the column and not the string. Its own length is asserted
 * against the widest column below.
 */
const LONG_NAME =
  "A filename long enough that the column runs out before the name does, twice over";

/** The two pointer types, which is the other axis the loops below cross. */
const POINTERS = ["coarse", "fine"] as const;

/** Every case this file registers, recorded as it registers it. */
const registered: string[] = [];
const caseId = (width: number, pointer: string) => `${width} @ ${pointer}`;

test("registers exactly the widths and pointer types this file measures", () => {
  // Both sides enumerated, and the expected side recomputed from the two
  // axes rather than read off the loop — so a `.slice()` between `WIDTHS`
  // and the `test()` calls is red, and so is swapping one width for
  // another.
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
  // And the column below draws every one of them. `ALL_SHAPES` is what
  // `buildListColumn` is told to render, so comparing what came back
  // against it would be comparing the observation with its own input:
  // dropping a name from `ALL_SHAPES` shrinks both sides at once and stays
  // green (`review-workflow.md`, detector rule 5). The fixture's table is
  // the other object, and the line above pins it against literals.
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
  // Against the fixture's table rather than against `ALL_SHAPES`, for the
  // reason the registration test gives: what the page drew has to reach a
  // set it was not built from.
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
      // Emulation quietly not applying would make every assertion below a
      // measurement of the fine-pointer row that happened to be phrased
      // as a claim about the coarse one.
      expect(m.coarse).toBe(true);

      const file = by.file;
      expect(file.row.width).toBe(w.width);

      const [star, more] = file.controls.map((c) => c.box);

      // 1. Both controls reach the floor. This is the defect stated
      //    directly: before the change the star was 28 and the `⋮` 44 on
      //    the same row.
      expect(star.width).toBe(FLOOR_PX);
      expect(star.height).toBe(FLOOR_PX);
      expect(more.width).toBe(FLOOR_PX);
      expect(more.height).toBe(FLOOR_PX);

      // 2. Nothing is drawn between them. Their own boxes already carry
      //    14px each side of a 16px glyph, so a gap here is the same
      //    separation drawn twice.
      expect(star.right).toBe(more.left);

      // 3. Nor after them: the row's trailing padding is gone, so the
      //    last control's own padding is what stands between the glyph
      //    and the row's edge. The leading padding is untouched — the
      //    thumbnail has none of its own to stand in for it.
      expect(more.right).toBe(file.row.right);
      expect(file.thumb!.left - file.row.left).toBe(w.pad);

      // 4. Nor in front of the group.
      expect(file.link.right).toBe(star.left);

      // 5. The folder rows end where the file rows do. They are the same
      //    column on the same screen, so a trailing edge that moved in
      //    one and not the other leaves two `⋮` columns out of line —
      //    and the folder row reaches it with one control where the file
      //    row has two, which is the case a recipe applied by directory
      //    rather than by role would have missed.
      const folderMore = by.folder.controls[0].box;
      expect(by.folder.row.right).toBe(file.row.right);
      expect(folderMore.right).toBe(more.right);
      expect(folderMore.width).toBe(FLOOR_PX);

      // 6. A row with one trailing control puts it in the same place as
      //    the row with two puts its last.
      const noStarMore = by.fileNoStar.controls[0].box;
      expect(noStarMore.right).toBe(more.right);

      // 7. Selection mode stands the `⋮` down and keeps the star. Both
      //    call sites that pass `selectable` pass `onFavoriteToggle` too,
      //    so this is a row whose group holds one control — and the floor
      //    and the trailing edge are the group's, not the pair's, so it
      //    lands in the same column as the rows with two.
      //    The count first, so a row that drew none fails on the claim
      //    rather than on reading `[0]` of nothing.
      expect(by.selectable.controls).toHaveLength(1);
      const selStar = by.selectable.controls[0].box;
      expect(selStar.width).toBe(FLOOR_PX);
      expect(selStar.height).toBe(FLOOR_PX);
      expect(selStar.right).toBe(more.right);
      expect(by.selectable.link.right).toBe(selStar.left);
      //    Its leading padding is the checkbox's, and it is the row's own:
      //    the click area starts where the thumbnail does elsewhere.
      expect(by.selectable.link.left - by.selectable.row.left).toBe(w.pad);

      // 8. What the change is worth, against the same row drawn the way
      //    it was drawn before: the two 12px gaps and the trailing
      //    padding come back to the text column, and the star's growth to
      //    the floor takes 16 of them away again.
      //
      //    Each width is asserted twice over — once as the literal
      //    declared in `WIDTHS` and once as the arithmetic — so a
      //    mechanism rewritten to fit a run still has to produce the
      //    number, and a number edited to match a run still has to
      //    satisfy the mechanism.
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
        // Under `sm` the date is `display: none`, so the name span *is*
        // the text block and the link's gain lands on it whole.
        expect(before.name.width).toBe(w.name.separated);
        expect(file.name.width).toBe(w.name.grouped);
        expect(file.name.width).toBe(file.link.width - THUMB_PX - GAP_PX);
      }

      // And the name is what ran out, not the string. A column wider than
      // the name would report a width about the string at every width
      // above and about the column at none of them.
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

      // Every coarse-only declaration is off, so the row is the one a
      // desktop has always drawn: the smaller boxes, the row's gap in
      // front of the group and inside it, and its trailing padding.
      expect(star.width).toBe(STAR_FINE_PX);
      expect(more.width).toBe(MORE_FINE_PX);
      expect(more.left - star.right).toBe(GAP_PX);
      expect(file.row.right - more.right).toBe(w.pad);
      expect(star.left - file.link.right).toBe(GAP_PX);

      // And "alone" is the counterfactual's own numbers, not a phrase in
      // the title: `separated` is the row as it was drawn before this
      // change, and at a fine pointer the shipped row has to measure the
      // same in every box the coarse block moves. Without this the
      // grouping can take the row's gap between the two glyphs away from
      // every desktop row and nothing here says so — which is what the
      // first round of this change did, with the title above still
      // reading "leaves the fine-pointer row alone".
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

      // Each width twice over, the way the coarse block asserts its own:
      // once as the literal declared in `WIDTHS` and once as the
      // arithmetic of the boxes the row is built out of.
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
