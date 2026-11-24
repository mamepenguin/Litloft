/**
 * The PDF Pages rail on the real file page, with a 225-page document whose
 * page 9 is landscape. Columns, which cells the rail draws and where it
 * scrolls all depend on boxes only a browser lays out.
 */

import { test, expect } from "@playwright/test";

import { serveFixture } from "./fixtureOrigin";
import {
  FIRST_RATIO,
  PAGES,
  PHONE,
  byPage,
  currentPages,
  expectCentred,
  expectGrid,
  expectWithinExtendedBox,
  jumpTo,
  measure,
  nonPlaceholder,
  open,
  raiseSheet,
  ratio,
  scrollRail,
  scrolledSinceSnapshot,
  selectTab,
  showPages,
  snapshotScroll,
} from "./pdf-pages-grid.measure";

test.beforeEach(({ context }) => serveFixture(context));

/* ------------------------------------------------------------------ *
 * SPEC-CORE-173: the grid
 * ------------------------------------------------------------------ */

test("SPEC-CORE-173 I1 I7 I8: at 1440×900 the rail is three equal columns of bordered white pictures, with no sideways overflow", async ({
  page,
}) => {
  await open(page);
  await showPages(page);

  const m = await measure(page);
  expectGrid(m);
  for (const c of m.cells) {
    expect(c.pictureBorder, `page ${c.page} has a bordered picture`).not.toBeNull();
    expect(c.pictureBorder!.style).toBe("solid");
    expect(c.pictureBorder!.color).not.toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
    expect(c.pictureBorder!.background).toBe("rgb(255, 255, 255)");
  }
});

test("SPEC-CORE-173 I4: the current page has the accent outline on its picture and a semibold number", async ({
  page,
}) => {
  await open(page);
  await showPages(page);
  await jumpTo(page, 2);
  await expect.poll(() => measure(page).then(currentPages)).toEqual([2]);

  const m = await measure(page);
  const current = byPage(m, 2);
  const other = byPage(m, 1);
  expect(current.pictureOutline).toEqual({ width: "2px", style: "solid", offset: "2px" });
  expect(other.pictureOutline!.style).toBe("none");
  expect(current.number!.weight).toBeGreaterThanOrEqual(600);
  expect(other.number!.weight).toBeLessThan(600);
  expect(current.number!.color).not.toBe(other.number!.color);
});

test("SPEC-CORE-173 I8: the landscape page takes its own proportion once drawn, every other picture keeps the first page's", async ({
  page,
}) => {
  await open(page);
  await showPages(page);
  await expect.poll(() => measure(page).then((m) => byPage(m, 9).state)).toBe("drawn");

  const m = await measure(page);
  expect(ratio(byPage(m, 9).picture)).toBeCloseTo(612 / 792, 2);
  for (const c of m.cells.filter((c) => c.page !== 9)) {
    expect(Math.abs(ratio(c.picture) / FIRST_RATIO - 1), `page ${c.page}`).toBeLessThan(0.005);
  }
});

test("SPEC-CORE-173 I8: a page 1.9% off the first page keeps the first page's box, one 2.1% off takes its own", async ({
  page,
}) => {
  await open(page, { pdf: "long-near" });
  await showPages(page);
  await expect
    .poll(() => measure(page).then((m) => [byPage(m, 10).state, byPage(m, 11).state]))
    .toEqual(["drawn", "drawn"]);

  const m = await measure(page);
  expect(Math.abs(ratio(byPage(m, 10).picture) / FIRST_RATIO - 1)).toBeLessThan(0.005);
  expect(Math.abs(ratio(byPage(m, 11).picture) / (FIRST_RATIO * 1.021) - 1)).toBeLessThan(0.005);
});

/* ------------------------------------------------------------------ *
 * SPEC-CORE-174: every page reachable, bounded drawing, following
 * ------------------------------------------------------------------ */

test("SPEC-CORE-174 I3: opened at page 1, the rail draws at most 24 pages, all within half a scroller height of view", async ({
  page,
}) => {
  await open(page);
  await showPages(page);
  await expect
    .poll(() => measure(page).then((m) => [1, 2, 3].map((p) => byPage(m, p).state)))
    .toEqual(["drawn", "drawn", "drawn"]);
  await page.waitForTimeout(500);

  const m = await measure(page);
  expect(nonPlaceholder(m).length).toBeLessThanOrEqual(24);
  expectWithinExtendedBox(m);
});

test("SPEC-CORE-174 I2 I3 I6: opened at page 100, page 100 is centred and page 1 is reached by scrolling", async ({
  page,
}) => {
  await open(page);
  await jumpTo(page, 100);
  await showPages(page);
  await expectCentred(page, 100);
  await page.waitForTimeout(500);

  const m = await measure(page);
  expect(m.cells.map((c) => c.page)).toEqual(Array.from({ length: PAGES }, (_, i) => i + 1));
  expect(currentPages(m)).toEqual([100]);
  expect(byPage(m, 1).state).toBe("placeholder");
  expectWithinExtendedBox(m);

  await scrollRail(page, { top: 0 });
  await expect.poll(() => measure(page).then((m) => byPage(m, 1).state)).toBe("drawn");
});

test("SPEC-CORE-174 I6: a page already in view scrolls nothing; a jump scrolls only the rail's scroller", async ({
  page,
}) => {
  await open(page);
  await showPages(page);

  await snapshotScroll(page);
  await jumpTo(page, 2);
  await expect.poll(() => measure(page).then(currentPages)).toEqual([2]);
  await page.waitForTimeout(300);
  expect(await scrolledSinceSnapshot(page)).toEqual([]);

  await jumpTo(page, 100);
  await expectCentred(page, 100);
  expect(await scrolledSinceSnapshot(page)).toEqual(["scroller"]);
});

test("SPEC-CORE-174 I6: a jump to the last page leaves the rail at the end of its range", async ({
  page,
}) => {
  await open(page);
  await showPages(page);
  await jumpTo(page, 225);
  await expectCentred(page, 225);

  const m = await measure(page);
  expect(m.scroller.scrollTop).toBeGreaterThanOrEqual(
    m.scroller.scrollHeight - m.scroller.clientHeight - 1,
  );
});

test("SPEC-CORE-174 I10: leaving Pages and returning on the same page keeps the rail's scroll; a page change while away is followed on return", async ({
  page,
}) => {
  await open(page);
  await showPages(page);
  await jumpTo(page, 100);
  await expectCentred(page, 100);

  const left = await scrollRail(page, { by: -400 });
  await page.waitForTimeout(200);
  await selectTab(page, "Info");
  await selectTab(page, "Pages");
  await page.waitForTimeout(300);
  expect((await measure(page)).scroller.scrollTop).toBe(left);

  await selectTab(page, "Info");
  const since = await page.evaluate(() => performance.now());
  await jumpTo(page, 150);
  await page.waitForTimeout(300);
  const writesWhileAway = await page.evaluate((since) => {
    const log = (window as unknown as { __scrollWrites: { target: Element; at: number }[] })
      .__scrollWrites;
    const rail = document.querySelector('ol[aria-label="Page thumbnails"]')!;
    return log.filter(
      (w) => w.at >= since && (w.target.contains(rail) || rail.contains(w.target)),
    ).length;
  }, since);
  expect(writesWhileAway).toBe(0);

  await selectTab(page, "Pages");
  await expectCentred(page, 150);
});

test("SPEC-CORE-174 I3: scrolled from the first page to the last, the rail never holds more than 120 drawn pages", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page);
  await showPages(page);
  let most = 0;
  for (;;) {
    const m = await measure(page);
    const inView = m.cells.filter(
      (c) => c.cell.bottom > m.visible.top && c.cell.top < m.visible.bottom,
    );
    await expect
      .poll(() =>
        measure(page).then((now) =>
          inView.every((c) => byPage(now, c.page).state !== "placeholder"),
        ),
      )
      .toBe(true);
    const drawn = (await measure(page)).cells.filter((c) => c.state === "drawn").length;
    expect(drawn).toBeLessThanOrEqual(120);
    most = Math.max(most, drawn);
    if (m.scroller.scrollTop >= m.scroller.scrollHeight - m.scroller.clientHeight - 1) break;
    await scrollRail(page, { by: m.scroller.clientHeight * 0.75 });
  }

  await expect.poll(() => measure(page).then((m) => byPage(m, PAGES).state)).toBe("drawn");
  const end = await measure(page);
  expect(most).toBe(120);
  expect(byPage(end, 1).state).toBe("placeholder");
});

/* ------------------------------------------------------------------ *
 * The phone sheet
 * ------------------------------------------------------------------ */

test("SPEC-CORE-173 I1 SPEC-CORE-174 I3: in the 390×844 sheet the rail is three columns and draws only near the view", async ({
  page,
}) => {
  await open(page, { viewport: PHONE });
  await raiseSheet(page);
  await showPages(page);
  await expect.poll(() => measure(page).then((m) => byPage(m, 1).state)).toBe("drawn");
  await page.waitForTimeout(500);

  const m = await measure(page);
  expect(m.scroller.isSheet).toBe(true);
  expectGrid(m);
  expectWithinExtendedBox(m);
});

test("SPEC-CORE-174 I3 I6: in the 390×844 sheet, opened at page 100, page 100 is centred below the sticky strip and page 1 is a placeholder", async ({
  page,
}) => {
  await open(page, { viewport: PHONE });
  await jumpTo(page, 100);
  await raiseSheet(page);
  await showPages(page);
  await expectCentred(page, 100);
  await page.waitForTimeout(500);

  const m = await measure(page);
  expect(m.scroller.isSheet).toBe(true);
  expect(m.scroller.stickyTop).toMatch(/^\d+(\.\d+)?px$/);
  expect(m.visible.top - m.box.top).toBeGreaterThan(0);
  expect(Math.abs(m.visible.top - m.box.top - m.scroller.tabStripBottom!)).toBeLessThanOrEqual(1);
  expect(byPage(m, 100).cell.top).toBeGreaterThanOrEqual(m.visible.top);
  expect(byPage(m, 1).state).toBe("placeholder");
  expectWithinExtendedBox(m);
});
