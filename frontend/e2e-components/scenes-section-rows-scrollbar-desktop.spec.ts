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

  test("SPEC-ADDON-104 I2 I5 — shrinking from 1600 keeps the full width's columns and leaves no scrollbar", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await classicScrollbars(page);
    const opened = await openHost(page, PANEL_1600);
    expect(opened.scrollbar).toBe(0);
    expect(opened.rows).toBeGreaterThan(3);

    for (let height = 1590; height >= 1380; height -= 2) {
      await page.setViewportSize({ width: 1024, height });
      const reading = await settledRows(page);
      const at = `${reading.rows}x${reading.columns} at 1024×${height}`;
      expect(reading.rows, at).toBeGreaterThanOrEqual(3);
      if (reading.rows > 3 || reading.scrollbar === 0) {
        expect(reading.columns, `drawn columns: ${at}`).toBe(
          reading.fullWidthColumns,
        );
      }
      if (reading.rows > 3) {
        expect(reading.slack, `slack: ${at}`).toBeGreaterThanOrEqual(0);
        expect(reading.slack, `slack: ${at}`).toBeLessThan(reading.step);
        expect(
          reading.scrollHeight,
          `the scroller scrolls: ${at}`,
        ).toBeLessThanOrEqual(reading.clientHeight + 1);
      }
    }
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
