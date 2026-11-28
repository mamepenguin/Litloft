/**
 * SPEC-CORE-194 I7 on a phone: in pseudo full screen the page behind the
 * player does not move when the wheel is used over it.
 */

import { expect, test, type Page } from "@playwright/test";

import { serveFixture } from "./fixtureOrigin";
import {
  LAYER,
  SLOT,
  addFiller,
  frames,
  inPseudoFullscreen,
  openFilePage,
  settle,
} from "./player-layer.measure";

test.beforeEach(({ context }) => serveFixture(context));

/** The slot's nearest ancestor that scrolls and has something to scroll. */
const scrollerOfSlot = (page: Page) =>
  page.evaluate((sel) => {
    const slot = document.querySelector(sel);
    for (let p = slot?.parentElement ?? null; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) {
        p.setAttribute("data-test-scroller", "");
        return { top: p.scrollTop, max: p.scrollHeight - p.clientHeight };
      }
    }
    return null;
  }, SLOT);

const scrollerTop = (page: Page) =>
  page.evaluate(
    () => document.querySelector<HTMLElement>("[data-test-scroller]")!.scrollTop,
  );

test("SPEC-CORE-194 I7 (390x200): a wheel over the open settings panel scrolls the panel, not the page", async ({
  page,
}) => {
  // Short enough that the player's settings panel overflows its own frame.
  await openFilePage(page, { width: 390, height: 200 });
  await addFiller(page);
  await settle(page);
  const scroller = await scrollerOfSlot(page);
  expect(scroller, "the canvas scrolls at this height").not.toBeNull();
  expect(scroller!.max).toBeGreaterThan(120);

  await page
    .locator(LAYER)
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const panel = page.getByTestId("settings-sheet");
  await expect(panel).toBeVisible();
  // The panel slides in; its live box is the one a wheel can land on.
  await frames(page, 30);
  const metrics = await panel.evaluate((el) => ({
    overflow: getComputedStyle(el).overflowY,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    left: el.getBoundingClientRect().left,
    top: el.getBoundingClientRect().top,
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
  }));
  expect(metrics.overflow, "the panel scrolls itself").toBe("auto");
  expect(
    metrics.scrollHeight,
    "the panel overflows at this frame height",
  ).toBeGreaterThan(metrics.clientHeight + 1);

  await page.mouse.move(
    metrics.left + metrics.width / 2,
    metrics.top + metrics.height / 2,
  );
  const pageBefore = await scrollerTop(page);
  const panelBefore = await panel.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 10);
  await expect
    .poll(() => panel.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(panelBefore);
  await frames(page, 4);
  expect(await scrollerTop(page), "the page did not move").toBe(pageBefore);

  // At its end the panel has nothing left to take, so the page gets the wheel.
  await panel.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const panelEnd = await panel.evaluate((el) => el.scrollTop);
  const pageBeforeEnd = await scrollerTop(page);
  await page.mouse.wheel(0, 40);
  await expect.poll(() => scrollerTop(page)).toBeGreaterThan(pageBeforeEnd);
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(panelEnd);
});

test("SPEC-CORE-194 I7 (390x844): a wheel over the player in pseudo full screen leaves the page where it is", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("refused"));
  });
  await openFilePage(page, { width: 390, height: 844 });
  await addFiller(page);
  await settle(page);
  const scroller = await scrollerOfSlot(page);
  expect(scroller, "the canvas scrolls under the pinned player").not.toBeNull();
  expect(scroller!.max).toBeGreaterThan(40);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-test-scroller]")!.scrollTop = 60;
  });
  await frames(page, 2);

  await page.locator(LAYER).getByRole("button", { name: "Full screen", exact: true }).click();
  await expect.poll(() => inPseudoFullscreen(page)).toBe(true);
  await frames(page, 30);

  const before = await scrollerTop(page);
  await page.mouse.move(195, 422);
  await page.mouse.wheel(0, 120);
  await frames(page, 4);

  expect(await scrollerTop(page), "the page behind the player did not move").toBe(
    before,
  );
});
