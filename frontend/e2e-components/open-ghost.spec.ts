/**
 * The copy of the pressed picture: whether it is there, where, that it takes
 * no presses, and that it takes itself away. jsdom has no animation, so this
 * is the only place any of it happens.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let run = 0;

async function open(page: Page): Promise<void> {
  await page.goto(`${FIXTURE}?run=${++run}#open-ghost`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "open-ghost",
  );
}

const ghost = (page: Page) => page.locator("[data-open-ghost]");

test("copies the pressed picture onto the card it came from", async ({ page }) => {
  await open(page);

  const card = await page.locator("[data-file-thumb]").boundingBox();

  const seen = await page.evaluate(async () => {
    document.getElementById("open-card")!.click();
    const el = document.querySelector<HTMLElement>("[data-open-ghost]")!;
    const box = el.getBoundingClientRect();
    return {
      left: Math.round(box.left),
      top: Math.round(box.top),
      width: Math.round(box.width),
      height: Math.round(box.height),
      pointerEvents: getComputedStyle(el).pointerEvents,
      position: getComputedStyle(el).position,
      hidden: el.getAttribute("aria-hidden"),
    };
  });

  expect(seen.position).toBe("fixed");
  expect(seen.pointerEvents).toBe("none");
  expect(seen.hidden).toBe("true");
  expect(seen.left).toBe(Math.round(card!.x));
  expect(seen.top).toBe(Math.round(card!.y));
  expect(seen.width).toBe(Math.round(card!.width));
  expect(seen.height).toBe(Math.round(card!.height));
});

test("swells and fades, and is gone by the time it has", async ({ page }) => {
  await open(page);

  const flight = await page.evaluate(async () => {
    document.getElementById("open-card")!.click();
    const el = document.querySelector<HTMLElement>("[data-open-ghost]")!;
    const first = el.getBoundingClientRect().width;
    const anim = el.getAnimations()[0];
    anim.currentTime = 160;
    const last = el.getBoundingClientRect().width;
    return { first, last, opacity: getComputedStyle(el).opacity };
  });

  // A fifth wider at the end, and gone from sight before it is removed.
  expect(flight.last / flight.first).toBeCloseTo(1.2, 2);
  expect(Number(flight.opacity)).toBe(0);

  await expect(ghost(page)).toHaveCount(0, { timeout: 4000 });
});

test("leaves one copy behind, not a pile, when cards are pressed in a row", async ({
  page,
}) => {
  await open(page);

  await page.evaluate(() => {
    const card = document.getElementById("open-card")!;
    card.click();
    card.click();
    card.click();
  });

  await expect(ghost(page)).toHaveCount(1);
  await expect(ghost(page)).toHaveCount(0, { timeout: 4000 });
});
