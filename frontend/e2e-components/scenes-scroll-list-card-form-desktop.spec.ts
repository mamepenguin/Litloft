/**
 * SPEC-ADDON-152 in the bounded form: the card's form is the same while the
 * Visual Index placeholder is drawn and after the card replaces it.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const ARRANGEMENT = "#scenes-bounded-held";
const PLACEHOLDER = '[data-testid="scenes-visual-placeholder"]';
const CARD = /Two people/;

/** The placeholder's full and one-line heights, then the card's. */
const PENDING_FULL = 7.75 * 16 + 2.25 * 16;
const PENDING_ONE = 2.75 * 16 + 2.25 * 16;
const CARD_FULL_MIN = 7.6 * 16;

let navigation = 0;

async function openHeld(
  page: Page,
  hostHeight: number,
  stale: boolean,
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(
    `${FIXTURE}?run=${++navigation}&hostHeight=${hostHeight}&stale=${stale ? 1 : 0}${ARRANGEMENT}`,
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    ARRANGEMENT.slice(1),
  );
  await expect(
    page.getByRole("slider", { name: "Frame timeline" }),
  ).toBeVisible();
  await expect(page.locator(PLACEHOLDER)).toBeVisible();
  await expect(page.locator("button[data-scene-tile]").first()).toBeVisible();
}

/** A height once two readings a beat apart agree. */
async function stableHeight(page: Page, selector: string): Promise<number> {
  let last = NaN;
  await expect
    .poll(
      async () => {
        const height = await page
          .locator(selector)
          .first()
          .evaluate((el) => el.getBoundingClientRect().height);
        const same = Math.abs(height - last) < 0.5;
        last = height;
        return same;
      },
      { intervals: [80] },
    )
    .toBe(true);
  return last;
}

for (const stale of [false, true]) {
  test(`the card keeps the placeholder's form when the Visual Index answers${stale ? ", with the stale note" : ""}`, async ({
    page,
  }) => {
    const mismatches: string[] = [];
    for (let height = 372; height <= 460; height += 4) {
      await openHeld(page, height, stale);

      const pending = await stableHeight(page, PLACEHOLDER);
      const pendingOneLine = pending < (PENDING_FULL + PENDING_ONE) / 2;

      await page.evaluate(() => window.__releaseScenesVisual?.());
      await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
      await expect(page.getByRole("button", { name: CARD })).toBeVisible();

      const card = await stableHeight(page, `button[aria-label*="Two people"]`);
      const cardOneLine = card < (PENDING_ONE + CARD_FULL_MIN) / 2;

      if (cardOneLine !== pendingOneLine) {
        mismatches.push(
          `${height}px: placeholder ${pending.toFixed(1)}px ${
            pendingOneLine ? "one line" : "full"
          }, card ${card.toFixed(1)}px ${cardOneLine ? "one line" : "full"}`,
        );
      }
    }

    expect(mismatches, "a change of form when the card arrives").toEqual([]);
  });
}
