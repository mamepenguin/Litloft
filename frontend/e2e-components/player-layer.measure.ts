/**
 * Shared measurements for the file page's player drawn by a layer
 * (SPEC-CORE-194). The slot is what the file page draws in the player's place;
 * the layer's frame is the element positioned over it that holds the player.
 */

import { expect, type Page } from "@playwright/test";

import { FIXTURE_URL } from "./fixtureOrigin";

export const SLOT = "[data-player-slot]";
export const LAYER = "[data-player-layer]";

export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/** The precondition every case rests on: one player, rendered by the layer and not inside the slot. */
export async function expectServedByLayer(page: Page): Promise<void> {
  await expect(page.locator(SLOT), "the file page draws one slot").toHaveCount(1);
  await expect(page.locator(LAYER), "one layer frame holds the player").toHaveCount(1);
  const placement = await page.evaluate(
    ({ slot, layer }) => {
      const players = [...document.querySelectorAll("video, iframe")].filter(
        (el) => el.closest(layer) !== null || el.closest(slot) !== null || el.closest(".media-detail-player") !== null,
      );
      const s = document.querySelector(slot);
      const l = document.querySelector(layer);
      return {
        players: players.length,
        inLayer: players.filter((el) => l?.contains(el)).length,
        inSlot: players.filter((el) => s?.contains(el)).length,
        layerInsideSlot: !!s && !!l && s.contains(l),
        layerInsideFilePage: !!l?.closest(".media-detail-player"),
      };
    },
    { slot: SLOT, layer: LAYER },
  );
  expect(placement).toEqual({
    players: 1,
    inLayer: 1,
    inSlot: 0,
    layerInsideSlot: false,
    layerInsideFilePage: false,
  });
}

export function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

export const frames = (page: Page, n = 2): Promise<void> =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );

/** Waits until the slot's box holds still for two frames, then two more frames. */
export async function settle(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const before = await rectOf(page, SLOT);
      await frames(page, 2);
      const after = await rectOf(page, SLOT);
      return JSON.stringify(before) === JSON.stringify(after);
    })
    .toBe(true);
  await frames(page, 2);
}

/** The part of the slot not cut off by a clipping ancestor or the viewport. */
export function slotVisibleArea(page: Page): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let left = Math.max(r.left, 0);
    let top = Math.max(r.top, 0);
    let right = Math.min(r.right, window.innerWidth);
    let bottom = Math.min(r.bottom, window.innerHeight);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const b = p.getBoundingClientRect();
      left = Math.max(left, b.left);
      top = Math.max(top, b.top);
      right = Math.min(right, b.right);
      bottom = Math.min(bottom, b.bottom);
    }
    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }, SLOT);
}

/**
 * Probes a grid over the viewport and returns the points where the layer is
 * the topmost element although the point is outside the slot's visible area.
 */
export function layerPaintedOutside(page: Page, area: Rect | null): Promise<[number, number][]> {
  return page.evaluate(
    ({ layer, area }) => {
      const l = document.querySelector(layer);
      if (!l) return [];
      const out: [number, number][] = [];
      const step = 12;
      for (let x = 1; x < window.innerWidth; x += step) {
        for (let y = 1; y < window.innerHeight; y += step) {
          const inside =
            !!area &&
            area.width > 0 &&
            area.height > 0 &&
            x >= area.left - 1 &&
            x <= area.right + 1 &&
            y >= area.top - 1 &&
            y <= area.bottom + 1;
          if (inside) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && l.contains(hit)) out.push([x, y]);
        }
      }
      return out;
    },
    { layer: LAYER, area },
  );
}

/** I2: the layer's frame is on the slot within 1px and paints nothing outside its visible area. */
export async function expectLayerOnSlot(page: Page, label: string): Promise<void> {
  await settle(page);
  const slot = await rectOf(page, SLOT);
  const layer = await rectOf(page, LAYER);
  expect(slot, `${label}: slot`).not.toBeNull();
  expect(layer, `${label}: layer`).not.toBeNull();
  for (const key of ["left", "top", "width", "height"] as const) {
    expect(Math.abs(layer![key] - slot![key]), `${label}: ${key}`).toBeLessThanOrEqual(1);
  }
  const area = await slotVisibleArea(page);
  expect(await layerPaintedOutside(page, area), `${label}: painted outside the slot's visible area`).toEqual([]);
}

/**
 * Records, on every frame from the document's start, the slot's and the
 * layer's boxes as they stand once the frame's resize observers have run: a
 * fresh observer per frame is delivered after every observer made earlier.
 */
export function recordFrames(page: Page): Promise<void> {
  return page.addInitScript(
    ({ slot, layer }) => {
      type R = { l: number; t: number; w: number; h: number };
      const log: { slot: R | null; layer: R | null; at: number }[] = [];
      (window as unknown as { __layerFrames: typeof log }).__layerFrames = log;
      const read = (sel: string): R | null => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: r.left, t: r.top, w: r.width, h: r.height };
      };
      const tick = () => {
        const ro = new ResizeObserver(() => {
          ro.disconnect();
          log.push({ slot: read(slot), layer: read(layer), at: performance.now() });
        });
        ro.observe(document.documentElement);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { slot: SLOT, layer: LAYER },
  );
}

export const clearFrames = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __layerFrames: unknown[] }).__layerFrames.length = 0;
  });

/** Frames since the last clear where the slot had a box and the layer was not on it within 1px. */
export function mismatchedFrames(page: Page) {
  return page.evaluate(() => {
    const log = (
      window as unknown as {
        __layerFrames: {
          slot: { l: number; t: number; w: number; h: number } | null;
          layer: { l: number; t: number; w: number; h: number } | null;
        }[];
      }
    ).__layerFrames;
    return log
      .map((f, i) => ({ i, ...f }))
      .filter((f) => f.slot && f.slot.w > 0 && f.slot.h > 0)
      .filter(
        (f) =>
          !f.layer ||
          Math.abs(f.layer.l - f.slot!.l) > 1 ||
          Math.abs(f.layer.t - f.slot!.t) > 1 ||
          Math.abs(f.layer.w - f.slot!.w) > 1 ||
          Math.abs(f.layer.h - f.slot!.h) > 1,
      );
  });
}

export const frameCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __layerFrames: unknown[] }).__layerFrames.length);

/** Tags the current player element so a later read can tell whether it is the same one. */
export const markPlayer = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector("video") as (HTMLVideoElement & { __mark?: number }) | null;
    if (v) v.__mark = 194;
  });

export const playerState = (page: Page) =>
  page.evaluate(() => {
    const all = document.querySelectorAll("video");
    const v = all[0] as (HTMLVideoElement & { __mark?: number }) | undefined;
    return {
      count: all.length,
      same: v?.__mark === 194,
      playing: v ? !v.paused : false,
      time: v ? v.currentTime : NaN,
    };
  });

export async function play(page: Page): Promise<void> {
  await page.locator("video").evaluate(async (element) => {
    const video = element as HTMLVideoElement;
    video.muted = true;
    video.loop = true;
    await video.play();
  });
  await expect
    .poll(() => page.locator("video").evaluate((el) => !(el as HTMLVideoElement).paused))
    .toBe(true);
}

/** Records every fetch and beacon, with its method, through whatever the fixture installs later. */
export function recordRequests(page: Page): Promise<void> {
  return page.addInitScript(() => {
    const log: { method: string; url: string }[] = [];
    (window as unknown as { __requests: typeof log }).__requests = log;
    let depth = 0;
    const wrap = (inner: typeof fetch): typeof fetch =>
      ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (depth === 0) log.push({ method, url });
        depth += 1;
        try {
          return inner(input, init);
        } finally {
          depth -= 1;
        }
      }) as typeof fetch;
    let current = window.fetch.bind(window);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => wrap(current),
      set: (value: typeof fetch) => {
        current = value;
      },
    });
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon) {
      navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
        log.push({ method: "BEACON", url: String(url) });
        return beacon(url, data);
      };
    }
  });
}

export const requests = (page: Page) =>
  page.evaluate(() => (window as unknown as { __requests: { method: string; url: string }[] }).__requests.slice());

/** Page content arriving late below the player, tall enough for the canvas to scroll. */
export const addFiller = (page: Page, height = 1600) =>
  page.evaluate((h) => {
    const host = document.querySelector(".media-detail-host");
    if (!host || host.querySelector("[data-test-filler]")) return;
    const filler = document.createElement("div");
    filler.setAttribute("data-test-filler", "");
    filler.style.height = `${h}px`;
    filler.textContent = "Filler";
    host.appendChild(filler);
  }, height);

export const inPseudoFullscreen = (page: Page) =>
  page.evaluate((layer) => {
    const l = document.querySelector(layer);
    return !!l && (l.matches("[data-pseudo-fullscreen]") || !!l.querySelector("[data-pseudo-fullscreen]"));
  }, LAYER);

/**
 * At the centre of each overlap of the player with an element matching
 * `over`, whether the topmost element belongs to an overlay (the matched
 * element's nearest fixed ancestor, which holds it and its backdrop) and
 * whether it belongs to the layer.
 */
export const coveredBy = (page: Page, over: string) =>
  page.evaluate(
    ({ over, layer }) => {
      const frame = document.querySelector(layer)!;
      const l = (
        frame.matches("[data-pseudo-fullscreen]")
          ? frame
          : (frame.querySelector("[data-pseudo-fullscreen]") ?? frame)
      ).getBoundingClientRect();
      const matched = [...document.querySelectorAll(over)].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const roots = matched.map((el) => {
        for (let p: Element | null = el; p; p = p.parentElement) {
          if (getComputedStyle(p).position === "fixed") return p;
        }
        return el;
      });
      const hits: { overlay: boolean; layer: boolean }[] = [];
      for (const el of matched) {
        const r = el.getBoundingClientRect();
        const left = Math.max(l.left, r.left);
        const right = Math.min(l.right, r.right);
        const top = Math.max(l.top, r.top);
        const bottom = Math.min(l.bottom, r.bottom);
        if (right - left < 2 || bottom - top < 2) continue;
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        hits.push({ overlay: !!hit && roots.some((root) => root.contains(hit)), layer: !!hit?.closest(layer) });
      }
      return {
        overlap: hits.length > 0,
        over: hits.length > 0 && hits.every((h) => h.overlay),
        layer: hits.some((h) => h.layer),
      };
    },
    { over, layer: LAYER },
  );

let navigation = 0;

export interface OpenOptions {
  width?: number;
  height?: number;
  storage?: Record<string, string>;
}

/** The real `AppShell` around the video's file page, on the served fixture origin. */
export async function openFilePage(page: Page, options: OpenOptions = {}): Promise<void> {
  const { width = 1280, height = 800, storage = { "workbench-panels": "[]" } } = options;
  await page.addInitScript(
    ({ seed }) => {
      if (!sessionStorage.getItem("__seeded")) {
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
        sessionStorage.setItem("__seeded", "1");
      }
    },
    { seed: storage },
  );
  await page.setViewportSize({ width, height });
  const params = new URLSearchParams({ run: String(++navigation), query: "file=video0000001" });
  await page.goto(`${FIXTURE_URL}?${params}#focus-drive`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(page.locator("video")).toHaveCount(1);
  await expectServedByLayer(page);
}

/** The canonical file page with its workbench (one transcript panel stored), the inspector open. */
export async function openWorkbench(
  page: Page,
  size: { width: number; height: number },
  storage: Record<string, string> = {},
): Promise<void> {
  await page.addInitScript((seed) => {
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.setItem("workbench-panels", JSON.stringify(["transcript"]));
      localStorage.setItem("inspector-open:fixture", "true");
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
      sessionStorage.setItem("__seeded", "1");
    }
  }, storage);
  await page.setViewportSize(size);
  const query = new URLSearchParams({ run: String(++navigation), panels: "one" });
  await page.goto(`${FIXTURE_URL}?${query}#inspector-video`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "inspector-video");
  await expect(page.getByRole("group", { name: "Panels" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expectServedByLayer(page);
}
