/**
 * A video page with a stored panel, sampled every frame while the addon's
 * module is held in flight as a chunk fetch would be: the toggle, the panel
 * and the player cap may each appear once, and never go away again. Sampling
 * ends on what has been seen plus a settle window, because how long the
 * bundle and the module take depends on the machine.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const CANONICAL = "#inspector-video";
const VIEWPORT = { width: 1440, height: 900 };
const SETTLE_FRAMES = 30;
const SETTLE_MS = 500;
const SAMPLE_LIMIT_MS = 10_000;
const MODULE_DELAY_MS = 200;

interface Sample {
  toggle: boolean;
  panel: boolean;
  frame: number;
}

declare global {
  interface Window {
    __workbenchSamples: Sample[];
    __workbenchSamplesDone: boolean;
  }
}

let navigation = 0;

async function open(page: Page) {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(
    ({ settleFrames, settleMs, limitMs, halfHeight, label }) => {
      localStorage.setItem("workbench-panels", JSON.stringify(["transcript"]));
      const samples: Sample[] = [];
      window.__workbenchSamples = samples;
      const start = performance.now();
      let panelSeen = false;
      let cappedSeen = false;
      let settledFrame: number | null = null;
      let settledAt: number | null = null;
      const sample = () => {
        const video = document.querySelector("video");
        const titled = (element: Element | null) =>
          element?.querySelector("h2")?.textContent?.trim() === label;
        const panel = Array.from(document.querySelectorAll("section")).some(titled);
        const frame = video ? video.getBoundingClientRect().height : 0;
        samples.push({
          toggle: Array.from(
            document.querySelectorAll(
              '[role="group"][aria-label="Panels"] button',
            ),
          ).some((button) => button.textContent?.trim() === label),
          panel,
          frame,
        });
        if (panel) panelSeen = true;
        if (frame > 0 && frame <= halfHeight + 1) cappedSeen = true;
        const now = performance.now();
        if (panelSeen && cappedSeen && settledAt === null) {
          settledFrame = samples.length - 1;
          settledAt = now;
        }
        const settled =
          settledAt !== null &&
          settledFrame !== null &&
          samples.length - 1 - settledFrame >= settleFrames &&
          now - settledAt >= settleMs;
        if (settled || now - start >= limitMs) {
          window.__workbenchSamplesDone = true;
        } else {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    },
    {
      settleFrames: SETTLE_FRAMES,
      settleMs: SETTLE_MS,
      limitMs: SAMPLE_LIMIT_MS,
      halfHeight: VIEWPORT.height / 2,
      label: "Transcript",
    },
  );

  const query = new URLSearchParams({
    run: String(++navigation),
    panels: "one",
    "module-delay": String(MODULE_DELAY_MS),
  });
  await page.goto(`${FIXTURE}?${query}${CANONICAL}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "inspector-video",
  );
  await page.waitForFunction(() => window.__workbenchSamplesDone === true);
}

/** The index of the first sample where `predicate` holds, or -1. */
function first(samples: Sample[], predicate: (sample: Sample) => boolean) {
  return samples.findIndex(predicate);
}

test("a stored panel and the player cap settle in one step while the addon module loads", async ({
  page,
}) => {
  await open(page);
  const samples = await page.evaluate(() => window.__workbenchSamples);

  expect(samples.length).toBeGreaterThan(10);
  const half = VIEWPORT.height / 2;
  const capped = (sample: Sample) => sample.frame > 0 && sample.frame <= half + 1;

  const panelFrom = first(samples, (sample) => sample.panel);
  expect(panelFrom).toBeGreaterThan(-1);
  expect(samples.slice(panelFrom).every((sample) => sample.panel)).toBe(true);
  expect(samples.filter((sample) => sample.panel)).toHaveLength(
    samples.length - panelFrom,
  );
  expect(samples.slice(panelFrom).every((sample) => sample.toggle)).toBe(true);

  const capFrom = first(samples, capped);
  expect(capFrom).toBeGreaterThan(-1);
  expect(samples.slice(capFrom).every(capped)).toBe(true);
  expect(samples.slice(0, capFrom).some((sample) => sample.frame > half + 1)).toBe(
    true,
  );
});
