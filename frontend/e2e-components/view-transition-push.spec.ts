/**
 * What only a browser can answer about a view transition: which names are
 * live while one runs, that no value is on two elements at once, and that
 * the document is clean afterwards.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

/**
 * Declared, not collected: a set built from the run cannot notice that a
 * name stopped being applied. `root` is the browser's own — it sits on
 * `<html>` at all times and groups everything left over.
 */
const AT_REST = ["root"];
const DURING = ["listing", "page-heading", "root"];

interface Probe {
  kind: string | null;
  names: string[];
  groups: string[];
}

declare global {
  interface Window {
    __probe: () => Probe;
    /** Presses a control, then samples the first frame that is animating. */
    __pressAndSample: (id: string) => Promise<Probe>;
  }
}

const INSTALL = () => {
  window.__probe = () => ({
    kind: document.documentElement.dataset.vt ?? null,
    names: Array.from(document.querySelectorAll("*"))
      .map((el) => getComputedStyle(el).viewTransitionName)
      .filter((name) => name && name !== "none")
      .sort(),
    groups: [
      ...new Set(
        document
          .getAnimations()
          .map((a) => String((a.effect as KeyframeEffect)?.pseudoElement ?? ""))
          .filter((p) => p.startsWith("::view-transition-group("))
          .map((p) => p.slice("::view-transition-group(".length, -1)),
      ),
    ].sort(),
  });

  // Pressed and sampled inside the page: the pseudo-elements exist only
  // between the two captures, which is shorter than a round trip.
  window.__pressAndSample = async (id: string) => {
    document.getElementById(id)!.click();
    for (let frame = 0; frame < 120; frame++) {
      const seen = window.__probe();
      if (seen.groups.length > 0) return seen;
      await new Promise(requestAnimationFrame);
    }
    return window.__probe();
  };
};

let run = 0;

async function open(page: Page): Promise<void> {
  await page.addInitScript(INSTALL);
  await page.goto(`${FIXTURE}?run=${++run}#folder-push`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "folder-push",
  );
}

const settled = (page: Page) =>
  expect
    .poll(async () => (await page.evaluate(() => window.__probe())).kind, {
      timeout: 4000,
    })
    .toBe(null);

test("names the listing and the heading only while a transition runs, and never twice", async ({
  page,
}) => {
  await open(page);

  expect(await page.evaluate(() => window.__probe())).toEqual({
    kind: null,
    names: AT_REST,
    groups: [],
  });

  const during = await page.evaluate(() => window.__pressAndSample("go-down"));

  expect(during.kind).toBe("folder-down");
  expect(during.groups).toEqual(DURING);
  expect(during.names).toEqual(DURING);
  expect(new Set(during.names).size).toBe(during.names.length);

  await settled(page);

  expect(await page.evaluate(() => window.__probe())).toEqual({
    kind: null,
    names: AT_REST,
    groups: [],
  });
  await expect(page.locator("#page-body")).toHaveText("/drive/main/movies");
});

test("pushes the listing the other way coming back up", async ({ page }) => {
  await open(page);

  const down = await page.evaluate(() => window.__pressAndSample("go-down"));
  expect(down.kind).toBe("folder-down");
  await settled(page);

  const up = await page.evaluate(() => window.__pressAndSample("go-up"));
  expect(up.kind).toBe("folder-up");
  expect(up.groups).toEqual(DURING);

  await settled(page);
  await expect(page.locator("#page-body")).toHaveText("/drive/main");
});
