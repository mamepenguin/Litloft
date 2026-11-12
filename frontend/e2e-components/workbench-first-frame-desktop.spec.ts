/**
 * The first second of a video page with a stored panel. The addon's module is
 * held in flight, as a chunk fetch would be, and every frame is sampled: the
 * toggle, the panel and the player cap may each appear once, and never go
 * away again.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const CANONICAL = "#inspector-video";
const VIEWPORT = { width: 1440, height: 900 };
const SAMPLE_MS = 1000;
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
    ({ sampleMs, label }) => {
      localStorage.setItem("workbench-panels", JSON.stringify(["transcript"]));
      const samples: Sample[] = [];
      window.__workbenchSamples = samples;
      const start = performance.now();
      const sample = () => {
        const video = document.querySelector("video");
        const titled = (element: Element | null) =>
          element?.querySelector("h2")?.textContent?.trim() === label;
        samples.push({
          toggle: Array.from(
            document.querySelectorAll(
              '[role="group"][aria-label="Panels"] button',
            ),
          ).some((button) => button.textContent?.trim() === label),
          panel: Array.from(document.querySelectorAll("section")).some(titled),
          frame: video ? video.getBoundingClientRect().height : 0,
        });
        if (performance.now() - start < sampleMs) {
          requestAnimationFrame(sample);
        } else {
          window.__workbenchSamplesDone = true;
        }
      };
      requestAnimationFrame(sample);
    },
    { sampleMs: SAMPLE_MS, label: "Transcript" },
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
