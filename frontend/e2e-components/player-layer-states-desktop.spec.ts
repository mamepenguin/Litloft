/**
 * SPEC-CORE-194 through the file page's layout states at desktop widths: the
 * workbench, its split and beside states, Enlarge panels and the inspector's
 * forms; the surfaces over the player; and the page and queue acting on it.
 */

import { test, expect, type Page } from "@playwright/test";

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
  markPlayer,
  mismatchedFrames,
  openFilePage,
  openWorkbench,
  play,
  playerState,
  recordFrames,
  rectOf,
  settle,
} from "./player-layer.measure";

test.beforeEach(({ context }) => serveFixture(context));

const LONG = "qlong0000001";

const fit = (page: Page) => page.getByTestId("inspector-fit-host");
const panelGroup = (page: Page) => page.getByRole("group", { name: "Panels" });
const enlarge = (page: Page) => page.getByRole("button", { name: "Enlarge panels" });
const splitButton = (page: Page) => page.getByRole("button", { name: "Show panels beside the player" });
const host = (page: Page) => page.locator(".media-detail-host");
const workbench = (page: Page) => page.locator(".media-detail-workbench");
const inspectorToggle = (page: Page) => page.getByTestId("inspector-toggle").filter({ visible: true });

/** Runs `change`, then checks the player is on the slot, is the same element and still plays. */
async function expectKept(page: Page, label: string, change: (page: Page) => Promise<void>): Promise<void> {
  const before = await playerState(page);
  await change(page);
  await expectLayerOnSlot(page, label);
  const after = await playerState(page);
  expect({ count: after.count, same: after.same, playing: after.playing }, label).toEqual({
    count: 1,
    same: true,
    playing: true,
  });
  expect(after.time, `${label}: currentTime kept`).toBeGreaterThanOrEqual(before.time - 0.05);
}

/** Runs `change` with the frame recorder cleared, then checks every frame since and that the slot moved. */
async function expectEveryFrame(page: Page, label: string, change: (page: Page) => Promise<void>): Promise<void> {
  await settle(page);
  const before = await rectOf(page, SLOT);
  await clearFrames(page);
  await change(page);
  await settle(page);
  expect(await rectOf(page, SLOT), `${label}: the slot's box changed`).not.toEqual(before);
  expect(await mismatchedFrames(page), label).toEqual([]);
}

test.describe("SPEC-CORE-194 I2 / I3 / I5: the workbench", () => {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    const name = `${size.width}x${size.height}`;

    test(`SPEC-CORE-194 I2 / I5 (${name}): with a workbench panel shown, Enlarge panels on and off, and the panel closed, the player is on the slot and keeps the same playing element`, async ({
      page,
    }) => {
      await openWorkbench(page, size);
      await expect(fit(page)).toHaveAttribute("data-inspector-fit", "beside");
      await expectLayerOnSlot(page, "a panel shown");
      await play(page);
      await markPlayer(page);
      await expectKept(page, "Enlarge panels on", async (p) => {
        await enlarge(p).click();
        await expect(enlarge(p)).toHaveAttribute("aria-pressed", "true");
      });
      await expectKept(page, "Enlarge panels off", async (p) => {
        await enlarge(p).click();
        await expect(enlarge(p)).toHaveAttribute("aria-pressed", "false");
      });
      await expectKept(page, "the panel closed", async (p) => {
        await panelGroup(p).getByRole("button", { name: "Transcript" }).click();
      });
      await expectKept(page, "the panel shown again", async (p) => {
        await panelGroup(p).getByRole("button", { name: "Transcript" }).click();
      });
    });

    test(`SPEC-CORE-194 I3 (${name}): in every painted frame after toggling a panel and Enlarge panels the player's box equals the slot's`, async ({
      page,
    }) => {
      await recordFrames(page);
      await openWorkbench(page, size);
      await expectEveryFrame(page, "panel closed", (p) =>
        panelGroup(p).getByRole("button", { name: "Transcript" }).click(),
      );
      await expectEveryFrame(page, "panel shown", (p) =>
        panelGroup(p).getByRole("button", { name: "Transcript" }).click(),
      );
      await expectEveryFrame(page, "Enlarge panels on", (p) => enlarge(p).click());
      await expectEveryFrame(page, "Enlarge panels off", (p) => enlarge(p).click());
    });
  }

  test("SPEC-CORE-194 I2 / I3 / I5 (1440x900): entering and leaving the split layout keeps the player on the slot in every frame, with the same playing element", async ({
    page,
  }) => {
    await recordFrames(page);
    await openWorkbench(page, { width: 1440, height: 900 });
    await play(page);
    await markPlayer(page);
    await expectEveryFrame(page, "split on", async (p) => {
      await splitButton(p).click();
      await expect(host(p)).toHaveAttribute("data-workbench-split", "on");
    });
    await expectKept(page, "split on", async () => {});
    await expectEveryFrame(page, "split off", async (p) => {
      await splitButton(p).click();
      await expect(host(p)).not.toHaveAttribute("data-workbench-split", /.*/);
    });
    await expectKept(page, "split off", async () => {});
  });

  test("SPEC-CORE-194 I2 / I3 / I5 (1440x900): in the beside state, entered and left with Enlarge panels, the player is on the slot in every frame, with the same playing element", async ({
    page,
  }) => {
    await recordFrames(page);
    await openWorkbench(page, { width: 1440, height: 900 });
    await play(page);
    await markPlayer(page);
    await expectEveryFrame(page, "beside on", async (p) => {
      await enlarge(p).click();
      await expect(workbench(p)).toHaveAttribute("data-row-beside", "on");
    });
    await expectKept(page, "beside", async () => {});
    await expectEveryFrame(page, "beside off", async (p) => {
      await enlarge(p).click();
      await expect(workbench(p)).not.toHaveAttribute("data-row-beside", /.*/);
    });
    await expectKept(page, "beside left", async () => {});
  });
});

test.describe("SPEC-CORE-194 I2 / I5: the inspector's forms", () => {
  for (const [form, size] of [
    ["beside", { width: 1280, height: 800 }],
    ["stacked", { width: 900, height: 700 }],
  ] as const) {
    test(`SPEC-CORE-194 I2 / I5 (${size.width}x${size.height}): with the inspector ${form}, and closed and opened again, the player is on the slot and keeps the same playing element`, async ({
      page,
    }) => {
      await openFilePage(page, { ...size, storage: { "workbench-panels": "[]", "inspector-open:fixture": "true" } });
      await expect(fit(page)).toHaveAttribute("data-inspector-fit", form);
      await expectLayerOnSlot(page, `inspector ${form}`);
      await play(page);
      await markPlayer(page);
      await expectKept(page, "inspector closed", (p) => inspectorToggle(p).click());
      await expectKept(page, `inspector ${form} again`, async (p) => {
        await inspectorToggle(p).click();
        await expect(fit(p)).toHaveAttribute("data-inspector-fit", form);
      });
    });
  }

  test("SPEC-CORE-194 I3 (900x700): in every painted frame after toggling the stacked inspector the player's box equals the slot's", async ({
    page,
  }) => {
    await recordFrames(page);
    await openFilePage(page, { width: 900, height: 700, storage: { "workbench-panels": "[]", "inspector-open:fixture": "true" } });
    await expect(fit(page)).toHaveAttribute("data-inspector-fit", "stacked");
    await expectEveryFrame(page, "stacked inspector closed", (p) => inspectorToggle(p).click());
    await expectEveryFrame(page, "stacked inspector opened", (p) => inspectorToggle(p).click());
  });
});

test.describe("SPEC-CORE-194 I4: surfaces over the player", () => {
  test("SPEC-CORE-194 I4 (760x600): the page row's file menu paints over the player", async ({ page }) => {
    await openFilePage(page, { width: 760, height: 600 });
    await settle(page);
    await page.getByRole("button", { name: "File actions" }).click();
    await expect(page.getByRole("menu").first()).toBeVisible();
    await frames(page, 2);
    expect(await coveredBy(page, '[role="menu"]')).toEqual({ overlap: true, over: true, layer: false });
  });

  test("SPEC-CORE-194 I4 (760x600): the overlay sidebar paints over the player", async ({ page }) => {
    await openFilePage(page, { width: 760, height: 600 });
    await settle(page);
    await page.getByTestId("chrome-buttons").getByRole("button", { name: "Menu" }).click();
    await expect(page.locator("aside[class*='z-40']")).toBeVisible();
    await frames(page, 10);
    expect(await coveredBy(page, "aside[class*='z-40']")).toEqual({ overlap: true, over: true, layer: false });
  });

  test("SPEC-CORE-194 I4 (760x460): a toast paints over the player", async ({ page }) => {
    await openFilePage(page, { width: 760, height: 460 });
    await settle(page);
    await page.getByRole("button", { name: "File actions" }).click();
    await page.getByRole("menuitem", { name: "Copy ID" }).click();
    const toast = page.getByText("ID copied").first();
    await expect(toast).toBeVisible();
    await frames(page, 20);
    const result = await page.evaluate((layer) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.nodeValue !== "ID copied") continue;
        const el = node.parentElement!;
        const r = el.getBoundingClientRect();
        const l = document.querySelector(layer)!.getBoundingClientRect();
        const overlap = r.left < l.right && r.right > l.left && r.top < l.bottom && r.bottom > l.top;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { overlap, over: !!hit && el.contains(hit), layer: !!hit?.closest(layer) };
      }
      return null;
    }, LAYER);
    expect(result).toEqual({ overlap: true, over: true, layer: false });
  });
});

test.describe("SPEC-CORE-194 I11: focus mode's reading anchor on the player", () => {
  test("SPEC-CORE-194 I11: with the top of the scrolled content area on the player, entering and leaving focus mode keep that point at the same fraction of the slot's height within 1px", async ({
    page,
  }) => {
    await openFilePage(page, { width: 1280, height: 520 });
    await addFiller(page);
    await settle(page);
    const scroller = await page.evaluate((sel) => {
      const slot = document.querySelector(sel);
      for (let p = slot?.parentElement ?? null; p; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) {
          p.setAttribute("data-test-scroller", "");
          return true;
        }
      }
      return false;
    }, SLOT);
    expect(scroller, "the canvas scrolls at this height").toBe(true);
    const slot0 = (await rectOf(page, SLOT))!;
    const area0 = await page.evaluate(() =>
      Math.max(document.querySelector("[data-test-scroller]")!.getBoundingClientRect().top, 0),
    );
    await page.evaluate(
      (by) => document.querySelector<HTMLElement>("[data-test-scroller]")!.scrollBy(0, by),
      slot0.top - area0 + slot0.height / 3,
    );
    await settle(page);

    const topOfArea = () =>
      page.evaluate(
        ({ slot, layer }) => {
          const top = Math.max(document.querySelector("[data-test-scroller]")!.getBoundingClientRect().top, 0);
          const s = document.querySelector(slot)!.getBoundingClientRect();
          const hit = document.elementFromPoint(s.left + s.width / 3, top + 2);
          return { into: top - s.top, height: s.height, onPlayer: !!hit?.closest(layer) };
        },
        { slot: SLOT, layer: LAYER },
      );
    const before = await topOfArea();
    expect(before.onPlayer, "the top of the content area is on the player").toBe(true);
    expect(before.into).toBeGreaterThan(20);
    const fraction = before.into / before.height;
    const drift = async () => {
      const now = await topOfArea();
      return Math.abs(now.into - fraction * now.height);
    };

    const pressT = async () => {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      await page.keyboard.press("t");
    };
    await pressT();
    await settle(page);
    await expect.poll(drift, { message: "entering" }).toBeLessThanOrEqual(1);
    await pressT();
    await settle(page);
    await expect.poll(drift, { message: "leaving" }).toBeLessThanOrEqual(1);
  });
});

test.describe("SPEC-CORE-194 I6: the page and the queue act on the layer's player", () => {
  test("SPEC-CORE-194 I6: a chapter press changes the layer's <video> currentTime", async ({ page }) => {
    await openFilePage(page, { width: 1280, height: 800, storage: { "workbench-panels": "[]", "inspector-open:fixture": "true" } });
    await page.locator('[aria-controls="inspector-panel-chapters"]').click();
    const chapter = page.getByRole("button", { name: /Opening/ }).filter({ visible: true }).first();
    await expect(chapter).toBeVisible();
    expect(await chapter.evaluate((el, layer) => !!el.closest(layer), LAYER), "the chapter is page content").toBe(false);
    await page.locator("video").evaluate((v) => {
      (v as HTMLVideoElement).currentTime = 2;
    });
    await expect.poll(() => playerState(page).then((s) => s.time)).toBeGreaterThan(1.5);
    await chapter.click();
    await expect.poll(() => playerState(page).then((s) => s.time)).toBeLessThan(0.5);
    await expectServedByLayer(page);
  });

  test("SPEC-CORE-194 I6: on a queue page the media session's next and previous move through the queue, each file played by the layer", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const handlers: Record<string, MediaSessionActionHandler | null> = {};
      (window as unknown as { __mediaSession: typeof handlers }).__mediaSession = handlers;
      const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = (action, handler) => {
        handlers[action] = handler;
        return set(action, handler);
      };
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${FIXTURE_URL}?run=media-session#queue-page-video`);
    await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
    await expect(page.locator("video")).toHaveCount(1);
    await expectServedByLayer(page);
    await play(page);
    const sources = () => page.locator("video").evaluateAll((vs) => vs.map((v) => v.getAttribute("src") ?? ""));
    const invoke = (action: string) =>
      page.evaluate((a) => {
        const h = (window as unknown as { __mediaSession: Record<string, MediaSessionActionHandler | null> })
          .__mediaSession[a];
        h?.({ action: a as MediaSessionAction });
        return !!h;
      }, action);

    expect(await invoke("nexttrack"), "next is offered").toBe(true);
    await expect.poll(sources).toEqual([expect.stringContaining(LONG)]);
    await expectServedByLayer(page);

    expect(await invoke("previoustrack"), "previous is offered").toBe(true);
    await expect.poll(sources).toEqual([expect.not.stringContaining(LONG)]);
    await expectServedByLayer(page);
  });
});
