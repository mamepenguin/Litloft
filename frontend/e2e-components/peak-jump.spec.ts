/**
 * SPEC-CORE-151 D2, I7: the jump button in the touch layout's bottom bar,
 * before the full-screen button, in the whole chrome and in bottom-only.
 */

import { test, expect, type Page } from "@playwright/test";

import { JUMP, box, labelBox, openPeakJump } from "./peak-jump.serve";

const FULL_SCREEN = 'button[aria-label="Full screen"]';

/** Product of the opacities from the element up to the document; null if absent. */
function paintedOpacity(page: Page, selector: string): Promise<number | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    let opacity = 1;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") return 0;
      opacity *= Number(style.opacity);
    }
    return opacity;
  }, selector);
}

/** The bottom bar's buttons, left to right, by accessible name. */
function bottomRow(page: Page): Promise<Array<{ name: string; x: number; right: number }>> {
  return page.evaluate(() => {
    const bottom = document.querySelector('[data-testid="bottom-controls"]');
    if (!bottom) throw new Error("no bottom bar");
    return Array.from(bottom.querySelectorAll("button"))
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { name: b.getAttribute("aria-label") ?? "", x: r.left, right: r.right };
      })
      .sort((a, b) => a.x - b.x);
  });
}

test("SPEC-CORE-151 D2 the button sits immediately before full screen, and works in bottom-only", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openPeakJump(page, 393);

  // Paused, so the whole chrome is up.
  await expect.poll(() => paintedOpacity(page, FULL_SCREEN)).toBe(1);
  await expect.poll(() => paintedOpacity(page, JUMP)).toBe(1);
  const buttons = await bottomRow(page);
  const full = buttons.findIndex((b) => b.name === "Full screen");
  expect(full, "the jump button comes before full screen").toBeGreaterThan(0);
  expect(buttons[full - 1].name).toBe("Jump to most watched");
  expect(buttons[full - 1].right).toBeLessThanOrEqual(buttons[full].x + 0.5);
  await expect(page.locator(JUMP)).not.toHaveAttribute("title", /.*/);

  const jump = (await box(page, JUMP))!;
  await page.touchscreen.tap(jump.x + jump.width / 2, jump.y + jump.height / 2);
  await expect.poll(async () => (await labelBox(page))?.text).toBe("Most watched 1 / 2");

  // Bottom-only now: the jump and full-screen buttons are drawn and take the tap.
  await expect.poll(() => paintedOpacity(page, JUMP)).toBe(1);
  await expect.poll(() => paintedOpacity(page, FULL_SCREEN)).toBe(1);
  const again = (await box(page, JUMP))!;
  await page.touchscreen.tap(again.x + again.width / 2, again.y + again.height / 2);
  await expect.poll(async () => (await labelBox(page))?.text).toBe("Most watched 2 / 2");
});
