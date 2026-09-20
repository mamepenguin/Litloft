/**
 * What only a browser can answer about a view transition: which names are
 * live while one runs, that no value is on two elements at once, that a
 * named element is small enough for its snapshot to sit where it belongs,
 * and that the document is clean afterwards.
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
const DURING = ["listing", "root"];

interface Named {
  name: string;
  top: number;
  bottom: number;
  backgroundAlpha: number;
}

interface Probe {
  kind: string | null;
  names: string[];
  groups: string[];
  /** Every named element but `<html>`, in viewport coordinates. */
  boxes: Named[];
  viewportHeight: number;
}

declare global {
  interface Window {
    __probe: () => Probe;
    __pressAndSample: (id: string) => Promise<Probe>;
    __scrollListing: (top: number) => number;
  }
}

const INSTALL = () => {
  window.__probe = () => {
    const named = Array.from(document.querySelectorAll("*"))
      .map((el) => ({ el, name: getComputedStyle(el).viewTransitionName }))
      .filter(({ name }) => name && name !== "none");
    return {
      kind: document.documentElement.dataset.vt ?? null,
      names: named.map(({ name }) => name).sort(),
      groups: [
        ...new Set(
          document
            .getAnimations()
            .map((a) => String((a.effect as KeyframeEffect)?.pseudoElement ?? ""))
            .filter((p) => p.startsWith("::view-transition-group("))
            .map((p) => p.slice("::view-transition-group(".length, -1)),
        ),
      ].sort(),
      boxes: named
        .filter(({ el }) => el !== document.documentElement)
        .map(({ el, name }) => {
          const box = el.getBoundingClientRect();
          return {
            name,
            top: Math.round(box.top),
            bottom: Math.round(box.bottom),
            backgroundAlpha: (() => {
              const colour = getComputedStyle(el).backgroundColor;
              const parts = colour.match(/[\d.]+/g) ?? [];
              return parts.length === 4 ? Number(parts[3]) : 1;
            })(),
          };
        }),
      viewportHeight: window.innerHeight,
    };
  };

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

  window.__scrollListing = (top: number) => {
    const scroller = document.querySelector("[data-listing-scroller]")!;
    scroller.scrollTop = top;
    return scroller.scrollTop;
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

test("names the scroller only while a transition runs, and never twice", async ({
  page,
}) => {
  await open(page);

  const before = await page.evaluate(() => window.__probe());
  expect(before.kind).toBe(null);
  expect(before.names).toEqual(AT_REST);
  expect(before.groups).toEqual([]);

  const during = await page.evaluate(() => window.__pressAndSample("go-down"));

  expect(during.kind).toBe("folder-down");
  expect(during.groups).toEqual(DURING);
  expect(during.names).toEqual(DURING);
  expect(new Set(during.names).size).toBe(during.names.length);

  await settled(page);

  const after = await page.evaluate(() => window.__probe());
  expect(after.kind).toBe(null);
  expect(after.names).toEqual(AT_REST);
  expect(after.groups).toEqual([]);
  await expect(page.locator("#page-body")).toContainText("/drive/main/movies");
});

/**
 * A snapshot is placed against the viewport and nothing clips it, so a
 * named element taller than the window paints outside whatever was
 * clipping it — over the app's own chrome.
 */
test("names nothing that reaches outside the window, at any scroll position", async ({
  page,
}) => {
  await open(page);

  const scrolled = await page.evaluate(() => window.__scrollListing(900));
  expect(scrolled).toBeGreaterThan(0);

  const during = await page.evaluate(() => window.__pressAndSample("go-down"));

  expect(during.boxes).toHaveLength(1);
  for (const box of during.boxes) {
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(during.viewportHeight);
  }

  await settled(page);
});

/**
 * A snapshot of a transparent element is transparent, so whatever the
 * transition put behind it shows through — the outgoing screen, which a
 * push leaves dimmed rather than gone. Inheriting the page colour from an
 * ancestor is not enough; the named element has to paint it.
 */
test("names nothing that its snapshot would leave see-through", async ({
  page,
}) => {
  await open(page);

  const during = await page.evaluate(() => window.__pressAndSample("go-down"));

  expect(during.boxes).toHaveLength(1);
  for (const box of during.boxes) {
    expect(box.backgroundAlpha).toBe(1);
  }

  await settled(page);
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
  await expect(page.locator("#page-body")).toContainText("/drive/main row");
});
