/**
 * SPEC-CORE-194 I7 at desktop widths: a wheel the player's own elements take
 * belongs to them, and only the rest is forwarded to the page.
 */

import { expect, test, type Page } from "@playwright/test";

import { serveFixture } from "./fixtureOrigin";
import {
  LAYER,
  SLOT,
  addFiller,
  frames,
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

test("SPEC-CORE-194 I7: a ctrl+wheel over the player is left to the browser", async ({
  page,
}) => {
  await openFilePage(page, { width: 1280, height: 520 });
  await addFiller(page);
  await settle(page);
  const scroller = await scrollerOfSlot(page);
  expect(scroller, "the canvas scrolls at this height").not.toBeNull();

  const before = await scrollerTop(page);
  const prevented = await page.evaluate((layer) => {
    const video = document.querySelector(`${layer} video`)!;
    const event = new WheelEvent("wheel", {
      deltaY: 120,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    video.dispatchEvent(event);
    return event.defaultPrevented;
  }, LAYER);
  expect(prevented, "the pinching wheel was not taken").toBe(false);
  await frames(page, 4);
  expect(await scrollerTop(page), "the page did not move").toBe(before);
});
