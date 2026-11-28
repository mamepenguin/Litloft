/**
 * SPEC-CORE-194 at desktop widths: the file page's player is rendered by the
 * layer in `AppShell` over the slot the page draws. The real `AppShell`, file
 * page and player; every case is about boxes, paint order and elements only a
 * browser produces.
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
  frameCount,
  frames,
  layerPaintedOutside,
  markPlayer,
  openFilePage,
  mismatchedFrames,
  play,
  playerState,
  recordFrames,
  recordRequests,
  rectOf,
  requests,
  settle,
  slotVisibleArea,
} from "./player-layer.measure";

const VIDEO = "video0000001";
const LONG = "qlong0000001";

test.beforeEach(({ context }) => serveFixture(context));

let navigation = 0;

/**
 * A profile cookie, so the player sends its progress to the server; and the
 * second queued file's stream answered with the fixture clip, so it starts.
 */
async function openQueuePage(page: Page): Promise<void> {
  await page.context().addCookies([{ name: "lit_viewer", value: "Tester", url: FIXTURE_URL }]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${FIXTURE_URL}?run=${++navigation}#queue-page-video`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(page.getByTestId("file-detail-shell")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expectServedByLayer(page);
  const clip = await page.locator("video").evaluate(async (v) => {
    const bytes = new Uint8Array(await (await fetch((v as HTMLVideoElement).currentSrc)).arrayBuffer());
    let text = "";
    for (const c of bytes) text += String.fromCharCode(c);
    return btoa(text);
  });
  await page.route(`**/api/files/${LONG}/stream*`, (route) =>
    route.fulfill({ status: 200, contentType: "video/webm", body: Buffer.from(clip, "base64") }),
  );
}

const header = (page: Page) => page.locator("header");
const inspectorToggle = (page: Page) =>
  header(page).getByTestId("inspector-toggle").filter({ visible: true });
const treeButton = (page: Page) =>
  page.getByTestId("chrome-buttons").getByRole("button", { name: /^(Show|Hide) tree$/ });
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

async function pressT(page: Page): Promise<void> {
  await blur(page);
  await page.keyboard.press("t");
}

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
  page.evaluate(() => document.querySelector<HTMLElement>("[data-test-scroller]")!.scrollTop);

test.describe("SPEC-CORE-194 I1: one player, rendered by the layer", () => {
  test("SPEC-CORE-194 I1: a video file page holds exactly one <video>, inside the layer and outside the slot and the routed content", async ({
    page,
  }) => {
    await openFilePage(page);
    const outside = await page.evaluate(
      ({ layer }) => {
        const v = document.querySelector("video")!;
        const content = document.querySelector('[data-testid="page-content"]');
        return { inLayer: !!v.closest(layer), inRoutedContent: !!content?.contains(v) };
      },
      { layer: LAYER },
    );
    expect(outside).toEqual({ inLayer: true, inRoutedContent: false });
  });

  test("SPEC-CORE-194 I1: after a file-to-file change the document holds one <video> of the new file, and the old file's last sends precede the new file's GET /progress", async ({
    page,
  }) => {
    await recordRequests(page);
    await openQueuePage(page);
    await page.locator("video").evaluate(async (v) => {
      (v as HTMLVideoElement).muted = true;
      await (v as HTMLVideoElement).play();
    });
    await page.waitForTimeout(2000);

    await page.evaluate(
      (id) => window.__fixtureNavigate!("/drive/fixture", `file=${encodeURIComponent(id)}`),
      LONG,
    );
    await expect
      .poll(() => page.locator("video").evaluateAll((vs) => vs.map((v) => v.getAttribute("src") ?? (v as HTMLVideoElement).currentSrc)))
      .toEqual([expect.stringContaining(LONG)]);
    await expectServedByLayer(page);

    const log = await requests(page);
    const isOld = (r: { url: string }) => r.url.includes(`/api/files/${VIDEO}/`);
    const oldGet = log.findIndex(
      (r) => r.method === "GET" && r.url.split("?")[0].endsWith(`/api/files/${VIDEO}/progress`),
    );
    const oldSends = log
      .map((r, i) => ({ ...r, i }))
      .filter((r) => r.i > oldGet && isOld(r) && r.method !== "GET" && /\/(progress|played-ranges)(\?|$)/.test(r.url));
    const newGet = log.findIndex(
      (r) => r.method === "GET" && r.url.split("?")[0].endsWith(`/api/files/${LONG}/progress`),
    );
    expect(oldGet, "the old file read its progress").toBeGreaterThanOrEqual(0);
    expect(oldSends.length, "the old file sent its progress after playing").toBeGreaterThan(0);
    expect(newGet, "the new file read its progress").toBeGreaterThanOrEqual(0);
    for (const send of oldSends) expect(send.i, `${send.method} ${send.url}`).toBeLessThan(newGet);
  });
});

test.describe("SPEC-CORE-194 on a queue page", () => {
  test("SPEC-CORE-194 I2 / I5: with the queue pane shown and hidden, the player is on the slot and keeps the same playing element", async ({
    page,
  }) => {
    await openQueuePage(page);
    await expect(page.locator('aside[aria-label="Queue"]')).toBeVisible();
    await expectLayerOnSlot(page, "queue pane shown");
    await play(page);
    await markPlayer(page);
    await page.getByRole("button", { name: "Hide the queue" }).click();
    await expect(page.locator('aside[aria-label="Queue"]')).toBeHidden();
    await expectLayerOnSlot(page, "queue pane hidden");
    expect(await playerState(page)).toMatchObject({ count: 1, same: true, playing: true });
    await page.getByRole("button", { name: "Show the queue" }).click();
    await expect(page.locator('aside[aria-label="Queue"]')).toBeVisible();
    await expectLayerOnSlot(page, "queue pane shown again");
    expect(await playerState(page)).toMatchObject({ count: 1, same: true, playing: true });
  });

  test("SPEC-CORE-194 I6: on a queue page the end of the file moves to the next entry, whose player the layer renders", async ({
    page,
  }) => {
    await openQueuePage(page);
    await page.locator("video").evaluate(async (v) => {
      const video = v as HTMLVideoElement;
      video.muted = true;
      video.currentTime = Math.max(0, (video.duration || 3) - 0.3);
      await video.play();
    });
    await expect
      .poll(() => page.locator("video").evaluateAll((vs) => vs.map((v) => v.getAttribute("src") ?? "")), { timeout: 10_000 })
      .toEqual([expect.stringContaining(LONG)]);
    await expectServedByLayer(page);
    await expectLayerOnSlot(page, "next entry");
  });
});

test.describe("SPEC-CORE-194 I2: the player is on the slot, within its visible area", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    const size = `${viewport.width}x${viewport.height}`;

    test(`SPEC-CORE-194 I2 (${size}): no panel, the inspector toggled, the tree pane toggled, focus mode and the find bar`, async ({
      page,
    }) => {
      await openFilePage(page, viewport);
      await expectLayerOnSlot(page, "no panel");

      await inspectorToggle(page).click();
      await expectLayerOnSlot(page, "inspector toggled");
      await inspectorToggle(page).click();
      await expectLayerOnSlot(page, "inspector toggled back");

      await treeButton(page).click();
      await expectLayerOnSlot(page, "tree pane toggled");
      await treeButton(page).click();
      await expectLayerOnSlot(page, "tree pane toggled back");

      await pressT(page);
      await expectLayerOnSlot(page, "focus mode");
      await pressT(page);
      await expectLayerOnSlot(page, "focus mode left");

      await page.keyboard.press("ControlOrMeta+f");
      await expectLayerOnSlot(page, "find bar open");
      await page.keyboard.press("Escape");
      await expectLayerOnSlot(page, "find bar closed");
    });

    test(`SPEC-CORE-194 I2 (${size}): with the docked sidebar open the player is on the slot`, async ({
      page,
    }) => {
      await openFilePage(page, { ...viewport, storage: { "workbench-panels": "[]", "sidebar-open": "true" } });
      const content = (await rectOf(page, '[data-testid="page-content"]'))!;
      expect(content.left, "the docked sidebar pads the page").toBeGreaterThan(100);
      await expectLayerOnSlot(page, "docked sidebar");
    });

    test(`SPEC-CORE-194 I2 (${size}): with the canvas scrolled so the slot is partly cut off, no pixel of the player is painted outside the slot's visible area`, async ({
      page,
    }) => {
      await openFilePage(page, { width: viewport.width, height: 520 });
      await addFiller(page);
      await settle(page);
      const scroller = await scrollerOfSlot(page);
      expect(scroller, "the canvas scrolls at this height").not.toBeNull();
      const slot = (await rectOf(page, SLOT))!;
      await page.evaluate(
        (by) => document.querySelector<HTMLElement>("[data-test-scroller]")!.scrollBy(0, by),
        Math.min(scroller!.max, slot.height / 2 + Math.max(0, slot.top)),
      );
      await expectLayerOnSlot(page, "scrolled");
      const area = (await slotVisibleArea(page))!;
      expect(area.height, "part of the slot is cut off").toBeLessThan((await rectOf(page, SLOT))!.height - 1);
    });
  }
});

test.describe("SPEC-CORE-194 I3: matched in the first painted frame", () => {
  const actions: [string, (page: Page) => Promise<void>][] = [
    ["toggling the inspector", (page) => inspectorToggle(page).click()],
    ["entering focus mode", (page) => pressT(page)],
    ["opening the find bar", (page) => page.keyboard.press("ControlOrMeta+f")],
    ["a window resize", (page) => page.setViewportSize({ width: 1100, height: 760 })],
  ];

  test("SPEC-CORE-194 I3: in the first painted frame after the slot mounts the player is on it", async ({
    page,
  }) => {
    await recordFrames(page);
    await openFilePage(page);
    await settle(page);
    expect(await frameCount(page)).toBeGreaterThan(0);
    expect(await mismatchedFrames(page)).toEqual([]);
  });

  for (const [name, act] of actions) {
    test(`SPEC-CORE-194 I3: in every painted frame after ${name} the player's box equals the slot's`, async ({
      page,
    }) => {
      await recordFrames(page);
      await openFilePage(page);
      await settle(page);
      const before = await rectOf(page, SLOT);
      await clearFrames(page);
      await act(page);
      await settle(page);
      expect(await rectOf(page, SLOT), "the slot's box changed").not.toEqual(before);
      expect(await mismatchedFrames(page)).toEqual([]);
    });
  }

  test("SPEC-CORE-194 I3: in every painted frame after leaving focus mode the player's box equals the slot's", async ({
    page,
  }) => {
    await recordFrames(page);
    await openFilePage(page);
    await pressT(page);
    await settle(page);
    const before = await rectOf(page, SLOT);
    await clearFrames(page);
    await pressT(page);
    await settle(page);
    expect(await rectOf(page, SLOT), "the slot's box changed").not.toEqual(before);
    expect(await mismatchedFrames(page)).toEqual([]);
  });

  test("SPEC-CORE-194 I3: switching the controls mode changes the slot's height and the player matches it in the first painted frame", async ({
    page,
  }) => {
    await recordFrames(page);
    await openFilePage(page);
    await settle(page);
    const before = (await rectOf(page, SLOT))!;
    await clearFrames(page);
    await page.locator(LAYER).getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("switch", { name: "Browser controls" }).click();
    await settle(page);
    expect((await rectOf(page, SLOT))!.height).not.toBeCloseTo(before.height, 0);
    expect(await mismatchedFrames(page)).toEqual([]);
  });
});

test.describe("SPEC-CORE-194 I4: paint order at the overlap", () => {
  test("SPEC-CORE-194 I4: the player paints over the page content it covers", async ({ page }) => {
    await openFilePage(page);
    await settle(page);
    const hit = await page.evaluate((layer) => {
      const r = document.querySelector(layer)!.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!el?.closest(layer);
    }, LAYER);
    expect(hit).toBe(true);
  });

  const overlays: [string, string, (page: Page) => Promise<void>][] = [
    ["the shortcut sheet", '[aria-modal="true"]', async (page) => {
      await blur(page);
      await page.keyboard.press("?");
    }],
    ["the search palette", '[aria-modal="true"]', (page) => page.keyboard.press("ControlOrMeta+k")],
    ["a dialog", '[aria-modal="true"]', (page) =>
      page.evaluate(() => window.__fixtureOpenDialog!("rename"))],
  ];

  for (const [name, selector, openIt] of overlays) {
    test(`SPEC-CORE-194 I4: ${name} paints over the player`, async ({ page }) => {
      await openFilePage(page);
      await settle(page);
      await openIt(page);
      await expect(page.locator(selector).filter({ visible: true }).first()).toBeVisible();
      await frames(page, 2);
      expect(await coveredBy(page, selector)).toEqual({ overlap: true, over: true, layer: false });
    });
  }
});

test.describe("SPEC-CORE-194 I5: the same element through layout changes", () => {
  const changes: [string, (page: Page) => Promise<void>][] = [
    ["toggling the inspector", (page) => inspectorToggle(page).click()],
    ["focus mode", (page) => pressT(page)],
    ["leaving focus mode", (page) => pressT(page)],
    ["the tree pane", (page) => treeButton(page).click()],
    ["the find bar", (page) => page.keyboard.press("ControlOrMeta+f")],
    ["closing the find bar", (page) => page.keyboard.press("Escape")],
    ["a resize", (page) => page.setViewportSize({ width: 1440, height: 900 })],
  ];

  test("SPEC-CORE-194 I5: the <video>, its currentTime and its play state survive the inspector, focus mode, the tree pane, the find bar and a resize", async ({
    page,
  }) => {
    await openFilePage(page);
    await play(page);
    await markPlayer(page);
    for (const [name, change] of changes) {
      const before = await playerState(page);
      await change(page);
      await settle(page);
      const after = await playerState(page);
      expect({ count: after.count, same: after.same, playing: after.playing }, name).toEqual({
        count: 1,
        same: true,
        playing: true,
      });
      expect(after.time, `${name}: currentTime kept`).toBeGreaterThanOrEqual(before.time - 0.05);
    }
    await expectServedByLayer(page);
  });

  test("SPEC-CORE-194 I5: system full screen in and out keeps the same playing element, and the player is back on the slot", async ({
    page,
  }) => {
    await openFilePage(page);
    await play(page);
    await markPlayer(page);
    await page.locator(LAYER).getByRole("button", { name: "Full screen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    expect(
      await page.evaluate((layer) => !!document.fullscreenElement?.closest(layer) || !!document.fullscreenElement?.querySelector(layer) || !!document.querySelector(layer)?.contains(document.fullscreenElement), LAYER),
      "the layer's player is what is in full screen",
    ).toBe(true);
    expect(await playerState(page)).toMatchObject({ count: 1, same: true, playing: true });
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await settle(page);
    expect(await playerState(page)).toMatchObject({ count: 1, same: true, playing: true });
    await expectLayerOnSlot(page, "after system full screen");
  });
});

test.describe("SPEC-CORE-194 I6: the page acts on the layer's player", () => {
  test("SPEC-CORE-194 I6: with focus on the page, space, the arrow keys and m act on the layer's <video>", async ({
    page,
  }) => {
    await openFilePage(page);
    await play(page);
    await blur(page);
    await page.keyboard.press(" ");
    await expect.poll(() => playerState(page).then((s) => s.playing)).toBe(false);
    await page.evaluate(() => {
      document.querySelector("video")!.currentTime = 0.5;
    });
    await blur(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => playerState(page).then((s) => s.time)).toBeGreaterThan(0.9);
    const muted = () => page.locator("video").evaluate((v) => (v as HTMLVideoElement).muted);
    const before = await muted();
    await blur(page);
    await page.keyboard.press("m");
    await expect.poll(muted).toBe(!before);
    await expectServedByLayer(page);
  });
});

test.describe("SPEC-CORE-194 I7: scrolling", () => {
  test("SPEC-CORE-194 I7: scrolling the slot out of view while playing draws no box", async ({ page }) => {
    await openFilePage(page, { width: 1280, height: 520 });
    await play(page);
    await addFiller(page);
    await settle(page);
    const scroller = await scrollerOfSlot(page);
    expect(scroller, "the canvas scrolls at this height").not.toBeNull();
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>("[data-test-scroller]")!;
      s.scrollTop = s.scrollHeight;
    });
    await settle(page);
    const area = await slotVisibleArea(page);
    expect(area?.height ?? 0, "the slot is scrolled out of view").toBe(0);
    expect(await layerPaintedOutside(page, area)).toEqual([]);
    expect(await playerState(page)).toMatchObject({ count: 1 });
  });

  test("SPEC-CORE-194 I7: a wheel that starts on the player scrolls the slot's scroller by the same amount as one beside it", async ({
    page,
  }) => {
    await openFilePage(page, { width: 1280, height: 520 });
    await addFiller(page);
    await settle(page);
    const scroller = await scrollerOfSlot(page);
    expect(scroller, "the canvas scrolls at this height").not.toBeNull();
    expect(scroller!.max).toBeGreaterThan(120);

    const layer = (await rectOf(page, LAYER))!;
    await page.mouse.move(layer.left + layer.width / 2, layer.top + Math.min(layer.height, 520 - layer.top) / 2);
    const start = await scrollerTop(page);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => scrollerTop(page)).not.toBe(start);
    await frames(page, 4);
    const onPlayer = (await scrollerTop(page)) - start;

    await page.evaluate(() => {
      document.querySelector<HTMLElement>("[data-test-scroller]")!.scrollTop = 0;
    });
    await frames(page, 2);
    const off = await page.evaluate(
      ({ layer }) => {
        const s = document.querySelector<HTMLElement>("[data-test-scroller]")!;
        const r = s.getBoundingClientRect();
        const l = document.querySelector(layer)!.getBoundingClientRect();
        for (let y = r.bottom - 4; y > r.top; y -= 8) {
          for (let x = r.left + 4; x < r.right; x += 16) {
            const hit = document.elementFromPoint(x, y);
            if (hit && s.contains(hit) && !hit.closest(layer) && (y > l.bottom || x > l.right || x < l.left)) return { x, y };
          }
        }
        return null;
      },
      { layer: LAYER },
    );
    expect(off, "a point of the scroller beside the player").not.toBeNull();
    await page.mouse.move(off!.x, off!.y);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => scrollerTop(page)).not.toBe(0);
    await frames(page, 4);
    const beside = await scrollerTop(page);

    expect(onPlayer).toBe(beside);
  });
});

test.describe("SPEC-CORE-194 I10: Tab order", () => {
  test("SPEC-CORE-194 I10: Tab reaches the player's controls after every focusable element of the routed content, and right after the last one", async ({
    page,
  }) => {
    await openFilePage(page);
    await settle(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    const order: ("content" | "layer" | "other")[] = [];
    for (let i = 0; i < 250; i += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate((layer) => {
        const el = document.activeElement;
        if (!el || el === document.body) return "other";
        if (el.closest(layer)) return "layer";
        if (document.querySelector('[data-testid="page-content"]')?.contains(el)) return "content";
        return "other";
      }, LAYER);
      if (where === "other" && order.length > 0 && order.includes("layer") && order[order.length - 1] !== "layer") {
        order.push(where);
        break;
      }
      order.push(where);
    }
    const firstLayer = order.indexOf("layer");
    const lastContent = order.lastIndexOf("content");
    expect(firstLayer, "Tab reaches the player's controls").toBeGreaterThanOrEqual(0);
    expect(lastContent, "Tab reaches the page's content").toBeGreaterThanOrEqual(0);
    expect(firstLayer, "the player's controls come after the routed content").toBeGreaterThan(lastContent);
    expect(order.slice(lastContent + 1, firstLayer), "nothing between the last page element and the player").toEqual([]);
  });
});
