/**
 * SPEC-ADDON-152 I1 with a classic scrollbar on the list. Playwright starts
 * Chromium with `--hide-scrollbars`, under which no `::-webkit-scrollbar`
 * rule takes any width, so this file starts it without.
 */

import { test, expect } from "@playwright/test";

import {
  CANONICAL,
  FRAMES,
  classicScrollbars,
  expectOnlyTheListScrolls,
  openHost,
  overFrames,
} from "./scenes-scroll-list.cases";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("SPEC-ADDON-152 I1 — the columns and the list's position hold over 60 frames beside a classic scrollbar", async ({
  page,
}) => {
  await classicScrollbars(page);
  const reading = await openHost(page, {
    name: "one Scenes panel at 1024×1400",
    viewport: { width: 1024, height: 1400 },
    hash: CANONICAL,
    options: { panels: ["scenes"], inspectorOpen: false },
  });
  expectOnlyTheListScrolls(reading, "classic scrollbars");
  expect(reading.tiles).toBe(FRAMES);
  const frames = await overFrames(page, 60);
  expect(new Set(frames).size, frames.join(" ")).toBe(1);
});
