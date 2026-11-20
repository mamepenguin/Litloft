import { expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

export const CANONICAL = "#inspector-video";
export const COLLECTION = "#inspector-video-collection";
export const BOUNDED = "#scenes-bounded-1024";
export const BOUNDED_SHORT = "#scenes-bounded-short";
export const TILE = 'button[aria-label^="Play from"]';
export const CHIP = "Back to current position";
export const FRAMES = 300;
/** The file page's frames are 12 s apart; the bounded fixture's 30 s. */
export const PAGE_STEP = 12;
export const BOUNDED_STEP = 30;
/** The full scene card's minimum height, 7.6rem at 16px. */
export const FULL_CARD_MIN = 7.6 * 16;

export interface OpenOptions {
  panels?: string[];
  inspectorOpen?: boolean;
  frames?: number;
  ratio?: "16:9" | "4:3";
  vi?: "card" | "stale" | "none";
}

let navigation = 0;

/** The real file page with the real Scenes section among its panels and tabs. */
export async function openFilePage(
  page: Page,
  hash: string,
  options: OpenOptions = {},
): Promise<void> {
  const { panels = [], inspectorOpen, frames = FRAMES, ratio, vi } = options;
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
  query.set("frames", String(frames));
  if (ratio) query.set("ratio", ratio);
  if (vi) query.set("vi", vi);
  await page.goto(`${FIXTURE}?${query}${hash}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    hash.slice(1),
  );
}

export async function openBounded(
  page: Page,
  { hash = BOUNDED, start = 0 }: { hash?: string; start?: number } = {},
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}&t=${start}${hash}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    hash.slice(1),
  );
  await expect(page.locator(TILE).first()).toBeVisible();
}

export interface HostCase {
  name: string;
  viewport: { width: number; height: number };
  hash: string;
  options: OpenOptions;
  tab?: boolean;
}

export async function openHost(page: Page, host: HostCase): Promise<ListReading> {
  await page.setViewportSize(host.viewport);
  await openFilePage(page, host.hash, host.options);
  if (host.tab) await page.getByRole("tab", { name: "Scenes" }).click();
  await expect(page.getByRole("slider", { name: "Frame timeline" })).toBeVisible();
  await expect(page.locator(TILE).first()).toBeVisible();
  await expect(
    page.locator('[data-testid="scenes-visual-placeholder"]'),
  ).toHaveCount(0);
  return settled(page);
}

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
}

export interface ListReading {
  form: "bounded" | "flow";
  tiles: number;
  columns: number;
  /** Top of the second row minus the top of the first. */
  step: number;
  tileHeight: number;
  /** The tiles' nearest ancestor that scrolls vertically, else null. */
  list: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
    clientWidth: number;
    scrollWidth: number;
    overflowY: string;
    overflowX: string;
    gutter: string;
  } | null;
  /** The section's host: the workbench body, the tab panel or the marked scroller. */
  host: {
    kind: string;
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
    box: Box;
  };
  /** In flow form, the marked scroller's `--inspector-sticky-top` in px. */
  stickyTop: number;
  visibleArea: { top: number; bottom: number };
  /** Frame index of each row's first tile with at least half its height in view. */
  visibleRows: number[];
  /** Rows whose whole tile height is in view. */
  whollyVisibleRows: number[];
  /** Frame index of the first tile of each row, by row. */
  rowFirstFrame: number[];
  ruler: Box;
  rulerMax: number;
  rulerNow: number;
  card: Box | null;
  cardText: string;
  action: Box | null;
  chip: Box | null;
  band: { left: number; right: number } | null;
  sectionScrollWidth: number;
  sectionClientWidth: number;
  lastTile: Box;
}

/**
 * The visible Scenes section as the browser laid it out. Throws when there is
 * no visible ruler or tile, so a case fails on the precondition.
 */
export async function readList(page: Page, step = PAGE_STEP): Promise<ListReading> {
  return page.evaluate(
    ([tileSelector, frameStep, chipName]) => {
      const boxOf = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height,
          width: r.width,
        };
      };
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
      let section: HTMLElement | null = ruler.parentElement;
      while (section && !section.querySelector(tileSelector)) {
        section = section.parentElement;
      }
      if (!section) throw new Error("no tile is drawn");
      const tiles = Array.from(section.querySelectorAll<HTMLElement>(tileSelector));
      const frameOf = (tile: HTMLElement) => {
        const label = (tile.getAttribute("aria-label") ?? "").replace(/^Play from /, "");
        const seconds = label
          .split(":")
          .reduce((total, part) => total * 60 + Number(part), 0);
        return Math.round(seconds / frameStep);
      };

      const scrolls = (value: string) => value === "auto" || value === "scroll";
      let listEl: HTMLElement | null = tiles[0].parentElement;
      while (listEl && listEl !== section.parentElement) {
        if (scrolls(getComputedStyle(listEl).overflowY)) break;
        listEl = listEl.parentElement;
      }
      if (listEl === section.parentElement) listEl = null;

      const shared = ruler.closest<HTMLElement>("[data-inspector-scroller]");
      const form = shared ? "flow" : "bounded";
      const hostEl =
        shared ??
        ruler.closest<HTMLElement>(".media-detail-workbench-body") ??
        ruler.closest<HTMLElement>('[role="tabpanel"]') ??
        (document.getElementById("scenes-host") as HTMLElement);
      const hostKind = shared
        ? "shared"
        : hostEl.classList.contains("media-detail-workbench-body")
          ? "workbench"
          : hostEl.getAttribute("role") === "tabpanel"
            ? "tabpanel"
            : "fixture";

      const stickyOf = (el: HTMLElement) => {
        for (let node: HTMLElement | null = el; node && node !== section; node = node.parentElement) {
          if (getComputedStyle(node).position === "sticky") return node;
        }
        return null;
      };
      const card =
        Array.from(section.querySelectorAll<HTMLElement>("button")).find(
          (button) =>
            visible(button) &&
            !button.matches(tileSelector) &&
            /harbour|Two people/.test(button.getAttribute("aria-label") ?? button.textContent ?? ""),
        ) ?? null;
      const action =
        Array.from(section.querySelectorAll<HTMLElement>("button")).find(
          (button) =>
            /^(Create scenes|Regenerate scenes|Retry the \d+ failed)$/.test(
              (button.textContent ?? "").replace(/\s+/g, " ").trim(),
            ),
        ) ?? null;
      const chip =
        Array.from(section.querySelectorAll<HTMLElement>("button")).find(
          (button) =>
            visible(button) &&
            ((button.getAttribute("aria-label") ?? button.textContent ?? "").trim() === chipName),
        ) ?? null;

      const stickyTop = shared
        ? Number.parseFloat(
            getComputedStyle(section).getPropertyValue("--inspector-sticky-top"),
          ) || 0
        : 0;
      let visibleArea: { top: number; bottom: number };
      if (form === "bounded") {
        const el = listEl ?? hostEl;
        const r = el.getBoundingClientRect();
        visibleArea = {
          top: r.top + el.clientTop,
          bottom: r.top + el.clientTop + el.clientHeight,
        };
      } else {
        const r = shared!.getBoundingClientRect();
        const pinnedRuler = stickyOf(ruler);
        const pinnedCard = card ? stickyOf(card) : null;
        visibleArea = {
          top:
            r.top +
            shared!.clientTop +
            stickyTop +
            (pinnedRuler ? pinnedRuler.getBoundingClientRect().height : 0),
          bottom: pinnedCard
            ? pinnedCard.getBoundingClientRect().top
            : r.top + shared!.clientTop + shared!.clientHeight,
        };
      }

      const tops = Array.from(
        new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))),
      ).sort((a, b) => a - b);
      const lefts = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left)));
      const columns = lefts.size;
      const step = tops.length > 1 ? tops[1] - tops[0] : 0;
      const rowFirstFrame: number[] = [];
      const visibleRows: number[] = [];
      const whollyVisibleRows: number[] = [];
      for (let index = 0; index < tiles.length; index += columns) {
        const row = index / columns;
        rowFirstFrame.push(frameOf(tiles[index]));
        const r = tiles[index].getBoundingClientRect();
        const inside =
          Math.min(r.bottom, visibleArea.bottom) - Math.max(r.top, visibleArea.top);
        if (inside >= r.height / 2 - 0.5) visibleRows.push(row);
        if (r.top >= visibleArea.top - 0.5 && r.bottom <= visibleArea.bottom + 0.5) {
          whollyVisibleRows.push(row);
        }
      }

      const bandEl = Array.from(ruler.querySelectorAll<HTMLElement>("*")).find(
        (node) => node.style.left.endsWith("%") && node.style.width.endsWith("%"),
      );
      const band = bandEl
        ? {
            left: Number.parseFloat(bandEl.style.left),
            right:
              Number.parseFloat(bandEl.style.left) +
              Number.parseFloat(bandEl.style.width),
          }
        : null;

      return {
        form,
        tiles: tiles.length,
        columns,
        step,
        tileHeight: tiles[0].getBoundingClientRect().height,
        list: listEl
          ? {
              clientHeight: listEl.clientHeight,
              scrollHeight: listEl.scrollHeight,
              scrollTop: listEl.scrollTop,
              clientWidth: listEl.clientWidth,
              scrollWidth: listEl.scrollWidth,
              overflowY: getComputedStyle(listEl).overflowY,
              overflowX: getComputedStyle(listEl).overflowX,
              gutter: getComputedStyle(listEl).scrollbarGutter,
            }
          : null,
        host: {
          kind: hostKind,
          clientHeight: hostEl.clientHeight,
          scrollHeight: hostEl.scrollHeight,
          scrollTop: hostEl.scrollTop,
          box: boxOf(hostEl),
        },
        stickyTop,
        visibleArea,
        visibleRows,
        whollyVisibleRows,
        rowFirstFrame,
        ruler: boxOf(ruler),
        rulerMax: Number(ruler.getAttribute("aria-valuemax")),
        rulerNow: Number(ruler.getAttribute("aria-valuenow")),
        card: card ? boxOf(card) : null,
        cardText: card ? (card.textContent ?? "").replace(/\s+/g, " ").trim() : "",
        action: action ? boxOf(action) : null,
        chip: chip ? boxOf(chip) : null,
        band,
        sectionScrollWidth: section.scrollWidth,
        sectionClientWidth: section.clientWidth,
        lastTile: boxOf(tiles[tiles.length - 1]),
      };
    },
    [TILE, step, CHIP] as const,
  );
}

/** Waits until two readings a frame apart agree. */
export async function settled(page: Page, step = PAGE_STEP): Promise<ListReading> {
  await expect(page.locator(TILE).first()).toBeVisible();
  let last = "";
  let reading: ListReading | null = null;
  await expect
    .poll(
      async () => {
        reading = await readList(page, step);
        const key = JSON.stringify([
          reading.tiles,
          reading.columns,
          reading.visibleRows,
          reading.list?.scrollTop,
          reading.host.scrollTop,
          Math.round(reading.card?.height ?? 0),
        ]);
        const same = key === last;
        last = key;
        return same;
      },
      { intervals: [150] },
    )
    .toBe(true);
  return reading!;
}

/**
 * A reader's scroll of the element that scrolls the list: a wheel lands on
 * it, then it moves to `top`. Setting `scrollTop` alone would be a scroll
 * the section could take for its own.
 */
export async function scrollListTo(page: Page, top: number): Promise<void> {
  await page.evaluate(
    ([tileSelector, value]) => {
      const tile = document.querySelector<HTMLElement>(tileSelector)!;
      for (let node = tile.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight
        ) {
          node.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              deltaY: value - node.scrollTop,
            }),
          );
          node.scrollTop = value;
          return;
        }
      }
      throw new Error("nothing scrolls the list");
    },
    [TILE, top] as const,
  );
}

/** A reader's mouse wheel over the given point. */
export async function wheelAt(
  page: Page,
  point: { x: number; y: number },
  deltaY: number,
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, deltaY);
}

/** Each animation frame's tile count and list position, from page load on. */
export async function recordFramesFromLoad(page: Page): Promise<void> {
  await page.addInitScript((tileSelector) => {
    const w = window as unknown as {
      __scrollFrames: { tiles: number; firstVisible: string }[];
    };
    w.__scrollFrames = [];
    const tick = () => {
      const tiles = Array.from(
        document.querySelectorAll<HTMLElement>(tileSelector),
      ).filter((t) => t.getBoundingClientRect().height > 0);
      if (tiles.length > 0 && w.__scrollFrames.length < 5000) {
        let scroller: HTMLElement | null = tiles[0].parentElement;
        while (scroller) {
          const style = getComputedStyle(scroller);
          if (
            (style.overflowY === "auto" || style.overflowY === "scroll") &&
            scroller.scrollHeight > scroller.clientHeight
          ) {
            break;
          }
          scroller = scroller.parentElement;
        }
        const top = scroller ? scroller.getBoundingClientRect().top : 0;
        const first = tiles.find((t) => t.getBoundingClientRect().bottom > top + 1);
        w.__scrollFrames.push({
          tiles: tiles.length,
          firstVisible: first?.getAttribute("aria-label") ?? "",
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, TILE);
}

export async function restartRecord(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __scrollFrames: unknown[] }).__scrollFrames = [];
  });
}

export async function recordedFrames(
  page: Page,
): Promise<{ tiles: number; firstVisible: string }[]> {
  return page.evaluate(() =>
    (window as unknown as { __scrollFrames: { tiles: number; firstVisible: string }[] })
      .__scrollFrames.slice(),
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

/** Columns and the list's position in each of the next `count` frames. */
export async function overFrames(page: Page, count: number): Promise<string[]> {
  return page.evaluate(
    ([tileSelector, frames]) =>
      new Promise<string[]>((resolve) => {
        const out: string[] = [];
        const tick = () => {
          const tiles = Array.from(
            document.querySelectorAll<HTMLElement>(tileSelector),
          ).filter((t) => t.getBoundingClientRect().height > 0);
          const columns = new Set(
            tiles.map((t) => Math.round(t.getBoundingClientRect().left)),
          ).size;
          out.push(`${columns}/${Math.round(tiles[0]?.getBoundingClientRect().top ?? 0)}`);
          if (out.length >= frames) resolve(out);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [TILE, count] as const,
  );
}

/**
 * I1: the host does not scroll unless its content box is shorter than the
 * fixed parts and one row; then the list keeps one row step.
 */
export function expectOnlyTheListScrolls(reading: ListReading, at: string): void {
  expect(reading.form, at).toBe("bounded");
  expect(reading.list, `${at}: the list is not a scroll container`).not.toBeNull();
  expect(reading.list!.overflowY, at).toMatch(/auto|scroll/);
  expect(reading.list!.gutter, at).toContain("stable");
  expect(reading.list!.scrollWidth, `${at}: the list scrolls sideways`).toBeLessThanOrEqual(
    reading.list!.clientWidth + 1,
  );
  expect(reading.list!.clientHeight, `${at}: the list is shorter than one row`).toBeGreaterThanOrEqual(
    reading.step - 1,
  );
  const hostScrolls = reading.host.scrollHeight > reading.host.clientHeight + 1;
  if (hostScrolls) {
    expect(
      reading.list!.clientHeight,
      `${at}: the ${reading.host.kind} scrolls while the list has more than one row`,
    ).toBeLessThan(reading.step + 1);
  }
}

/** I2: the row holding `frame` is wholly visible and, unless clamped, second. */
export function expectPlaced(reading: ListReading, frame: number, at: string): void {
  const row = Math.floor(frame / reading.columns);
  expect(reading.whollyVisibleRows, `${at}: row ${row} wholly visible`).toContain(row);
  const lastRow = reading.rowFirstFrame.length - 1;
  const clampedAtEnd = reading.visibleRows.includes(lastRow);
  if (row === 0) expect(reading.visibleRows[0], at).toBe(0);
  else if (!clampedAtEnd) expect(reading.visibleRows[0], `${at}: the row before it is first`).toBe(row - 1);
}
