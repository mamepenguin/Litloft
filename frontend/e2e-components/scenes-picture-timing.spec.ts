/**
 * SPEC-ADDON-155 §10 in Chromium: the real Scenes section, scrolled by script
 * after opening, judged from what the page itself observed.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { BOUNDED, BOUNDED_STEP, TILE, openBounded, settled } from "./scenes-scroll-list.cases";

const FIXTURE = pathToFileURL(PAGE).href;
const FLOW = "#scenes-flow";
const D = 200;

let navigation = 0;

interface Observed {
  /** Frame time → `performance.now()` of the first `src` it was given. */
  asked: Record<string, number>;
  /** Each scroll event of the scroller with the near tiles at that event. */
  readings: { at: number; near: number[] }[];
  start: number;
  stop: number;
  nearAtStart: number[];
  nearAtStop: number[];
}

/** Records, from page load, when each tile's picture is first given a `src`. */
async function recordAsked(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __asked: Record<string, number> };
    store.__asked = {};
    const remember = (img: Element) => {
      const match = /[?&]t=(\d+(?:\.\d+)?)/.exec(img.getAttribute("src") ?? "");
      if (match && store.__asked[match[1]] === undefined) {
        store.__asked[match[1]] = performance.now();
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target instanceof HTMLImageElement) remember(record.target);
          continue;
        }
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node instanceof HTMLImageElement) remember(node);
          node.querySelectorAll("img").forEach(remember);
        });
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  });
}

/**
 * Installs the near rule of SPEC-ADDON-155 Terms in the page, against the
 * visible area of SPEC-ADDON-152 Terms, and starts recording each scroll event.
 */
async function startReadings(page: Page): Promise<void> {
  await page.evaluate((tileSelector) => {
    const tiles = () =>
      Array.from(document.querySelectorAll<HTMLElement>(tileSelector)).filter(
        (el) => el.getBoundingClientRect().height > 0,
      );
    const timeOf = (el: HTMLElement) =>
      (el.getAttribute("aria-label") ?? "")
        .replace(/^Play from /, "")
        .split(":")
        .reduce((total, part) => total * 60 + Number(part), 0);
    const scrolls = (el: HTMLElement) => {
      const style = getComputedStyle(el);
      return (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight;
    };
    const ruler = document.querySelector<HTMLElement>(
      '[role="slider"][aria-label="Frame timeline"]',
    )!;
    const shared = ruler.closest<HTMLElement>("[data-inspector-scroller]");
    let scroller: HTMLElement | null = shared;
    if (!scroller) {
      for (let node = tiles()[0].parentElement; node; node = node.parentElement) {
        if (scrolls(node)) {
          scroller = node;
          break;
        }
      }
    }
    if (!scroller) throw new Error("nothing scrolls the list");
    let section: HTMLElement | null = ruler.parentElement;
    while (section && !section.querySelector(tileSelector)) section = section.parentElement;

    const stickyOf = (el: HTMLElement) => {
      for (let node: HTMLElement | null = el; node && node !== section; node = node.parentElement) {
        if (getComputedStyle(node).position === "sticky") return node;
      }
      return null;
    };
    const visibleArea = () => {
      const box = scroller!.getBoundingClientRect();
      const top = box.top + scroller!.clientTop;
      const bottom = top + scroller!.clientHeight;
      if (!shared) return { top, bottom };
      const stickyTop =
        Number.parseFloat(getComputedStyle(section!).getPropertyValue("--inspector-sticky-top")) || 0;
      const pinnedRuler = stickyOf(ruler);
      const card = Array.from(section!.querySelectorAll<HTMLElement>("button")).find(
        (button) =>
          !button.matches(tileSelector) &&
          button.getBoundingClientRect().height > 0 &&
          /harbour|Two people/.test(button.getAttribute("aria-label") ?? button.textContent ?? ""),
      );
      const pinnedCard = card ? stickyOf(card) : null;
      return {
        top: top + stickyTop + (pinnedRuler ? pinnedRuler.getBoundingClientRect().height : 0),
        bottom: pinnedCard ? pinnedCard.getBoundingClientRect().top : bottom,
      };
    };
    const near = (): number[] => {
      const all = tiles();
      const columns = new Set(all.map((t) => Math.round(t.getBoundingClientRect().left))).size;
      const area = visibleArea();
      const visible: number[] = [];
      for (let index = 0; index < all.length; index += columns) {
        const r = all[index].getBoundingClientRect();
        const inside = Math.min(r.bottom, area.bottom) - Math.max(r.top, area.top);
        if (inside >= r.height / 2 - 0.5) visible.push(index / columns);
      }
      if (visible.length === 0) return [];
      const first = Math.max(0, visible[0] - 1);
      const last = visible[visible.length - 1] + 1;
      return all
        .filter((_, index) => {
          const row = Math.floor(index / columns);
          return row >= first && row <= last;
        })
        .map(timeOf);
    };

    const store = window as unknown as {
      __readings: { at: number; near: number[] }[];
      __near: () => number[];
      __areaHeight: () => number;
      __scroller: HTMLElement;
    };
    store.__readings = [];
    store.__near = near;
    store.__areaHeight = () => {
      const area = visibleArea();
      return area.bottom - area.top;
    };
    store.__scroller = scroller;
    document.addEventListener(
      "scroll",
      (event) => {
        if (event.target === scroller) {
          store.__readings.push({ at: performance.now(), near: near() });
        }
      },
      true,
    );
  }, TILE);
}

async function observe(page: Page, kind: "slow" | "fast"): Promise<Observed> {
  await startReadings(page);
  const run = await page.evaluate(async (mode) => {
    const store = window as unknown as {
      __near: () => number[];
      __areaHeight: () => number;
      __scroller: HTMLElement;
    };
    const el = store.__scroller;
    const nearAtStart = store.__near();
    const start = performance.now();
    if (mode === "slow") {
      await new Promise<void>((resolve) => {
        const step = () => {
          if (performance.now() - start >= 2000) {
            resolve();
            return;
          }
          el.scrollTop += 4;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    } else {
      const height = store.__areaHeight();
      await new Promise<void>((resolve) => {
        const step = () => {
          const max = el.scrollHeight - el.clientHeight;
          if (el.scrollTop >= max - 1) {
            resolve();
            return;
          }
          el.scrollTop = Math.min(max, el.scrollTop + height);
          setTimeout(step, 50);
        };
        step();
      });
    }
    const stop = performance.now();
    return { start, stop, nearAtStart, nearAtStop: store.__near() };
  }, kind);
  await page.waitForTimeout(D + 300 + 200);
  const recorded = await page.evaluate(() => {
    const store = window as unknown as {
      __asked: Record<string, number>;
      __readings: { at: number; near: number[] }[];
    };
    return { asked: { ...store.__asked }, readings: store.__readings.slice() };
  });
  return { ...run, ...recorded };
}

/** Each run of consecutive readings a tile was near in, as [from, to). */
function nearRuns(observed: Observed, time: number): [number, number][] {
  const runs: [number, number][] = [];
  let from: number | null = null;
  for (const reading of observed.readings) {
    if (reading.at > observed.stop) break;
    const isNear = reading.near.includes(time);
    if (isNear && from === null) from = reading.at;
    if (!isNear && from !== null) {
      runs.push([from, reading.at]);
      from = null;
    }
  }
  if (from !== null) runs.push([from, observed.stop]);
  return runs;
}

function everNear(observed: Observed): number[] {
  return Array.from(
    new Set(observed.readings.filter((r) => r.at <= observed.stop).flatMap((r) => r.near)),
  );
}

function expectSlow(observed: Observed): void {
  expect(observed.readings.length, "no scroll event was observed").toBeGreaterThan(10);
  const dwelt = everNear(observed).filter((time) =>
    nearRuns(observed, time).some(([from, to]) => to - from >= D + 100),
  );
  const fresh = dwelt.filter(
    (time) => !(observed.asked[time] !== undefined && observed.asked[time] < observed.start),
  );
  expect(fresh.length, "no tile came near during the scroll and stayed D + 100 ms").toBeGreaterThan(0);

  const late = fresh
    .filter((time) => !(observed.asked[time] !== undefined && observed.asked[time] <= observed.stop))
    .map((time) => ({
      time,
      near: nearRuns(observed, time).map(([from, to]) => Math.round(to - from)),
      askedAfterStop:
        observed.asked[time] === undefined
          ? null
          : Math.round(observed.asked[time] - observed.stop),
    }));
  expect(late, "tiles near ≥ D + 100 ms not asked for before the scroll stopped").toEqual([]);
}

function expectFast(observed: Observed): void {
  expect(observed.readings.length, "no scroll event was observed").toBeGreaterThan(3);
  const crossing = everNear(observed).filter(
    (time) => !observed.nearAtStart.includes(time) && !observed.nearAtStop.includes(time),
  );
  const brief = crossing.filter((time) => {
    const total = nearRuns(observed, time).reduce((sum, [from, to]) => sum + to - from, 0);
    return total < D - 50;
  });
  expect(brief.length, "no tile only crossed the near zone").toBeGreaterThan(0);
  expect(
    brief.filter((time) => observed.asked[time] !== undefined),
    "tiles that crossed in under D − 50 ms and were asked for",
  ).toEqual([]);

  expect(observed.nearAtStop.length).toBeGreaterThan(0);
  const slowAtStop = observed.nearAtStop
    .filter(
      (time) =>
        observed.asked[time] === undefined || observed.asked[time] > observed.stop + D + 300,
    )
    .map((time) => ({
      time,
      askedAfterStop:
        observed.asked[time] === undefined
          ? null
          : Math.round(observed.asked[time] - observed.stop),
    }));
  expect(slowAtStop, "tiles near at the stop not asked for within D + 300 ms").toEqual([]);
}

async function openBoundedFixture(page: Page): Promise<void> {
  await recordAsked(page);
  await openBounded(page, { hash: BOUNDED });
  await settled(page, BOUNDED_STEP);
}

async function openFlowFixture(page: Page): Promise<void> {
  await recordAsked(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}${FLOW}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", FLOW.slice(1));
  await expect(page.locator(TILE).first()).toBeVisible();
  const reading = await settled(page, BOUNDED_STEP);
  expect(reading.form).toBe("flow");
}

for (const [name, openFixture] of [
  ["the bounded fixture", openBoundedFixture],
  ["the flow fixture", openFlowFixture],
] as const) {
  test(`SPEC-ADDON-155 §10 — ${name}: in a slow scroll every tile near for D + 100 ms is asked for before the scroll stops`, async ({
    page,
  }) => {
    await openFixture(page);
    expectSlow(await observe(page, "slow"));
  });

  test(`SPEC-ADDON-155 §10 — ${name}: in a fast scroll no tile crossing in under D − 50 ms is asked for, and the tiles near at the stop are within D + 300 ms`, async ({
    page,
  }) => {
    await openFixture(page);
    expectFast(await observe(page, "fast"));
  });
}
