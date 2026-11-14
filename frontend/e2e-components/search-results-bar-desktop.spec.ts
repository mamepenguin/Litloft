import { test, expect } from "@playwright/test";

import {
  ARRANGEMENT,
  measure,
  nothingAboveTheField,
  oneOfEach,
  measureOverwrite,
  open,
  openChanged,
  overlapVertically,
  positionsHoldWithoutTheCheckbox,
} from "./search-results-bar.cases";

const DESKTOP = 1280;

nothingAboveTheField(DESKTOP);
oneOfEach(DESKTOP);
positionsHoldWithoutTheCheckbox(DESKTOP);

test(`SPEC-CORE-066 I10 / SPEC-CORE-039 I15 at ${DESKTOP}px: the field has its row, and the bar is one row with the count right of Scene search`, async ({
  page,
}) => {
  await open(page, ARRANGEMENT.files, DESKTOP);
  const m = await measure(page);

  expect(m.barHoldsField).toBe(false);
  expect(m.field.bottom).toBeLessThanOrEqual(m.bar.top + 0.5);
  const controls = [...m.switches, ...m.checkboxes, ...m.counts, ...m.views, ...m.sorts, ...m.mores];
  expect(m.views).toHaveLength(1);
  expect(m.sorts).toHaveLength(1);
  for (const a of controls) for (const b of controls) expect(overlapVertically(a, b)).toBe(true);
  expect(m.counts[0].left).toBeGreaterThan(m.checkboxes[0].right);
  expect(m.views[0].left).toBeLessThan(m.sorts[0].left);
  expect(m.sorts[0].left).toBeLessThan(m.mores[0].left);
});

test(`SPEC-CORE-066 I10 at ${DESKTOP}px: Passages rows start at the bar's left edge within max-w-list-row`, async ({
  page,
}) => {
  await open(page, ARRANGEMENT.passages, DESKTOP);
  const m = await measure(page);

  expect(m.listRow).not.toBeNull();
  expect(m.listRow!.maxWidth).not.toBe("none");
  expect(Math.abs(m.listRow!.left - m.bar.left)).toBeLessThanOrEqual(1);
  expect(m.listRow!.right - m.listRow!.left).toBeLessThan(m.bar.right - m.bar.left);
});

test(`SPEC-CORE-066 I10 / D11 at ${DESKTOP}px: the bar stays at the top while the shelf scrolls under it`, async ({
  page,
}) => {
  await open(page, ARRANGEMENT.sticky, DESKTOP);
  const before = await measure(page);
  expect(before.shelf).not.toBeNull();
  expect(before.shelf!.top).toBeGreaterThanOrEqual(before.bar.bottom - 0.5);

  await page.evaluate(() => window.scrollTo(0, 600));
  const after = await measure(page);

  expect(Math.abs(after.bar.top)).toBeLessThanOrEqual(1);
  expect(after.shelf!.top).toBeLessThan(after.bar.bottom);
});

test(`SPEC-CORE-103 I9 / D1 at ${DESKTOP}px: 上書き保存 is the chips row's last item, at its right edge, and the bar is one row`, async ({
  page,
}) => {
  await openChanged(page, DESKTOP);
  const o = await measureOverwrite(page);
  const m = await measure(page);

  expect(o.lastInRow).toBe(true);
  expect(o.button.left).toBeGreaterThanOrEqual(o.addFilter.right);
  expect(overlapVertically(o.button, o.addFilter)).toBe(true);
  expect(Math.abs(o.button.right - o.row.right)).toBeLessThanOrEqual(1);
  expect(o.button.bottom).toBeLessThanOrEqual(m.bar.top + 0.5);
  expect(m.scrollWidth).toBeLessThanOrEqual(DESKTOP);
  const controls = [...m.switches, ...m.counts, ...m.views, ...m.sorts, ...m.mores];
  for (const a of controls) for (const b of controls) expect(overlapVertically(a, b)).toBe(true);
});
