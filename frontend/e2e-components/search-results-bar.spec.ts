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

const PHONE = 390;

nothingAboveTheField(PHONE);
oneOfEach(PHONE);
positionsHoldWithoutTheCheckbox(PHONE);

for (const id of [
  ARRANGEMENT.files,
  ARRANGEMENT.filesScene,
  ARRANGEMENT.passages,
  ARRANGEMENT.passagesScene,
]) {
  test(`SPEC-CORE-066 I10 / SPEC-CORE-039 I15 ${id} at ${PHONE}px: full-width field, one-row bar, 44px controls, no sideways scroll`, async ({
    page,
  }) => {
    await open(page, id, PHONE);
    const m = await measure(page);

    expect(m.innerWidth).toBe(PHONE);
    expect(m.scrollWidth).toBeLessThanOrEqual(PHONE);

    expect(m.barHoldsField).toBe(false);
    expect(m.bar.right - m.bar.left).toBeGreaterThan(0);
    expect(Math.abs(m.field.left - m.bar.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.field.right - m.bar.right)).toBeLessThanOrEqual(1);

    const controls = [...m.switches, ...m.checkboxes, ...m.counts, ...m.mores];
    expect(m.switches).toHaveLength(1);
    expect(m.checkboxes).toHaveLength(1);
    expect(m.counts).toHaveLength(1);
    expect(m.mores).toHaveLength(1);
    for (const a of controls) for (const b of controls) expect(overlapVertically(a, b)).toBe(true);
    expect(m.counts[0].lines).toBe(1);
    for (const c of controls) {
      expect(c.left).toBeGreaterThanOrEqual(0);
      expect(c.right).toBeLessThanOrEqual(PHONE);
    }

    expect(m.coarse).toBe(true);
    for (const c of [...m.switches, ...m.checkboxes, ...m.mores]) {
      expect(c.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test(`the condition button names what it adds at ${PHONE}px`, async ({ page }) => {
  await open(page, ARRANGEMENT.files, PHONE);
  const button = page.getByRole("button", { name: "Add filter", exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveText(/Filter/);
  const label = button.getByText("Filter", { exact: true });
  const box = await label.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
});

// 375 px is the narrowest supported width. With less slack than 390 px it
// also stands in for fonts wider than the test machine's.
for (const id of [ARRANGEMENT.files, ARRANGEMENT.passagesScene]) {
  test(`${id} at 375px: the results bar stays one row`, async ({ page }) => {
    await open(page, id, 375);
    const m = await measure(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    const controls = [...m.switches, ...m.checkboxes, ...m.counts, ...m.mores];
    for (const a of controls) for (const b of controls) expect(overlapVertically(a, b)).toBe(true);
    expect(m.counts[0].lines).toBe(1);
  });
}

test("SPEC-CORE-103 I9 / D4 at 375px: 上書き保存 wraps below the chips, nothing scrolls sideways, the bar stays one row", async ({
  page,
}) => {
  await openChanged(page, 375);
  const o = await measureOverwrite(page);
  const m = await measure(page);

  expect(m.scrollWidth).toBeLessThanOrEqual(375);
  expect(o.lastInRow).toBe(true);
  expect(o.button.left).toBeGreaterThanOrEqual(o.row.left - 1);
  expect(o.button.right).toBeLessThanOrEqual(o.row.right + 1);
  expect(o.button.right).toBeLessThanOrEqual(375);
  for (const other of o.others) {
    const sideBySide = overlapVertically(o.button, other);
    const overlapsHorizontally = o.button.left < other.right && other.left < o.button.right;
    expect(sideBySide && overlapsHorizontally).toBe(false);
    if (sideBySide) expect(o.button.left).toBeGreaterThanOrEqual(other.right);
    expect(other.top).toBeLessThan(o.button.bottom);
  }
  expect(o.button.bottom).toBeLessThanOrEqual(m.bar.top + 0.5);
  expect(m.coarse).toBe(true);
  expect(o.button.height).toBeGreaterThanOrEqual(44);

  const controls = [...m.switches, ...m.counts, ...m.mores];
  expect(m.counts).toHaveLength(1);
  for (const a of controls) for (const b of controls) expect(overlapVertically(a, b)).toBe(true);
  expect(m.counts[0].lines).toBe(1);
});
