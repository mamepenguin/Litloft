/**
 * SPEC-CORE-165 / SPEC-CORE-166 D4: on a touch screen the folder rows and the control row
 * below them do not overlap, so a tap anywhere on a crumb or a chip reaches it.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const CASES = [
  { name: "top, chips only", query: "" },
  { name: "a position with chips", query: "&pos=Videos" },
  { name: "a leaf, crumbs only", query: "&pos=Videos%2FStudy&leaf=1" },
];

for (const app of ["video", "reading"]) {
  for (const c of CASES) {
    test(`SPEC-CORE-165 SPEC-CORE-166 D4 ${app} ${c.name}: the control row starts below the folder rows`, async ({ page }) => {
      await page.goto(`${FIXTURE}?app=${app}${c.query}#folder-rows`);
      await page.locator("body[data-harness=ready]").waitFor();
      const tag = page.getByRole("button", { name: /^Tag/ });
      await tag.waitFor();
      const lastRow = c.query.includes("leaf") ? page.locator("[data-crumbs]") : page.locator("[data-chips]");
      await lastRow.waitFor();

      const rowBox = (await lastRow.boundingBox())!;
      const tagBox = (await tag.boundingBox())!;
      expect(tagBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height);

      const item = lastRow.locator("a").first();
      const box = (await item.boundingBox())!;
      const hit = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href") ?? null,
        [box.x + box.width / 2, box.y + box.height - 2],
      );
      expect(hit).toBe(await item.getAttribute("href"));
    });
  }
}
