/**
 * SPEC-CORE-076 I1 I2 I3: the real Discover face measured with the real stylesheet while later
 * shelves settle. jsdom lays nothing out, so a header's position is only real here.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const ID = "discover-prefix";

let run = 0;

interface Block {
  title: string;
  skeleton: boolean;
  top: number;
  bottom: number;
}

async function open(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${FIXTURE}?run=${++run}#${ID}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect
    .poll(async () => errors.length > 0 || (await page.locator("body[data-harness=ready]").count()) > 0)
    .toBe(true);
  expect(errors).toEqual([]);
}

/** Shelf sections in document order; an untitled one with a pulsing placeholder is the skeleton. */
async function step(page: Page, n: number): Promise<Block[]> {
  return page.evaluate((index) => {
    window.__discoverPrefix.step(index);
    const host = document.getElementById("discover-prefix-host")!;
    return [...host.querySelectorAll("section")]
      .filter((s) => s.querySelector("section") === null)
      .map((s) => {
        const heading = s.querySelector("h1, h2, h3, h4, h5, h6");
        const title = heading?.textContent?.trim() ?? "";
        const r = s.getBoundingClientRect();
        const anchor = heading ? heading.getBoundingClientRect() : r;
        return {
          title,
          skeleton: !title && s.querySelector(".animate-pulse") !== null,
          top: anchor.top + window.scrollY,
          bottom: r.bottom + window.scrollY,
        };
      })
      .filter((b) => b.title || b.skeleton);
  }, n);
}

export function discoverPrefixCases(): void {
  test("SPEC-CORE-076 I1 I2 I3 no drawn shelf header moves while the shelves below it settle", async ({ page }) => {
    await open(page);
    const steps = [await step(page, 0), await step(page, 1), await step(page, 2)];

    expect(steps.map((blocks) => blocks.map((b) => (b.skeleton ? "SKELETON" : b.title)))).toEqual([
      ["Continue", "SKELETON"],
      ["Continue", "Recommended", "SKELETON"],
      ["Continue", "Recommended", "New"],
    ]);

    const tops = new Map<string, number>();
    steps.forEach((blocks, i) => {
      for (const b of blocks.filter((x) => !x.skeleton)) {
        const first = tops.get(b.title);
        if (first === undefined) tops.set(b.title, b.top);
        else expect(Math.abs(b.top - first), `${b.title} at step ${i}: ${b.top} vs ${first}`).toBeLessThanOrEqual(0.5);
      }
      const drawn = blocks.filter((x) => !x.skeleton);
      const skeleton = blocks.find((x) => x.skeleton);
      if (skeleton) {
        expect(skeleton.top, `skeleton at step ${i} sits below the drawn shelves`).toBeGreaterThanOrEqual(
          drawn[drawn.length - 1].bottom - 0.5,
        );
      }
    });
  });
}
