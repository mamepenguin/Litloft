import { test, expect } from "@playwright/test";

import { expectIconRows, measureRows, openVideoWithBothKinds, targetButton } from "./target-menu-rows.measure";

export function targetMenuRowCases(width: number): void {
  test(`SPEC-CORE-118 I1 Video at ${width}px: each Target menu row carries its kind's icon on the name's first line, after the check column`, async ({
    page,
  }) => {
    await openVideoWithBothKinds(page, width);
    await targetButton(page).click();
    await expect(page.getByRole("menuitemradio", { name: "Bedside" })).toBeVisible();

    const m = await measureRows(page, "menu");
    const defaultRow = m.rows[0];
    expect(defaultRow.name).toBe("All videos");
    expect(defaultRow.kind).toBe("none");
    expectIconRows(m, () => defaultRow.firstLine.left);
  });

  test(`SPEC-CORE-118 I1 Video at ${width}px: each Manage… row carries its kind's icon between the checkbox and the name`, async ({
    page,
  }) => {
    await openVideoWithBothKinds(page, width);
    await targetButton(page).click();
    await page.getByRole("menuitem", { name: /Manage/ }).click();
    await expect(page.getByRole("checkbox", { name: "Bedside" })).toBeVisible();

    const m = await measureRows(page, "manage");
    expectIconRows(m, (row) => row.checkboxCentre!);
  });
}
