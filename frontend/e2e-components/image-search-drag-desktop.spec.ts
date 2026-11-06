/**
 * SPEC-CORE-046 step 1 / I7: a real browser drag of several files reaches
 * `drop`, where `dropEffect = "none"` would end the drag with `dragleave`
 * instead and the 「Choose one image」 message would never appear.
 */

import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PAGE = pathToFileURL(resolve(__dirname, ".build", "index.html")).href;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a drag of several files reaches drop and asks for one", async ({ page }) => {
  const first = resolve(__dirname, ".build", "drag-a.png");
  const second = resolve(__dirname, ".build", "drag-b.png");
  writeFileSync(first, PNG);
  writeFileSync(second, PNG);

  await page.goto(`${PAGE}#image-search`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  const input = page.getByPlaceholder(/Search in fixture/);
  await expect(input).toBeVisible();
  await expect(page.getByRole("button", { name: "Search by image" })).toHaveCount(1);

  const box = await input.boundingBox();
  expect(box).not.toBeNull();
  const point = {
    x: Math.round(box!.x + box!.width / 2),
    y: Math.round(box!.y + box!.height / 2),
  };
  const data = {
    items: [{ mimeType: "image/png", data: "", title: "", baseURL: "" }],
    files: [first, second],
    dragOperationsMask: 1,
  };

  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchDragEvent", { type: "dragEnter", ...point, data });
  await client.send("Input.dispatchDragEvent", { type: "dragOver", ...point, data });
  await client.send("Input.dispatchDragEvent", { type: "drop", ...point, data });

  await expect(page.getByText("Choose one image")).toBeVisible();
});
