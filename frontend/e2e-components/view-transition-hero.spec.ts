/**
 * Opening a file grows the pressed card's picture into the box the file is
 * shown in. What a browser is needed for: that exactly one element carries
 * the hero name, that it is opaque and inside the window, and that the two
 * snapshots are told to re-crop the picture rather than stretch it.
 *
 * Going the other way is not built: the card the picture would return to
 * has to be named in the arriving listing, which nothing here does.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const AT_REST = ["root"];
const DURING = ["file-hero", "listing", "root"];

interface Hero {
  kind: string | null;
  names: string[];
  groups: string[];
  heroes: number;
  box: { width: number; height: number; alpha: number } | null;
  fit: {
    oldFit: string;
    newFit: string;
    oldOpacity: string;
    newOpacity: string;
    oldBlend: string;
    groupMs: string;
  };
  /** The screen being opened onto, which must not arrive from nothing. */
  destination: { opacity: string; animation: string };
  viewport: { width: number; height: number };
}

declare global {
  interface Window {
    __hero: () => Hero;
    __pressHero: (id: string) => Promise<Hero>;
  }
}

const INSTALL = () => {
  window.__hero = () => {
    const named = Array.from(document.querySelectorAll("*"))
      .map((el) => ({ el, name: getComputedStyle(el).viewTransitionName }))
      .filter(({ name }) => name && name !== "none")
      .filter(({ el }) => el !== document.documentElement);
    const hero = named.find(({ name }) => name === "file-hero")?.el ?? null;
    const alphaOf = (el: Element) => {
      const rgb = /^rgba?\(([^)]*)\)$/.exec(getComputedStyle(el).backgroundColor);
      if (!rgb) return Number.NaN;
      const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
      return parts.length === 3 ? 1 : parts.length === 4 ? Number(parts[3]) : Number.NaN;
    };
    const read = (p: string) => getComputedStyle(document.documentElement, p);
    return {
      kind: document.documentElement.dataset.vt ?? null,
      names: [
        ...named.map(({ name }) => name),
        getComputedStyle(document.documentElement).viewTransitionName,
      ].sort(),
      groups: [
        ...new Set(
          document
            .getAnimations()
            .map((a) => String((a.effect as KeyframeEffect)?.pseudoElement ?? ""))
            .filter((p) => p.startsWith("::view-transition-group("))
            .map((p) => p.slice("::view-transition-group(".length, -1)),
        ),
      ].sort(),
      heroes: named.filter(({ name }) => name === "file-hero").length,
      box: hero
        ? {
            width: Math.round(hero.getBoundingClientRect().width),
            height: Math.round(hero.getBoundingClientRect().height),
            alpha: alphaOf(hero),
          }
        : null,
      fit: {
        oldFit: read("::view-transition-old(file-hero)").objectFit,
        newFit: read("::view-transition-new(file-hero)").objectFit,
        oldOpacity: read("::view-transition-old(file-hero)").opacity,
        newOpacity: read("::view-transition-new(file-hero)").opacity,
        oldBlend: read("::view-transition-old(file-hero)").mixBlendMode,
        groupMs: read("::view-transition-group(file-hero)").animationDuration,
      },
      destination: {
        opacity: read("::view-transition-new(listing)").opacity,
        animation: read("::view-transition-new(listing)").animationName,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  };

  window.__pressHero = async (id: string) => {
    document.getElementById(id)!.click();
    for (let frame = 0; frame < 120; frame++) {
      const seen = window.__hero();
      if (seen.groups.length > 0) return seen;
      await new Promise(requestAnimationFrame);
    }
    return window.__hero();
  };
};

let run = 0;

async function open(page: Page): Promise<void> {
  await page.addInitScript(INSTALL);
  await page.goto(`${FIXTURE}?run=${++run}#file-open`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "file-open",
  );
}

const settled = (page: Page) =>
  expect
    .poll(async () => (await page.evaluate(() => window.__hero())).kind, {
      timeout: 4000,
    })
    .toBe(null);

test("carries the hero on one element at each end, and lets go of it", async ({
  page,
}) => {
  await open(page);

  const before = await page.evaluate(() => window.__hero());
  expect(before.names).toEqual(AT_REST);
  expect(before.heroes).toBe(0);

  const during = await page.evaluate(() => window.__pressHero("open-file"));

  expect(during.kind).toBe("file-open");
  expect(during.names).toEqual(DURING);
  expect(during.heroes).toBe(1);
  expect(during.groups).toEqual(DURING);

  await settled(page);

  const after = await page.evaluate(() => window.__hero());
  expect(after.names).toEqual(AT_REST);
  expect(after.heroes).toBe(0);
  expect(after.kind).toBe(null);
});

test("re-crops the picture instead of stretching it between two shapes", async ({
  page,
}) => {
  await open(page);

  const opening = await page.evaluate(() => window.__pressHero("open-file"));

  // `cover` is what re-crops; `fill`, the browser's default for this pair,
  // is what stretches. And the pair must not cross-fade: the two snapshots
  // are the same picture, so summing them with `plus-lighter` washes the
  // box out to white instead of reconstructing it.
  expect(opening.fit).toEqual({
    oldFit: "cover",
    newFit: "cover",
    oldOpacity: "0",
    newOpacity: "1",
    oldBlend: "normal",
    groupMs: "0.2s",
  });

  await settled(page);
});

test("shows the file it is opening at once, and flies only the picture", async ({
  page,
}) => {
  await open(page);

  const during = await page.evaluate(() => window.__pressHero("open-file"));

  // Anything less and the first frames show the picture in mid-air over a
  // screen that is still fading in — the chrome above it arrives late.
  expect(during.destination).toEqual({ opacity: "1", animation: "none" });

  await settled(page);
});

test("names a hero that is opaque and inside the window", async ({ page }) => {
  await open(page);

  const during = await page.evaluate(() => window.__pressHero("open-file"));

  expect(during.box).not.toBe(null);
  expect(during.box!.alpha).toBe(1);
  expect(during.box!.width).toBeLessThanOrEqual(during.viewport.width);
  expect(during.box!.height).toBeLessThanOrEqual(during.viewport.height);

  await settled(page);
});
