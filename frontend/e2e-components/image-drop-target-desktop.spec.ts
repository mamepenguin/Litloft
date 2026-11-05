/**
 * SPEC-CORE-046 I8: the text-query page's own drop target, in a real browser.
 * The overlay is portalled outside the page frame; `pointer-events-none` must
 * let the hit test fall through to the frame so the drop reaches it.
 */

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PAGE = pathToFileURL(resolve(__dirname, ".build", "index.html")).href;

declare global {
  interface Window {
    __dropData: DataTransfer;
  }
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
).toString("base64");

test("a one-image drag reaches the frame through the overlay", async ({ page }) => {
  await page.goto(`${PAGE}#image-drop-target`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  const frame = page.locator("[data-page-frame]");
  await expect(frame).toBeVisible();
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  const point = {
    x: Math.round(box!.x + box!.width / 2),
    y: Math.round(box!.y + 40),
  };

  await page.evaluate(
    ({ b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "image-drop.png", { type: "image/png" }));
      const frameEl = document.querySelector("[data-page-frame]")!;
      for (const kind of ["dragenter", "dragover"]) {
        frameEl.dispatchEvent(
          new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: dt }),
        );
      }
      window.__dropData = dt;
    },
    { b64: PNG },
  );

  await expect(page.getByText("Drop to search by this image")).toBeVisible();
  const hit = await page.evaluate(({ point }) => {
    const el = document.elementFromPoint(point.x, point.y);
    return el !== null && el.closest("[data-page-frame]") !== null;
  }, { point });
  expect(hit).toBe(true);

  await page.evaluate(() => {
    const frameEl = document.querySelector("[data-page-frame]")!;
    frameEl.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: window.__dropData,
      }),
    );
  });

  await expect(page.getByTestId("image-drop-hit")).toHaveText("image-drop.png");
});
