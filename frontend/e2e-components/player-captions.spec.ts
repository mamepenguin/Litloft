/**
 * Captions in the real player, where the browser's own handling of
 * `<track default>` is what decides the outcome.
 *
 * The last case is the control for the one above it: it runs the same
 * arrival through the same wait, for a viewer who has chosen nothing, and
 * it is what proves the browser turns the new track on when nothing stops
 * it. Without it, "the track is off after the arrival" would also hold in
 * a run where the arrival never happened.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const SEEDED = ["Auto-generated"];
const FETCHED = ["Japanese"];

/** The browser applies `default` to a new track in a task of its own. */
const SETTLE_MS = 300;

let navigation = 0;

async function open(page: Page) {
  await page.goto(`${FIXTURE}?run=${++navigation}#player-captions`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "player-captions",
  );
}

/**
 * Labelled, not just the modes: the seeded track set and the fetched one
 * are both a single track, so modes alone cannot tell an arrival that was
 * handled from a click that never landed.
 */
function tracks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const video = document.querySelector("video")!;
    return Array.from(video.textTracks).map(
      (track) => `${track.label}:${track.mode}`,
    );
  });
}

function labels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const video = document.querySelector("video")!;
    return Array.from(video.textTracks).map((track) => track.label);
  });
}

function showing(names: string[]): string[] {
  return names.map((name) => `${name}:showing`);
}

function disabled(names: string[]): string[] {
  return names.map((name) => `${name}:disabled`);
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByTestId("settings-sheet")).toBeVisible();
}

async function turnCaptionsOff(page: Page) {
  await openSettings(page);
  const toggle = page.getByRole("switch", { name: "Subtitles" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  // Away from the sheet, which stands between the scrim and the pointer.
  // Left open, the scrim swallows the next click instead of the arrival
  // button taking it.
  await page
    .getByTestId("settings-sheet-backdrop")
    .click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("settings-sheet")).toHaveCount(0);
}

/** The detail answer landing on a file that was drawn from its seed. */
async function subtitlesArrive(page: Page) {
  await page.locator("#subtitles-arrive").click();
  await expect.poll(() => labels(page)).toEqual(FETCHED);
  await page.waitForTimeout(SETTLE_MS);
}

test("the browser shows the default track until the viewer says otherwise", async ({
  page,
}) => {
  await open(page);
  expect(await tracks(page)).toEqual(showing(SEEDED));

  await turnCaptionsOff(page);
  expect(await tracks(page)).toEqual(disabled(SEEDED));
});

test("subtitles arriving with the file's metadata do not turn captions back on", async ({
  page,
}) => {
  await open(page);
  await turnCaptionsOff(page);

  await subtitlesArrive(page);

  expect(await tracks(page)).toEqual(disabled(FETCHED));
  await openSettings(page);
  await expect(page.getByRole("switch", { name: "Subtitles" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("a viewer who has never chosen keeps the track set's own default", async ({
  page,
}) => {
  await open(page);

  await subtitlesArrive(page);

  expect(await tracks(page)).toEqual(showing(FETCHED));
});
