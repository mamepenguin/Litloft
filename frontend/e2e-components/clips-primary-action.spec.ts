/**
 * SPEC-ADDON-138 I9 on a coarse pointer: the real Clips page at the phone
 * width. A shelf there is a sideways strip of 150px cards, and nothing in it,
 * the hidden "Unread" text of a dotted card included, may widen the page.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const WIDTH = 390;
const CARD = 150;
const LABEL = "Clip a web page";

let run = 0;

async function open(page: Page, search: string, width = WIDTH): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${FIXTURE}?run=${++run}&${search}#clips-page`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "clips-page");
}

function pageScroll(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

test("SPEC-ADDON-138 I9 at 390px on a coarse pointer the Unread shelf is a sideways strip of 150px cards and the dots do not widen the page", async ({
  page,
}) => {
  await open(page, "nick=1");
  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    "the phone project has a coarse pointer",
  ).toBe(true);
  const strip = page.locator("section", { has: page.getByRole("heading", { name: "Unread" }) }).locator("ul");
  await expect(strip.locator('[data-testid="unread-dot"]')).toHaveCount(12);

  const measured = await strip.evaluate((list) => {
    const style = getComputedStyle(list);
    return {
      display: style.display,
      overflowX: style.overflowX,
      scrollWidth: list.scrollWidth,
      clientWidth: list.clientWidth,
      cards: [...list.children].map((item) => item.getBoundingClientRect().width),
    };
  });
  expect(measured.display, "a strip, not a grid").toBe("flex");
  expect(measured.overflowX).toBe("auto");
  expect(measured.scrollWidth, "the strip scrolls sideways").toBeGreaterThan(measured.clientWidth);
  expect(measured.cards).toHaveLength(12);
  for (const width of measured.cards) expect(Math.abs(width - CARD)).toBeLessThanOrEqual(0.5);

  const scroll = await pageScroll(page);
  expect(scroll.scrollWidth, "the page does not scroll sideways").toBeLessThanOrEqual(scroll.innerWidth);
});

// 390 is two columns, 760 three and 1440 more: the strip's four skeletons are
// what the grid's capacity must not change.
for (const width of [WIDTH, 760, 1440]) {
  test(`SPEC-ADDON-138 I9 at ${width}px on a coarse pointer a loading shelf draws four skeleton cards of 150px, and none widens the page`, async ({
    page,
  }) => {
    await open(page, "nick=1&hold=shelves", width);
    const skeletons = page.locator("section").first().locator('li[data-testid="clip-skeleton"]');
    await expect(skeletons.first()).toBeVisible();

    const widths = await skeletons.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().width).filter((w) => w > 0),
    );
    expect(widths.length, "the strip draws four skeleton cards").toBe(4);
    for (const w of widths) expect(Math.abs(w - CARD)).toBeLessThanOrEqual(0.5);

    const scroll = await pageScroll(page);
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);

    await page.evaluate(() => window.__releaseClipShelves?.());
    await expect(page.locator('[data-testid="unread-dot"]').first()).toBeVisible();
  });
}

test("SPEC-ADDON-138 I9 at 390px on a coarse pointer the Library's tag shelves are strips and the page does not scroll sideways", async ({
  page,
}) => {
  await open(page, "q=view%3Dall%26group%3Dtags");
  await expect(page.getByRole("heading", { name: "research" })).toBeVisible();

  const lists = await page.locator("#clips-page-host section ul").evaluateAll((uls) =>
    uls.map((list) => ({
      display: getComputedStyle(list).display,
      scrolls: list.scrollWidth > list.clientWidth,
    })),
  );
  expect(lists.length).toBeGreaterThanOrEqual(2);
  for (const list of lists) {
    expect(list.display).toBe("flex");
    expect(list.scrolls).toBe(true);
  }

  const scroll = await pageScroll(page);
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);
});

test("SPEC-ADDON-138 I9 at 390px on a coarse pointer the primary action is a full-width row under the tabs", async ({
  page,
}) => {
  await open(page, "nick=1");
  const button = page.getByRole("button", { name: LABEL, exact: true });
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  const tabsBox = await page
    .getByRole("link", { name: "Library", exact: true })
    .first()
    .boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(tabsBox!.y + tabsBox!.height - 1);
  expect(box.width, "full width").toBeGreaterThanOrEqual(WIDTH - 40);
});
