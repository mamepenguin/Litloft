/**
 * SPEC-ADDON-152 / 153 in Chromium with a mouse: the real Scenes section in
 * the real file page's workbench panels, the collection surface and the
 * stacked inspector's tab, and in a bounded box whose clock the case drives.
 */

import { test, expect, type Page } from "@playwright/test";

import {
  BOUNDED_SHORT,
  BOUNDED_STEP,
  CANONICAL,
  CHIP,
  COLLECTION,
  FRAMES,
  FULL_CARD_MIN,
  PAGE_STEP,
  expectOnlyTheListScrolls,
  expectPlaced,
  openBounded,
  openFilePage,
  openHost,
  recordFramesFromLoad,
  recordedFrames,
  restartRecord,
  scrollListTo,
  settled,
  wheelAt,
  type HostCase,
  type ListReading,
} from "./scenes-scroll-list.cases";

const PANEL_1400: HostCase = {
  name: "one Scenes panel at 1024×1400",
  viewport: { width: 1024, height: 1400 },
  hash: CANONICAL,
  options: { panels: ["scenes"], inspectorOpen: false },
};

const PANEL_900: HostCase = {
  name: "one Scenes panel at 1440×900",
  viewport: { width: 1440, height: 900 },
  hash: CANONICAL,
  options: { panels: ["scenes"], inspectorOpen: false },
};

const HOSTS: HostCase[] = [
  PANEL_1400,
  PANEL_900,
  {
    name: "two panels side by side at 1024×1400",
    viewport: { width: 1024, height: 1400 },
    hash: CANONICAL,
    options: { panels: ["transcript", "scenes"], inspectorOpen: false },
  },
  {
    name: "one Scenes panel at 1024×1400 with 4:3 pictures",
    viewport: { width: 1024, height: 1400 },
    hash: CANONICAL,
    options: { panels: ["scenes"], inspectorOpen: false, ratio: "4:3" },
  },
  {
    name: "one Scenes panel at 1440×900 with a stale Visual Index",
    viewport: { width: 1440, height: 900 },
    hash: CANONICAL,
    options: { panels: ["scenes"], inspectorOpen: false, vi: "stale" },
  },
  {
    name: "one Scenes panel at 1440×900 with no Visual Index",
    viewport: { width: 1440, height: 900 },
    hash: CANONICAL,
    options: { panels: ["scenes"], inspectorOpen: false, vi: "none" },
  },
  {
    name: "the collection surface's Scenes panel at 1280×1400",
    viewport: { width: 1280, height: 1400 },
    hash: COLLECTION,
    options: { panels: ["scenes"] },
  },
  {
    name: "the stacked inspector's Scenes tab at 768×1024",
    viewport: { width: 768, height: 1024 },
    hash: CANONICAL,
    options: {},
    tab: true,
  },
];

function timeLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function fixed(reading: ListReading) {
  return {
    ruler: Math.round(reading.ruler.top),
    card: Math.round(reading.card?.bottom ?? -1),
    action: Math.round(reading.action?.top ?? -1),
  };
}

test.describe("SPEC-ADDON-152 I1 — every frame is drawn and only the list scrolls", () => {
  for (const host of HOSTS) {
    test(`SPEC-ADDON-152 I1 — ${host.name}`, async ({ page }) => {
      const reading = await openHost(page, host);
      expect(reading.tiles).toBe(FRAMES);
      expectOnlyTheListScrolls(reading, host.name);
      expect(reading.list!.scrollHeight).toBeGreaterThan(reading.list!.clientHeight + 1);
      if (host.tab) expect(reading.host.kind).toBe("tabpanel");
      else expect(reading.host.kind).toBe("workbench");
    });
  }

  test("SPEC-ADDON-152 I1 — the 1024×1400 panel draws the columns its content width gives, 8 with no scrollbar gutter (D2)", async ({ page }) => {
    const reading = await openHost(page, PANEL_1400);
    expect(reading.tiles).toBe(FRAMES);
    const list = await page.evaluate(() => {
      const tile = document.querySelector<HTMLElement>("button[data-scene-tile]");
      let node = tile?.parentElement ?? null;
      while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
        node = node.parentElement;
      }
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        content:
          node.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight),
        gutter: node.offsetWidth - node.clientWidth,
        rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      };
    });
    expect(list, "the list is not a scroll container").not.toBeNull();
    const expected = Math.max(3, Math.floor((list!.content + 0.5 * list!.rem) / (7.5 * list!.rem)));
    expect(reading.columns).toBe(expected);
    if (list!.gutter === 0) expect(reading.columns).toBe(8);
    expect(reading.host.scrollHeight).toBeLessThanOrEqual(reading.host.clientHeight + 1);
  });

  test("SPEC-ADDON-152 I1 — turning a second panel on and off keeps the workbench body still", async ({
    page,
  }) => {
    const alone = await openHost(page, PANEL_1400);
    expectOnlyTheListScrolls(alone, "alone");
    expect(alone.tiles).toBe(FRAMES);

    await page
      .getByRole("group", { name: "Panels" })
      .getByRole("button", { name: "Transcript" })
      .click();
    await expect(page.getByTestId("fixture-transcript").first()).toBeVisible();
    expectOnlyTheListScrolls(await settled(page), "paired");

    await page.getByRole("button", { name: "Close Transcript" }).click();
    const again = await settled(page);
    expectOnlyTheListScrolls(again, "alone again");
    expect(again.columns).toBe(alone.columns);
  });

  test("SPEC-ADDON-152 I1 — resizing taller and shorter keeps only the list scrolling", async ({
    page,
  }) => {
    const first = await openHost(page, PANEL_1400);
    expect(first.tiles).toBe(FRAMES);
    for (const height of [1600, 900, 1200, 1400]) {
      await page.setViewportSize({ width: 1024, height });
      expectOnlyTheListScrolls(await settled(page), `1024×${height}`);
    }
  });
});

test.describe("SPEC-ADDON-152 I10 — the order and the fixed parts", () => {
  test("SPEC-ADDON-152 I10 — ruler, list, card, action row from the top; scrolling the list moves none of the others", async ({
    page,
  }) => {
    const before = await openHost(page, PANEL_1400);
    expect(before.tiles).toBe(FRAMES);
    expect(before.card).not.toBeNull();
    expect(before.action).not.toBeNull();
    expect(before.ruler.bottom).toBeLessThanOrEqual(before.visibleArea.top + 0.5);
    expect(before.card!.top).toBeGreaterThanOrEqual(before.visibleArea.bottom - 0.5);
    expect(before.action!.top).toBeGreaterThanOrEqual(before.card!.bottom - 0.5);

    await scrollListTo(page, 1500);
    const after = await settled(page);

    expect(after.visibleRows[0]).toBeGreaterThan(before.visibleRows[0]);
    expect(fixed(after)).toEqual(fixed(before));
    expect(after.host.scrollTop).toBe(before.host.scrollTop);
  });
});

test.describe("SPEC-ADDON-152 I5 — the card's form in a bounded host", () => {
  test("SPEC-ADDON-152 I5 — at 1024×1400 the card is full (D1)", async ({ page }) => {
    const reading = await openHost(page, PANEL_1400);
    expect(reading.tiles).toBe(FRAMES);
    expect(reading.card).not.toBeNull();
    expect(reading.card!.height).toBeGreaterThanOrEqual(FULL_CARD_MIN - 0.5);
  });

  test("SPEC-ADDON-152 I5 — at 1440×900 the card is one line and the list keeps at least a row (D4)", async ({
    page,
  }) => {
    const reading = await openHost(page, PANEL_900);
    expect(reading.tiles).toBe(FRAMES);
    expect(reading.card).not.toBeNull();
    expect(reading.card!.height).toBeLessThan(FULL_CARD_MIN / 2);
    expect(reading.list!.clientHeight).toBeGreaterThanOrEqual(reading.step - 1);
  });
});

test.describe("SPEC-ADDON-152 I2 — the first painted list", () => {
  function expectFromTheStart(frames: { tiles: number; firstVisible: string }[]): void {
    expect(frames.length, "no frame drew a tile").toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.tiles).toBe(FRAMES);
      expect(frame.firstVisible).toBe("Play from 0:00");
    }
  }

  test("SPEC-ADDON-152 I2 — opening the page with the panel on", async ({ page }) => {
    await recordFramesFromLoad(page);
    await openHost(page, PANEL_1400);
    expectFromTheStart(await recordedFrames(page));
  });

  test("SPEC-ADDON-152 I2 — turning the panel off and on after scrolling it", async ({ page }) => {
    await recordFramesFromLoad(page);
    const opened = await openHost(page, PANEL_1400);
    expect(opened.tiles).toBe(FRAMES);
    await scrollListTo(page, 2000);
    await page.getByRole("button", { name: "Close Scenes" }).click();
    await expect(page.getByRole("slider", { name: "Frame timeline" })).toHaveCount(0);
    await restartRecord(page);
    await page
      .getByRole("group", { name: "Panels" })
      .getByRole("button", { name: "Scenes" })
      .click();
    await settled(page);
    expectFromTheStart(await recordedFrames(page));
  });

  test("SPEC-ADDON-152 I2 — going back to the inspector's Scenes tab after another tab", async ({
    page,
  }) => {
    await recordFramesFromLoad(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await openFilePage(page, CANONICAL);
    await page.getByRole("tab", { name: "Scenes" }).click();
    expect((await settled(page)).tiles).toBe(FRAMES);
    await scrollListTo(page, 2000);
    await page.getByRole("tab", { name: "Info" }).click();
    await expect(page.getByRole("slider", { name: "Frame timeline" })).toHaveCount(0);
    await restartRecord(page);
    await page.getByRole("tab", { name: "Scenes" }).click();
    await settled(page);
    expectFromTheStart(await recordedFrames(page));
  });
});

test.describe("SPEC-ADDON-152 I3 I4 — the chip", () => {
  test("SPEC-ADDON-152 I4 — a wheel on the list draws the chip centred at the top of the list over the tiles; activating it goes back (D3)", async ({
    page,
  }) => {
    const before = await openHost(page, PANEL_1400);
    expect(before.chip).toBeNull();
    const area = before.visibleArea;
    const centre = {
      x: (before.ruler.left + before.ruler.right) / 2,
      y: (area.top + area.bottom) / 2,
    };

    await wheelAt(page, centre, 1200);
    const after = await settled(page);

    expect(after.chip, `no "${CHIP}" chip`).not.toBeNull();
    expect(after.visibleRows[0]).toBeGreaterThan(0);
    expect(after.chip!.top).toBeGreaterThanOrEqual(area.top - 0.5);
    expect(after.chip!.top).toBeLessThan(area.top + after.step);
    expect(Math.abs((after.chip!.left + after.chip!.right) / 2 - centre.x)).toBeLessThan(2);

    await page.getByRole("button", { name: CHIP }).click();
    const back = await settled(page);
    expect(back.chip).toBeNull();
    expect(back.visibleRows[0]).toBe(0);
  });
});

test.describe("SPEC-ADDON-153 — the ruler as the list's map", () => {
  async function videoTime(page: Page): Promise<{ time: number; paused: boolean }> {
    return page.evaluate(() => {
      const video = document.querySelector("video");
      return { time: video?.currentTime ?? -1, paused: video?.paused ?? true };
    });
  }

  function expectBand(reading: ListReading, step: number): void {
    expect(reading.band, "no band is drawn").not.toBeNull();
    const length = reading.rulerMax;
    const firstRow = reading.visibleRows[0];
    const lastRow = reading.visibleRows[reading.visibleRows.length - 1];
    const from = (reading.rowFirstFrame[firstRow] * step) / length;
    const nextRow = reading.rowFirstFrame[lastRow + 1];
    const to = nextRow === undefined ? 1 : (nextRow * step) / length;
    expect(reading.band!.left).toBeCloseTo(from * 100, 0);
    expect(reading.band!.right).toBeCloseTo(to * 100, 0);
  }

  test("SPEC-ADDON-153 I8 — the band covers the visible rows and moves when the list scrolls (D6)", async ({
    page,
  }) => {
    const opened = await openHost(page, PANEL_1400);
    expect(opened.tiles).toBe(FRAMES);
    expectBand(opened, PAGE_STEP);

    await scrollListTo(page, 2400);
    const scrolled = await settled(page);
    expect(scrolled.visibleRows[0]).toBeGreaterThan(opened.visibleRows[0]);
    expectBand(scrolled, PAGE_STEP);
    expect(scrolled.band!.left).toBeGreaterThan(opened.band!.left);
  });

  test("SPEC-ADDON-153 I9 — a mouse click sets the ruler point, places its row and never seeks", async ({
    page,
  }) => {
    const opened = await openHost(page, PANEL_1400);
    expect(opened.tiles).toBe(FRAMES);
    const before = await videoTime(page);
    const ruler = page.getByRole("slider", { name: "Frame timeline" });
    const box = (await ruler.boundingBox())!;
    const fraction = 0.6;

    await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
    const reading = await settled(page);

    const frame = Math.floor((fraction * reading.rulerMax) / PAGE_STEP);
    expect(Math.abs(reading.rulerNow - frame * PAGE_STEP)).toBeLessThanOrEqual(PAGE_STEP);
    expect(reading.rulerNow % PAGE_STEP).toBe(0);
    expectPlaced(reading, reading.rulerNow / PAGE_STEP, "after a ruler click");
    expect(await videoTime(page)).toEqual(before);
    expect(reading.chip).not.toBeNull();
  });

  test("SPEC-ADDON-153 I9 — hovering the ruler moves nothing (D6)", async ({ page }) => {
    const opened = await openHost(page, PANEL_1400);
    expect(opened.tiles).toBe(FRAMES);
    const ruler = page.getByRole("slider", { name: "Frame timeline" });
    const box = (await ruler.boundingBox())!;

    for (const fraction of [0.2, 0.5, 0.9]) {
      await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    }
    const hovered = await settled(page);

    expect(hovered.visibleRows).toEqual(opened.visibleRows);
    expect(hovered.rulerNow).toBe(opened.rulerNow);
    expect(hovered.cardText).toBe(opened.cardText);
  });
});

test.describe("SPEC-ADDON-152 I2 — following the playing frame", () => {
  test("SPEC-ADDON-152 I2 — opening at frame 200, every painted frame already shows the playing row placed", async ({
    page,
  }) => {
    await recordFramesFromLoad(page);
    await openBounded(page, { start: 200 * BOUNDED_STEP });
    const opened = await settled(page, BOUNDED_STEP);
    expect(opened.tiles).toBe(500);
    expectPlaced(opened, 200, "opened at frame 200");
    const firstVisible = `Play from ${timeLabel(
      opened.rowFirstFrame[opened.visibleRows[0]] * BOUNDED_STEP,
    )}`;

    const frames = await recordedFrames(page);
    expect(frames.length, "no frame drew a tile").toBeGreaterThan(0);
    expect(frames.filter((frame) => frame.firstVisible !== firstVisible)).toEqual([]);
  });

  test("SPEC-ADDON-152 §2 — a host too short for the fixed parts and one row keeps one row step in the list and scrolls itself", async ({
    page,
  }) => {
    await openBounded(page, { hash: BOUNDED_SHORT });
    const reading = await settled(page, BOUNDED_STEP);
    expect(reading.tiles).toBe(500);
    expect(reading.list).not.toBeNull();
    expect(Math.abs(reading.list!.clientHeight - reading.step)).toBeLessThanOrEqual(1);
    expect(reading.host.scrollHeight).toBeGreaterThan(reading.host.clientHeight + 1);
  });

  async function playAt(page: Page, seconds: number): Promise<ListReading> {
    await page.evaluate((time) => {
      (window as unknown as { __scenesPlayback: { time: number } }).__scenesPlayback.time = time;
    }, seconds);
    await page.waitForTimeout(400);
    return settled(page, BOUNDED_STEP);
  }

  test("SPEC-ADDON-152 I2 — the playing row is placed second when it leaves view and nothing scrolls while it is wholly visible", async ({
    page,
  }) => {
    await openBounded(page);
    const opened = await settled(page, BOUNDED_STEP);
    expect(opened.tiles).toBe(500);
    expect(opened.visibleRows[0]).toBe(0);

    const far = await playAt(page, 200 * BOUNDED_STEP);
    expectPlaced(far, 200, "at frame 200");
    const placedTop = far.list!.scrollTop;

    const lastWhole = far.whollyVisibleRows[far.whollyVisibleRows.length - 1];
    const stillInView = far.rowFirstFrame[lastWhole];
    const near = await playAt(page, stillInView * BOUNDED_STEP);
    expect(near.list!.scrollTop, "a wholly visible playing row scrolls nothing").toBe(placedTop);

    const past = far.rowFirstFrame[lastWhole + 1];
    const moved = await playAt(page, past * BOUNDED_STEP);
    expectPlaced(moved, past, `at frame ${past}`);
    expect(moved.list!.scrollTop).toBeGreaterThan(placedTop);
  });

  test("SPEC-ADDON-152 I3 — after a reader's wheel the list stays where the reader left it while playback moves", async ({
    page,
  }) => {
    await openBounded(page);
    const opened = await settled(page, BOUNDED_STEP);
    expect(opened.tiles).toBe(500);
    await wheelAt(
      page,
      {
        x: (opened.ruler.left + opened.ruler.right) / 2,
        y: (opened.visibleArea.top + opened.visibleArea.bottom) / 2,
      },
      900,
    );
    const read = await settled(page, BOUNDED_STEP);
    expect(read.chip).not.toBeNull();

    const later = await playAt(page, 400 * BOUNDED_STEP);
    expect(later.list!.scrollTop).toBe(read.list!.scrollTop);
    expect(later.chip).not.toBeNull();
  });

  test("SPEC-ADDON-152 §1.15 — a change of column count keeps the top row's first frame in the top row", async ({
    page,
  }) => {
    await openBounded(page);
    expect((await settled(page, BOUNDED_STEP)).tiles).toBe(500);
    await scrollListTo(page, 3000);
    const before = await settled(page, BOUNDED_STEP);
    const topFrame = before.rowFirstFrame[before.visibleRows[0]];

    await page.evaluate(() => {
      document.getElementById("scenes-host")!.style.width = "700px";
    });
    const after = await settled(page, BOUNDED_STEP);

    expect(after.columns).not.toBe(before.columns);
    const top = after.visibleRows[0];
    const row = Math.floor(topFrame / after.columns);
    expect(top).toBe(row);
  });
});
