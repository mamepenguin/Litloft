/**
 * The collection surface's workbench metrics a real browser has to settle:
 * the distance between two panels, and the side inset the row and the
 * panels share with the player.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const COLLECTION = "#inspector-video-collection";
const REM = 16;
const PANEL_GAP = 0.75 * REM;
const PANEL_FLOOR = 18 * REM;

let navigation = 0;

interface OpenOptions {
  stored?: string[];
  panels?: "one" | "two";
}

async function open(page: Page, options: OpenOptions = {}) {
  const { stored = ["transcript"], panels = "one" } = options;
  await page.addInitScript((ids: string[]) => {
    localStorage.setItem("workbench-panels", JSON.stringify(ids));
  }, stored);
  const query = new URLSearchParams({ run: String(++navigation), panels });
  await page.goto(`${FIXTURE}?${query}${COLLECTION}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    COLLECTION.slice(1),
  );
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

async function box(page: Page, selector: string): Promise<Box> {
  return page.locator(selector).first().evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  });
}

const card = (page: Page, label: string) =>
  page.locator("section").filter({ has: page.locator("h2", { hasText: label }) });

async function cardBox(page: Page, label: string): Promise<Box> {
  const handle = card(page, label).first();
  await expect(handle).toBeVisible();
  return handle.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  });
}

async function transcriptLoaded(page: Page) {
  await expect(page.getByTestId("fixture-transcript").first()).toBeVisible();
}

/* ------------------------------------------------------------------ *
 * D-12: two panels keep their 12px apart inside the same 60% box
 * ------------------------------------------------------------------ */

test("SPEC-CORE-090 two side-by-side panels on the collection surface are 12px apart and together fill the 60% box", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { panels: "two", stored: ["transcript", "outline"] });
  await transcriptLoaded(page);

  const first = await cardBox(page, "Transcript");
  const second = await cardBox(page, "Outline");
  const expected = Math.max(18 * REM, page.viewportSize()!.height * 0.6);

  expect(Math.abs(first.right + PANEL_GAP - second.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(first.top - second.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(first.bottom - second.bottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(first.height - expected)).toBeLessThanOrEqual(2);
});

test("SPEC-CORE-090 two stacked panels on the collection surface are 12px apart and share the 60% box", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await open(page, { panels: "two", stored: ["transcript", "outline"] });
  await transcriptLoaded(page);

  const first = await cardBox(page, "Transcript");
  const second = await cardBox(page, "Outline");
  const expected = Math.max(PANEL_FLOOR, page.viewportSize()!.height * 0.6);

  expect(Math.abs(first.bottom + PANEL_GAP - second.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.bottom - first.top - expected)).toBeLessThanOrEqual(4);
  expect(Math.abs(first.height - second.height)).toBeLessThanOrEqual(2);
});

/* ------------------------------------------------------------------ *
 * D-13: the row and the panels share the player's side edges at 390
 * ------------------------------------------------------------------ */

test("SPEC-CORE-090 at 390 the toggle row and the shown panel share the player's side edges", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { stored: ["transcript"] });
  await expect(page.locator("video").first()).toBeVisible();
  await transcriptLoaded(page);

  const player = await box(page, "video");
  const row = await box(page, ".media-detail-workbench-row");
  const panel = await cardBox(page, "Transcript");

  expect(Math.abs(row.left - player.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(row.right - player.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(panel.left - player.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(panel.right - player.right)).toBeLessThanOrEqual(1);
});
