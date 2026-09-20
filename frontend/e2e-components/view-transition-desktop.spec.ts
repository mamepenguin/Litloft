/**
 * The push is a phone idiom: a wide column crossing a large screen reads as
 * slow. Above the breakpoint the listing keeps the browser's own
 * cross-fade, which is a thing only a browser can report.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

test("does not push the listing above the tablet breakpoint", async ({ page }) => {
  await page.goto(`${FIXTURE}#folder-push`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "folder-push",
  );

  const during = await page.evaluate(async () => {
    document.getElementById("go-down")!.click();
    for (let frame = 0; frame < 120; frame++) {
      const running = document
        .getAnimations()
        .some((a) =>
          String((a.effect as KeyframeEffect)?.pseudoElement ?? "").startsWith(
            "::view-transition",
          ),
        );
      if (running) break;
      await new Promise(requestAnimationFrame);
    }
    const read = (p: string) => getComputedStyle(document.documentElement, p);
    return {
      width: window.innerWidth,
      kind: document.documentElement.dataset.vt ?? null,
      oldName: read("::view-transition-old(listing)").animationName,
      newName: read("::view-transition-new(listing)").animationName,
    };
  });

  expect(during.width).toBeGreaterThanOrEqual(768);
  expect(during.kind).toBe("folder-down");
  expect(during.oldName).not.toContain("vt-push");
  expect(during.newName).not.toContain("vt-push");
});
