/**
 * SPEC-ADDON-104 I5 with a classic scrollbar on the Scenes section's scroller.
 * Playwright starts Chromium with `--hide-scrollbars`, under which no
 * `::-webkit-scrollbar` rule takes any width, so this file starts it without.
 */

import { test, expect } from "@playwright/test";

import {
  PANEL_1600,
  SHORT_PANEL,
  classicScrollbars,
  expectMoreThanThreeRows,
  openHost,
  rowsOverFrames,
  settledRows,
} from "./scenes-section-rows.cases";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.describe("SPEC-ADDON-104 I5 — with a classic scrollbar", () => {
  test("SPEC-ADDON-104 I5 — a tall panel fills without a scrollbar and holds over 60 frames", async ({
    page,
  }) => {
    await classicScrollbars(page);
    const reading = await openHost(page, PANEL_1600);
    expectMoreThanThreeRows(reading);
    expect(reading.scrollbar).toBe(0);
    const frames = await rowsOverFrames(page, 60);
    expect(new Set(frames)).toEqual(
      new Set([`${reading.rows}/${reading.tiles}`]),
    );
  });

  test("SPEC-ADDON-104 I5 — a short panel keeps 3 rows beside its scrollbar and holds over 60 frames", async ({
    page,
  }) => {
    await classicScrollbars(page);
    const reading = await openHost(page, SHORT_PANEL);
    expect(reading.scrollbar).toBeGreaterThan(0);
    expect(reading.rows).toBe(3);
    const frames = await rowsOverFrames(page, 60);
    expect(new Set(frames)).toEqual(
      new Set([`${reading.rows}/${reading.tiles}`]),
    );
  });

  test("SPEC-ADDON-104 I5 — resizing short, tall and short again settles each time", async ({
    page,
  }) => {
    await classicScrollbars(page);
    await openHost(page, {
      ...SHORT_PANEL,
      viewport: { width: 1024, height: 900 },
    });
    for (const height of [1600, 900, 1600]) {
      await page.setViewportSize({ width: 1024, height });
      const reading = await settledRows(page);
      if (height === 1600) {
        expectMoreThanThreeRows(reading);
        expect(reading.scrollbar).toBe(0);
      } else {
        expect(reading.rows).toBe(3);
      }
      const frames = await rowsOverFrames(page, 30);
      expect(new Set(frames), `rows over 30 frames at ${height}px`).toEqual(
        new Set([`${reading.rows}/${reading.tiles}`]),
      );
    }
  });
});
