import { expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import { SCENES_FRAME_STEP } from "./fixtures/scenesSectionData";

const FIXTURE = pathToFileURL(PAGE).href;

export const CANONICAL = "#inspector-video";
export const COLLECTION = "#inspector-video-collection";
export const TILE = 'button[aria-label^="Play from"]';

export interface OpenOptions {
  /** The workbench panels that start on. */
  panels?: string[];
  /** Whether the inspector starts open, where the window has room for it. */
  inspectorOpen?: boolean;
  /** Adds the stand-in Transcript and Outline as two more panels. */
  twoMore?: boolean;
  frames?: number;
  ratio?: "16:9" | "4:3";
  vi?: "card" | "stale" | "none";
  viDelayMs?: number;
}

let navigation = 0;

/** The real file page with the real Scenes section among its panels and tabs. */
export async function openFilePage(
  page: Page,
  hash: string,
  options: OpenOptions = {},
): Promise<void> {
  const {
    panels = [],
    inspectorOpen,
    twoMore,
    frames,
    ratio,
    vi,
    viDelayMs,
  } = options;
  await page.addInitScript(
    ({ panels, inspectorOpen }) => {
      localStorage.setItem("workbench-panels", JSON.stringify(panels));
      if (inspectorOpen !== undefined) {
        localStorage.setItem("inspector-open:fixture", String(inspectorOpen));
      }
    },
    { panels, inspectorOpen },
  );
  const query = new URLSearchParams({ run: String(++navigation), scenes: "1" });
  if (twoMore) query.set("panels", "two");
  if (frames !== undefined) query.set("frames", String(frames));
  if (ratio) query.set("ratio", ratio);
  if (vi) query.set("vi", vi);
  if (viDelayMs !== undefined) query.set("vi-delay", String(viDelayMs));
  await page.goto(`${FIXTURE}?${query}${hash}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    hash.slice(1),
  );
}

export interface RowsReading {
  tiles: number;
  rows: number;
  columns: number;
  /** Top of the second row of tiles minus the top of the first. */
  step: number;
  tileHeight: number;
  /**
   * Height the scroller could still give before it overflows: its client
   * height less the content down to the bottom of the section's last part,
   * the bottom padding, border and margin of everything from there up, and
   * the scroller's own bottom padding.
   */
  slack: number;
  clientHeight: number;
  scrollHeight: number;
  /** The scroller has a classic scrollbar taking width. */
  scrollbar: number;
  /** Columns at the scroller's width without that scrollbar. */
  fullWidthColumns: number;
  lastPart: string;
  scrollerTestId: string | null;
  scrollerClass: string;
  scrollerRole: string | null;
  /** Elements inside the scroller that scroll their own content. */
  innerScrollers: string[];
  /** Frame index of each drawn tile, in order, from its "Play from" label. */
  frames: number[];
}

/**
 * The visible Scenes section, read as the browser laid it out. Throws when
 * there is no visible section or no scroller, so a case fails on the
 * precondition rather than on a number read from nothing.
 */
export async function readRows(page: Page): Promise<RowsReading> {
  return page.evaluate(
    ([tileSelector, frameStep]) => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const ruler = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="slider"][aria-label="Frame timeline"]',
        ),
      ).find(visible);
      if (!ruler) throw new Error("no visible Scenes ruler");

      let scroller: HTMLElement | null = ruler.parentElement;
      while (scroller) {
        if (
          scroller === document.documentElement ||
          scroller === document.body ||
          scroller === document.scrollingElement
        ) {
          scroller = null;
          break;
        }
        const overflowY = getComputedStyle(scroller).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") break;
        scroller = scroller.parentElement;
      }
      if (!scroller) throw new Error("the Scenes section has no scroller");

      const tiles = Array.from(
        scroller.querySelectorAll<HTMLElement>(tileSelector),
      ).filter(visible);
      if (tiles.length === 0) throw new Error("no Scenes tile is drawn");
      const tops = Array.from(
        new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))),
      ).sort((a, b) => a - b);
      const lefts = new Set(
        tiles.map((t) => Math.round(t.getBoundingClientRect().left)),
      );
      const rowTop = (row: number) =>
        Math.min(
          ...tiles
            .map((t) => t.getBoundingClientRect().top)
            .filter((top) => Math.round(top) === tops[row]),
        );
      const step = tops.length > 1 ? rowTop(1) - rowTop(0) : 0;

      const actionName =
        /^(Create scenes|Regenerate scenes|Retry the \d+ failed)$/;
      const candidates: [string, HTMLElement][] = [];
      const grid = tiles[0].parentElement as HTMLElement;
      candidates.push(["grid", grid]);
      for (const button of Array.from(
        scroller.querySelectorAll<HTMLElement>("button"),
      )) {
        const name = (button.textContent ?? "").replace(/\s+/g, " ").trim();
        if (actionName.test(name) && visible(button)) {
          let row = button.parentElement as HTMLElement;
          while (
            row.parentElement &&
            row.parentElement !== scroller &&
            !row.parentElement.contains(grid)
          ) {
            row = row.parentElement;
          }
          candidates.push(["action row", row]);
        }
      }
      const placeholder = scroller.querySelector<HTMLElement>(
        '[data-testid="scenes-visual-placeholder"]',
      );
      if (placeholder && visible(placeholder)) {
        candidates.push(["placeholder", placeholder]);
      }
      const card = Array.from(
        scroller.querySelectorAll<HTMLElement>("button.rounded-xl"),
      ).find(visible);
      if (card) candidates.push(["card", card]);
      const [lastName, last] = candidates.reduce((low, next) =>
        next[1].getBoundingClientRect().bottom >
        low[1].getBoundingClientRect().bottom
          ? next
          : low,
      );

      const px = (value: string) => Number.parseFloat(value) || 0;
      let below = 0;
      for (
        let node = last.parentElement;
        node && node !== scroller;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        below +=
          px(style.paddingBottom) +
          px(style.borderBottomWidth) +
          px(style.marginBottom);
      }
      const scrollerStyle = getComputedStyle(scroller);
      const paddingEdge =
        scroller.getBoundingClientRect().top + scroller.clientTop;
      const used =
        last.getBoundingClientRect().bottom -
        paddingEdge +
        scroller.scrollTop +
        below +
        px(scrollerStyle.paddingBottom);
      const scrollbar =
        scroller.offsetWidth -
        scroller.clientWidth -
        px(scrollerStyle.borderLeftWidth) -
        px(scrollerStyle.borderRightWidth);
      // 7rem is the section's narrowest tile and 0.5rem its column gap.
      const rem =
        Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        ) || 16;
      const columnsAt = (width: number) =>
        Math.max(3, Math.floor((width + 0.5 * rem) / (7.5 * rem)));

      return {
        tiles: tiles.length,
        rows: tops.length,
        columns: lefts.size,
        step,
        tileHeight: tiles[0].getBoundingClientRect().height,
        slack: scroller.clientHeight - used,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        scrollbar,
        fullWidthColumns: columnsAt(
          grid.getBoundingClientRect().width + scrollbar,
        ),
        lastPart: lastName,
        scrollerTestId: scroller.getAttribute("data-testid"),
        scrollerClass: String(scroller.className),
        scrollerRole: scroller.getAttribute("role"),
        innerScrollers: Array.from(scroller.querySelectorAll<HTMLElement>("*"))
          .filter((node) => {
            const style = getComputedStyle(node);
            const scrolls = (value: string) =>
              value === "auto" || value === "scroll";
            return (
              (scrolls(style.overflowY) &&
                node.scrollHeight > node.clientHeight + 1) ||
              (scrolls(style.overflowX) &&
                node.scrollWidth > node.clientWidth + 1)
            );
          })
          .map(
            (node) => `${node.tagName.toLowerCase()}.${String(node.className)}`,
          ),
        frames: tiles.map((t) => {
          const label = (t.getAttribute("aria-label") ?? "").replace(
            /^Play from /,
            "",
          );
          const seconds = label
            .split(":")
            .reduce((total, part) => total * 60 + Number(part), 0);
          return seconds / frameStep;
        }),
      };
    },
    [TILE, SCENES_FRAME_STEP] as const,
  );
}

/**
 * SPEC-ADDON-104 I1 and I2, read off the drawn section: at least 3 rows, no
 * room left for another row, and above 3 rows nothing overflows.
 */
export function expectRowsFillHeight(reading: RowsReading): void {
  const at = `${reading.rows} rows of ${reading.columns}, step ${reading.step}px`;
  expect(reading.rows, at).toBeGreaterThanOrEqual(3);
  expect(
    reading.slack,
    `${reading.slack}px left under the ${reading.lastPart} at ${at}: another row fits`,
  ).toBeLessThan(reading.step + 0.5);
  if (reading.rows > 3) {
    expect(
      reading.slack,
      `the rows overflow the scroller at ${at}`,
    ).toBeGreaterThan(-0.5);
    expect(
      reading.scrollHeight,
      `the scroller scrolls at ${at}`,
    ).toBeLessThanOrEqual(reading.clientHeight + 1);
  }
}

/** A tall host: more than 3 rows, and the rule above. */
export function expectMoreThanThreeRows(reading: RowsReading): void {
  expectRowsFillHeight(reading);
  expect(
    reading.rows,
    `${reading.slack}px left under the ${reading.lastPart} with a ${reading.step}px row step`,
  ).toBeGreaterThan(3);
}

/** Waits until two readings a frame apart agree on the rows and the tiles. */
export async function settledRows(page: Page): Promise<RowsReading> {
  await expect(page.locator(TILE).first()).toBeVisible();
  let last = "";
  let reading: RowsReading | null = null;
  await expect
    .poll(
      async () => {
        reading = await readRows(page);
        const key = `${reading.rows}x${reading.columns}:${reading.frames.join(",")}:${Math.round(reading.slack)}`;
        const same = key === last;
        last = key;
        return same;
      },
      { intervals: [150] },
    )
    .toBe(true);
  return reading!;
}

/** Rows and tiles drawn in each of the next `count` animation frames. */
export async function rowsOverFrames(
  page: Page,
  count: number,
): Promise<string[]> {
  return page.evaluate(
    ([tileSelector, frames]) =>
      new Promise<string[]>((resolve) => {
        const out: string[] = [];
        const tick = () => {
          const tiles = Array.from(
            document.querySelectorAll<HTMLElement>(tileSelector),
          ).filter((t) => t.getBoundingClientRect().height > 0);
          const rows = new Set(
            tiles.map((t) => Math.round(t.getBoundingClientRect().top)),
          ).size;
          out.push(`${rows}/${tiles.length}`);
          if (out.length >= frames) resolve(out);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [TILE, count] as const,
  );
}

declare global {
  interface Window {
    __scenesFrames: { at: number; rows: number; tiles: number }[];
    __scenesRecordFrom: number;
  }
}

/**
 * Records, from page load and in every animation frame, the rows and tiles
 * the visible Scenes grid has. Only frames that draw a tile are kept.
 */
export async function recordFramesFromLoad(page: Page): Promise<void> {
  await page.addInitScript((tileSelector) => {
    window.__scenesFrames = [];
    window.__scenesRecordFrom = 0;
    const tick = (at: number) => {
      const tiles = Array.from(
        document.querySelectorAll<HTMLElement>(tileSelector),
      ).filter((t) => t.getBoundingClientRect().height > 0);
      if (tiles.length > 0 && window.__scenesFrames.length < 5000) {
        window.__scenesFrames.push({
          at,
          rows: new Set(
            tiles.map((t) => Math.round(t.getBoundingClientRect().top)),
          ).size,
          tiles: tiles.length,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, TILE);
}

/** Drops what was recorded so far; later frames are kept. */
export async function restartRecord(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__scenesFrames = [];
  });
}

export async function recordedFrames(
  page: Page,
): Promise<{ at: number; rows: number; tiles: number }[]> {
  return page.evaluate(() => window.__scenesFrames.slice());
}

/** Moves the mouse to `fraction` of the visible ruler's width. */
export async function hoverRuler(page: Page, fraction: number): Promise<void> {
  const box = await page
    .getByRole("slider", { name: "Frame timeline" })
    .boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(
    box!.x + box!.width * fraction,
    box!.y + box!.height / 2,
  );
}

/** Gives every scroller a classic scrollbar 14px wide. */
export async function classicScrollbars(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const install = () => {
      const style = document.createElement("style");
      style.textContent =
        "*::-webkit-scrollbar { width: 14px; height: 14px; }" +
        "*::-webkit-scrollbar-thumb { background: #888; }";
      document.head.appendChild(style);
    };
    if (document.head) install();
    else document.addEventListener("DOMContentLoaded", install);
  });
}

export const FRAMES = 300;

export interface HostCase {
  name: string;
  viewport: { width: number; height: number };
  hash: string;
  options: OpenOptions;
  /** Selects the Scenes tab of the inspector instead of a panel. */
  tab?: boolean;
}

/**
 * Opens the file page with the Scenes section shown in `host` and returns
 * its reading once the Visual Index has answered and the rows have settled.
 */
export async function openHost(
  page: Page,
  host: HostCase,
): Promise<RowsReading> {
  await page.setViewportSize(host.viewport);
  await openFilePage(page, host.hash, { frames: FRAMES, ...host.options });
  if (host.tab) {
    await page.getByRole("tab", { name: "Scenes" }).click();
  }
  await expect(
    page.getByRole("slider", { name: "Frame timeline" }),
  ).toBeVisible();
  await expect(page.locator(TILE).first()).toBeVisible();
  await expect(
    page.locator('[data-testid="scenes-visual-placeholder"]'),
  ).toHaveCount(0);
  return settledRows(page);
}

export const PANEL_1600: HostCase = {
  name: "one Scenes panel at 1024×1600",
  viewport: { width: 1024, height: 1600 },
  hash: CANONICAL,
  options: { panels: ["scenes"], inspectorOpen: false },
};

export const SHORT_PANEL: HostCase = {
  name: "one Scenes panel at 1440×900",
  viewport: { width: 1440, height: 900 },
  hash: CANONICAL,
  options: { panels: ["scenes"], inspectorOpen: false },
};
