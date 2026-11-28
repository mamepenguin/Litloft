/**
 * SPEC-CORE-194 on a phone: the pinned player drawn by the layer, and the
 * queue overlay that takes the slot's box away.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { FIXTURE_URL, serveFixture } from "./fixtureOrigin";
import {
  LAYER,
  SLOT,
  addFiller,
  clearFrames,
  coveredBy,
  expectLayerOnSlot,
  expectServedByLayer,
  frames,
  inPseudoFullscreen,
  markPlayer,
  mismatchedFrames,
  play,
  playerState,
  recordFrames,
  rectOf,
  settle,
} from "./player-layer.measure";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

test.beforeEach(({ context }) => serveFixture(context));

/** The real `AppShell` around the file page; full screen refused, so the player takes pseudo full screen. */
async function openShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("refused"));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const params = new URLSearchParams({ run: String(++navigation), query: "file=video0000001" });
  await page.goto(`${FIXTURE_URL}?${params}#focus-drive`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(page.locator("video")).toHaveCount(1);
  await expectServedByLayer(page);
}

const fullscreenButton = (page: Page) =>
  page.locator(LAYER).getByRole("button", { name: "Full screen", exact: true });

async function open(page: Page, arrangement: string): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expectServedByLayer(page);
}

/** The scroller the canvas content moves in under the pinned player. */
const canvasScroller = (page: Page) =>
  page.evaluate((sel) => {
    const slot = document.querySelector(sel);
    for (let p = slot?.parentElement ?? null; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) {
        p.setAttribute("data-test-scroller", "");
        return p.scrollHeight - p.clientHeight;
      }
    }
    return null;
  }, SLOT);

test("SPEC-CORE-194 I2 / I4 (390x844): with the canvas scrolled under the pinned player, the player stays on the slot in every frame, and paints over the content under it", async ({
  page,
}) => {
  await recordFrames(page);
  await open(page, "queue-page-video");
  await expectLayerOnSlot(page, "at rest");
  await addFiller(page);
  await settle(page);
  const max = await canvasScroller(page);
  expect(max, "the canvas scrolls under the player").not.toBeNull();
  expect(max!).toBeGreaterThan(40);
  const pinned = (await rectOf(page, SLOT))!;

  await clearFrames(page);
  for (let step = 0; step < 10; step += 1) {
    await page.evaluate(
      (by) => document.querySelector<HTMLElement>("[data-test-scroller]")!.scrollBy(0, by),
      Math.ceil(max! / 10),
    );
    await frames(page, 1);
  }
  await settle(page);
  expect(await mismatchedFrames(page), "every frame of the scroll").toEqual([]);
  const after = (await rectOf(page, SLOT))!;
  expect(Math.abs(after.top - pinned.top), "the slot is pinned").toBeLessThanOrEqual(1);
  await expectLayerOnSlot(page, "scrolled under the pinned player");

  const over = await page.evaluate((layer) => {
    const r = document.querySelector(layer)!.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el?.closest(layer);
  }, LAYER);
  expect(over, "the player paints over the canvas content scrolled under it").toBe(true);
});

test("SPEC-CORE-194 I8 (390x844): while the queue overlay hides the slot, no pixel of the player paints and none of it takes focus, it keeps playing, and closing the overlay draws the same element over the slot", async ({
  page,
}) => {
  await open(page, "queue-page-overlay");
  await play(page);
  await markPlayer(page);

  await page.getByRole("button", { name: "Show the queue" }).click();
  await expect(page.locator('aside[aria-label="Queue"]')).toBeVisible();
  await expect.poll(() => page.locator(SLOT).evaluate((el) => el.getClientRects().length)).toBe(0);
  await frames(page, 2);

  const drawn = await page.evaluate((layer) => {
    const l = document.querySelector(layer);
    return [...(l?.querySelectorAll("video, iframe, [data-testid='player-frame']") ?? [])]
      .filter((el) => el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }))
      .map((el) => el.tagName);
  }, LAYER);
  expect(drawn, "no part of the player is drawn").toEqual([]);

  const focusable = await page.evaluate((layer) => {
    const l = document.querySelector(layer);
    if (!l) return [];
    const candidates = [
      ...l.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, video, iframe, [tabindex]"),
    ];
    return candidates
      .filter((el) => {
        el.focus();
        return document.activeElement === el;
      })
      .map((el) => el.outerHTML.slice(0, 80));
  }, LAYER);
  expect(focusable, "no element of the player takes focus").toEqual([]);

  const t0 = (await playerState(page)).time;
  await page.waitForTimeout(600);
  const hidden = await playerState(page);
  expect(hidden).toMatchObject({ count: 1, same: true, playing: true });
  expect(hidden.time).toBeGreaterThan(t0);

  await page.getByRole("button", { name: "Close the queue" }).click();
  await expect(page.locator('aside[aria-label="Queue"]')).toBeHidden();
  expect(await playerState(page)).toMatchObject({ count: 1, same: true, playing: true });
  await expectLayerOnSlot(page, "after the overlay closes");
});

test("SPEC-CORE-194 I4 (390x844): in pseudo full screen the player covers the viewport, the slot and the page under it keep their geometry, and the shortcut sheet still paints over it", async ({
  page,
}) => {
  await openShell(page);
  await settle(page);
  const slotBefore = (await rectOf(page, SLOT))!;
  const hostBefore = (await rectOf(page, ".media-detail-host"))!;
  await fullscreenButton(page).click();
  await expect.poll(() => inPseudoFullscreen(page)).toBe(true);
  await frames(page, 30);
  const covers = await page.evaluate((layer) => {
    const points = [
      [2, 2],
      [window.innerWidth - 2, 2],
      [window.innerWidth / 2, window.innerHeight / 2],
      [2, window.innerHeight - 2],
      [window.innerWidth - 2, window.innerHeight - 2],
    ];
    return points.filter(([x, y]) => !document.elementFromPoint(x, y)?.closest(layer));
  }, LAYER);
  expect(covers, "points of the viewport the player does not cover").toEqual([]);
  const slotDuring = (await rectOf(page, SLOT))!;
  const hostDuring = (await rectOf(page, ".media-detail-host"))!;
  for (const key of ["top", "height"] as const) {
    expect(Math.abs(slotDuring[key] - slotBefore[key]), `slot ${key}`).toBeLessThanOrEqual(1);
    expect(Math.abs(hostDuring[key] - hostBefore[key]), `page ${key}`).toBeLessThanOrEqual(1);
  }

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press("?");
  await expect(page.locator('[aria-modal="true"]').filter({ visible: true }).first()).toBeVisible();
  await frames(page, 2);
  expect(await coveredBy(page, '[aria-modal="true"]')).toEqual({ overlap: true, over: true, layer: false });
});

test("SPEC-CORE-194 I5 (390x844): pseudo full screen in and out keeps the same playing element, and the player is back on the slot", async ({
  page,
}) => {
  await openShell(page);
  await play(page);
  await markPlayer(page);
  await fullscreenButton(page).click();
  await expect.poll(() => inPseudoFullscreen(page)).toBe(true);
  expect(await playerState(page)).toMatchObject({ count: 1, same: true, playing: true });
  await page.locator(LAYER).getByRole("button", { name: "Exit full screen", exact: true }).click();
  await expect.poll(() => inPseudoFullscreen(page)).toBe(false);
  await settle(page);
  expect(await playerState(page)).toMatchObject({ count: 1, same: true, playing: true });
  await expectLayerOnSlot(page, "after pseudo full screen");
});

test("SPEC-CORE-194 I4 as revised (390x844): a dialog rendered inside the routed content, under the pseudo-full-screen frame today, stays under it", async ({
  page,
}) => {
  await openShell(page);
  await settle(page);
  await fullscreenButton(page).click();
  await expect.poll(() => inPseudoFullscreen(page)).toBe(true);
  await frames(page, 30);
  await page.evaluate(() => window.__fixtureOpenDialog!("rename"));
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  await frames(page, 10);
  expect(await coveredBy(page, '[aria-modal="true"]')).toEqual({ overlap: true, over: false, layer: true });
});
