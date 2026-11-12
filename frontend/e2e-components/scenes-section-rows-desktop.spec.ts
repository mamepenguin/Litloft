/**
 * SPEC-ADDON-104 in Chromium with a mouse: the real Scenes section inside the
 * real file page's workbench panel and inspector tab, measured against the
 * height its scroller gives it.
 */

import { test, expect } from "@playwright/test";

import {
  CANONICAL,
  COLLECTION,
  FRAMES,
  PANEL_1600,
  SHORT_PANEL,
  expectMoreThanThreeRows,
  expectRowsFillHeight,
  hoverRuler,
  openFilePage,
  readRows,
  recordFramesFromLoad,
  recordedFrames,
  restartRecord,
  rowsOverFrames,
  openHost,
  settledRows,
  type HostCase,
  type RowsReading,
} from "./scenes-section-rows.cases";

const TALL: HostCase[] = [
  {
    name: "one Scenes panel at 1024×1400",
    viewport: { width: 1024, height: 1400 },
    hash: CANONICAL,
    options: { panels: ["scenes"], inspectorOpen: false },
  },
  PANEL_1600,
  {
    name: "one Scenes panel at 1024×1600 with 4:3 pictures",
    viewport: { width: 1024, height: 1600 },
    hash: CANONICAL,
    options: { panels: ["scenes"], inspectorOpen: false, ratio: "4:3" },
  },
  {
    name: "one Scenes panel at 1024×1600 with a stale Visual Index",
    viewport: { width: 1024, height: 1600 },
    hash: CANONICAL,
    options: { panels: ["scenes"], inspectorOpen: false, vi: "stale" },
  },
  {
    name: "one Scenes panel at 1024×1600 with no Visual Index",
    viewport: { width: 1024, height: 1600 },
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
    name: "the inspector's Scenes tab at 900×1400",
    viewport: { width: 900, height: 1400 },
    hash: CANONICAL,
    options: {},
    tab: true,
  },
];

/** Bounded hosts where the rule gives 3 rows, today and after. */
const AT_THREE: HostCase[] = [
  SHORT_PANEL,
  {
    name: "two panels side by side at 1024×1400",
    viewport: { width: 1024, height: 1400 },
    hash: CANONICAL,
    options: { panels: ["transcript", "scenes"], inspectorOpen: false },
  },
  {
    name: "the inspector's Scenes tab at 768×1024",
    viewport: { width: 768, height: 1024 },
    hash: CANONICAL,
    options: {},
    tab: true,
  },
];

test.describe("SPEC-ADDON-104 I1 I2 — the grid has as many rows as its scroller fits, never fewer than 3", () => {
  for (const host of TALL) {
    test(`SPEC-ADDON-104 I1 I2 — ${host.name} draws more than 3 rows and leaves less than one under the last part`, async ({
      page,
    }) => {
      const reading = await openHost(page, host);
      if (host.tab) expect(reading.scrollerRole).toBe("tabpanel");
      else
        expect(reading.scrollerClass).toContain("media-detail-workbench-body");
      expectMoreThanThreeRows(reading);
      expect(reading.tiles).toBe(reading.rows * reading.columns);
      // SPEC-ADDON-089 I5 as revised: nothing inside the section scrolls.
      expect(reading.innerScrollers).toEqual([]);
    });
  }

  for (const host of AT_THREE) {
    test(`SPEC-ADDON-104 I1 — ${host.name} keeps 3 rows`, async ({ page }) => {
      const reading = await openHost(page, host);
      expectRowsFillHeight(reading);
      expect(reading.rows).toBe(3);
    });
  }

  test("SPEC-ADDON-104 I1 — at 1440×900 the panel body scrolls under 3 rows (D3)", async ({
    page,
  }) => {
    const reading = await openHost(page, SHORT_PANEL);
    expect(reading.rows).toBe(3);
    expect(reading.scrollHeight).toBeGreaterThan(reading.clientHeight + 1);
  });

  test("SPEC-ADDON-104 I1 — the 1024×1400 panel under a 1024-wide player is 8 columns by 4 rows (D1)", async ({
    page,
  }) => {
    const reading = await openHost(page, TALL[0]);
    expect(`${reading.columns}x${reading.rows}`).toBe("8x4");
  });
});

test("SPEC-ADDON-104 I3 — the ruler, grid, card and action row keep their order and today's gaps, and the leftover is under the action row", async ({
  page,
}) => {
  const order = async () =>
    page.evaluate(() => {
      const ruler = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="slider"][aria-label="Frame timeline"]',
        ),
      ).find((el) => el.getBoundingClientRect().height > 0)!;
      const scroller = ruler.closest<HTMLElement>(
        ".media-detail-workbench-body",
      )!;
      const tiles = Array.from(
        scroller.querySelectorAll<HTMLElement>(
          'button[aria-label^="Play from"]',
        ),
      ).filter((el) => el.getBoundingClientRect().height > 0);
      const grid = tiles[0].parentElement!.getBoundingClientRect();
      const card = Array.from(
        scroller.querySelectorAll<HTMLElement>("button.rounded-xl"),
      ).find((el) => el.getBoundingClientRect().height > 0)!;
      const action = Array.from(
        scroller.querySelectorAll<HTMLElement>("button"),
      ).find((el) => (el.textContent ?? "").trim() === "Regenerate scenes")!;
      return {
        ruler: ruler.getBoundingClientRect().bottom,
        gridTop: grid.top,
        gridBottom: grid.bottom,
        cardTop: card.getBoundingClientRect().top,
        cardBottom: card.getBoundingClientRect().bottom,
        actionTop: action.getBoundingClientRect().top,
      };
    });

  const short = await openHost(page, SHORT_PANEL);
  expect(short.rows).toBe(3);
  const today = await order();

  const reading = await openHost(page, PANEL_1600);
  expectMoreThanThreeRows(reading);
  expect(reading.lastPart).toBe("action row");
  const tall = await order();

  expect(tall.gridTop).toBeGreaterThan(tall.ruler);
  expect(tall.cardTop).toBeGreaterThan(tall.gridBottom);
  expect(tall.actionTop).toBeGreaterThanOrEqual(tall.cardBottom);
  expect(tall.cardTop - tall.gridBottom).toBeCloseTo(
    today.cardTop - today.gridBottom,
    0,
  );
  expect(tall.actionTop - tall.cardBottom).toBeCloseTo(
    today.actionTop - today.cardBottom,
    0,
  );
});

test("SPEC-ADDON-104 I4 — browsing the ruler never changes the rows or the grid's height", async ({
  page,
}) => {
  const opened = await openHost(page, PANEL_1600);
  expectMoreThanThreeRows(opened);
  const gridHeight = () =>
    page.evaluate(
      () =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            'button[aria-label^="Play from"]',
          ),
        )
          .filter((el) => el.getBoundingClientRect().height > 0)[0]
          .parentElement!.getBoundingClientRect().height,
    );
  const before = await gridHeight();

  for (const fraction of [0.01, 0.2, 0.45, 0.7, 0.99, 0.3]) {
    await hoverRuler(page, fraction);
    const reading = await settledRows(page);
    expect(reading.rows, `rows at ${fraction} of the ruler`).toBe(opened.rows);
    expect(reading.columns).toBe(opened.columns);
    expect(await gridHeight()).toBeCloseTo(before, 0);
  }
});

test.describe("SPEC-ADDON-089 I1 as revised by SPEC-ADDON-104 — the window is R × c frames", () => {
  test("SPEC-ADDON-089 I1 — the first window starts at frame 0 and the last is the last R·c frames", async ({
    page,
  }) => {
    const opened = await openHost(page, PANEL_1600);
    expectMoreThanThreeRows(opened);
    const size = opened.rows * opened.columns;
    expect(opened.frames).toEqual(Array.from({ length: size }, (_, k) => k));

    await hoverRuler(page, 0.999);
    const end = await settledRows(page);
    expect(end.rows).toBe(opened.rows);
    expect(end.frames).toEqual(
      Array.from({ length: size }, (_, k) => FRAMES - size + k),
    );
  });

  test("SPEC-ADDON-089 I1 — browsing across the ruler moves the window a row at a time, R·c frames each", async ({
    page,
  }) => {
    const opened = await openHost(page, PANEL_1600);
    expectMoreThanThreeRows(opened);
    const { rows, columns } = opened;
    const size = rows * columns;

    const starts: number[] = [opened.frames[0]];
    for (let step = 1; step <= 40; step += 1) {
      await hoverRuler(page, (step / 40) * 0.25);
      const reading = await readRows(page);
      expect(reading.frames).toEqual(
        Array.from({ length: size }, (_, k) => reading.frames[0] + k),
      );
      expect(reading.frames[0] % columns).toBe(0);
      expect(reading.frames[0]).toBeLessThanOrEqual(FRAMES - size);
      if (reading.frames[0] !== starts[starts.length - 1]) {
        starts.push(reading.frames[0]);
      }
    }
    expect(starts.length).toBeGreaterThan(2);
    for (let k = 1; k < starts.length; k += 1) {
      expect(starts[k] - starts[k - 1]).toBe(columns);
    }
  });
});

test("SPEC-ADDON-089 I8 as revised by SPEC-ADDON-104 — the R·c drawn frames' pictures are requested once the window stays", async ({
  page,
}) => {
  const opened = await openHost(page, PANEL_1600);
  expectMoreThanThreeRows(opened);
  const pictures = () =>
    page.evaluate(
      () =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            'button[aria-label^="Play from"]',
          ),
        )
          .filter((el) => el.getBoundingClientRect().height > 0)
          .filter((tile) => tile.querySelector("img") !== null).length,
    );
  await expect.poll(pictures).toBe(opened.rows * opened.columns);

  await hoverRuler(page, 0.5);
  const moved = await settledRows(page);
  expect(moved.rows).toBe(opened.rows);
  await expect.poll(pictures).toBe(moved.rows * moved.columns);
});

test("SPEC-ADDON-104 §2 — fewer frames than R·c are all drawn, in no more rows than they need", async ({
  page,
}) => {
  const reading = await openHost(page, {
    ...PANEL_1600,
    options: { ...PANEL_1600.options, frames: 30 },
  });
  expect(reading.tiles).toBe(30);
  expect(reading.frames).toEqual(Array.from({ length: 30 }, (_, k) => k));
  expect(reading.rows).toBe(Math.ceil(30 / reading.columns));
});

test.describe("SPEC-ADDON-104 I5 I6 — after a size change the rows settle on the rule and stay", () => {
  test("SPEC-ADDON-104 I5 — resizing the window taller, shorter and back", async ({
    page,
  }) => {
    const first = await openHost(page, TALL[0]);
    expectMoreThanThreeRows(first);

    for (const height of [1600, 900, 1200, 1400]) {
      await page.setViewportSize({ width: 1024, height });
      const reading = await settledRows(page);
      expectRowsFillHeight(reading);
      if (height === 900) expect(reading.rows).toBe(3);
      if (height === 1600) expect(reading.rows).toBeGreaterThan(first.rows);
      const frames = await rowsOverFrames(page, 30);
      expect(new Set(frames), `rows over 30 frames at ${height}px`).toEqual(
        new Set([`${reading.rows}/${reading.tiles}`]),
      );
    }
  });

  test("SPEC-ADDON-104 I5 — turning a second panel on and off", async ({
    page,
  }) => {
    const alone = await openHost(page, PANEL_1600);
    expectMoreThanThreeRows(alone);

    await page
      .getByRole("group", { name: "Panels" })
      .getByRole("button", { name: "Transcript" })
      .click();
    await expect(page.getByTestId("fixture-transcript").first()).toBeVisible();
    const paired = await settledRows(page);
    expectRowsFillHeight(paired);

    await page.getByRole("button", { name: "Close Transcript" }).click();
    await expect(
      page.getByRole("button", { name: "Close Transcript" }),
    ).toHaveCount(0);
    const again = await settledRows(page);
    expectMoreThanThreeRows(again);
    expect(`${again.columns}x${again.rows}`).toBe(
      `${alone.columns}x${alone.rows}`,
    );
  });

  test("SPEC-ADDON-104 I6 — once settled, the next 60 frames draw the same rows", async ({
    page,
  }) => {
    const reading = await openHost(page, PANEL_1600);
    expectMoreThanThreeRows(reading);
    const frames = await rowsOverFrames(page, 60);
    expect(new Set(frames)).toEqual(
      new Set([`${reading.rows}/${reading.tiles}`]),
    );
  });
});

test.describe("SPEC-ADDON-104 I7 — the first painted frame of a shown body already has its R", () => {
  /**
   * The Visual Index answer and the first picture's ratio may still move the
   * rows by one after opening, so the first frame is held to within one row
   * of the settled count, and no frame draws 3 when that count is above 4.
   */
  function expectFirstFrameNear(
    frames: { rows: number; tiles: number }[],
    settled: RowsReading,
  ): void {
    expect(frames.length, "no frame drew a tile").toBeGreaterThan(0);
    expect(settled.rows, "the settled rows").toBeGreaterThan(4);
    expect(
      frames[0].rows,
      `first frame ${frames[0].rows} rows, settled ${settled.rows}`,
    ).toBeGreaterThanOrEqual(settled.rows - 1);
    expect(frames.filter((frame) => frame.rows === 3)).toEqual([]);
  }

  test("SPEC-ADDON-104 I7 — opening the page with the Scenes panel on", async ({
    page,
  }) => {
    await recordFramesFromLoad(page);
    const settled = await openHost(page, PANEL_1600);
    expectFirstFrameNear(await recordedFrames(page), settled);
  });

  test("SPEC-ADDON-104 I7 — turning the Scenes panel off and on", async ({
    page,
  }) => {
    await recordFramesFromLoad(page);
    await openHost(page, PANEL_1600);
    await page.getByRole("button", { name: "Close Scenes" }).click();
    await expect(
      page.getByRole("slider", { name: "Frame timeline" }),
    ).toHaveCount(0);
    await restartRecord(page);
    await page
      .getByRole("group", { name: "Panels" })
      .getByRole("button", { name: "Scenes" })
      .click();
    await expect(
      page.getByRole("slider", { name: "Frame timeline" }),
    ).toBeVisible();
    const settled = await settledRows(page);
    expectFirstFrameNear(await recordedFrames(page), settled);
  });

  test("SPEC-ADDON-104 I7 — selecting the inspector's Scenes tab", async ({
    page,
  }) => {
    await recordFramesFromLoad(page);
    await page.setViewportSize({ width: 900, height: 1600 });
    await openFilePage(page, CANONICAL, { frames: FRAMES });
    await expect(page.getByRole("tab", { name: "Scenes" })).toBeVisible();
    await restartRecord(page);
    await page.getByRole("tab", { name: "Scenes" }).click();
    await expect(
      page.getByRole("slider", { name: "Frame timeline" }),
    ).toBeVisible();
    const settled = await settledRows(page);
    expectFirstFrameNear(await recordedFrames(page), settled);
  });

  test("SPEC-ADDON-104 I7 — going back to the Scenes tab after another tab", async ({
    page,
  }) => {
    await recordFramesFromLoad(page);
    await page.setViewportSize({ width: 900, height: 1600 });
    await openFilePage(page, CANONICAL, { frames: FRAMES });
    await page.getByRole("tab", { name: "Scenes" }).click();
    await expect(
      page.getByRole("slider", { name: "Frame timeline" }),
    ).toBeVisible();
    await settledRows(page);
    await page.getByRole("tab", { name: "Info" }).click();
    await expect(
      page.getByRole("slider", { name: "Frame timeline" }),
    ).toHaveCount(0);
    await restartRecord(page);
    await page.getByRole("tab", { name: "Scenes" }).click();
    const settled = await settledRows(page);
    expectFirstFrameNear(await recordedFrames(page), settled);
  });
});
