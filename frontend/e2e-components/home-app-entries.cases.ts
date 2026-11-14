/**
 * SPEC-CORE-073 I4, D3, D4: the Home entry row measured with the real stylesheet.
 * jsdom lays nothing out, so columns, heights and overflow are only real here.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const ID = "home-app-entries";

let run = 0;

interface Tile {
  text: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
  height: number;
  icon: { top: number; bottom: number; left: number; right: number } | null;
  label: { top: number; bottom: number; left: number; right: number } | null;
  pill: { top: number; bottom: number; left: number; right: number } | null;
  ariaCurrent: boolean;
}

interface Measure {
  host: { left: number; right: number; width: number };
  navScrollWidth: number;
  navClientWidth: number;
  tiles: Tile[];
}

async function open(
  page: Page,
  query: { width: number; count?: number; addons?: boolean; locale?: "en" | "ja"; long?: boolean },
): Promise<void> {
  const q = new URLSearchParams({
    run: String(++run),
    width: String(query.width),
    count: String(query.count ?? 3),
    addons: query.addons === false ? "0" : "1",
    locale: query.locale ?? "en",
    long: query.long ? "1" : "0",
  });
  await page.goto(`${FIXTURE}?${q}#${ID}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", ID);
}

function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const box = (r: DOMRect) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    const host = document.getElementById("home-app-entries-host")!;
    const nav = host.querySelector("nav")!;
    const tiles = [...nav.querySelectorAll<HTMLAnchorElement>("a")].map((a) => {
      const r = a.getBoundingClientRect();
      const svg = a.querySelector("svg");
      const pillEl = [...a.querySelectorAll<HTMLElement>("*")].find(
        (el) => el.className && typeof el.className === "string" && el.className.split(/\s+/).includes("rounded-full") && /\d/.test(el.textContent ?? ""),
      );
      const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
      let labelNode: Text | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (pillEl?.contains(n)) continue;
        if ((n.textContent ?? "").trim()) {
          labelNode = n as Text;
          break;
        }
      }
      let label = null;
      if (labelNode) {
        const range = document.createRange();
        range.selectNodeContents(labelNode);
        label = box(range.getBoundingClientRect());
      }
      return {
        text: (a.textContent ?? "").replace(/\s+/g, ""),
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        height: r.height,
        icon: svg ? box(svg.getBoundingClientRect()) : null,
        label,
        pill: pillEl ? box(pillEl.getBoundingClientRect()) : null,
        ariaCurrent: a.hasAttribute("aria-current"),
      };
    });
    const h = host.getBoundingClientRect();
    return {
      host: { left: h.left, right: h.right, width: h.width },
      navScrollWidth: nav.scrollWidth,
      navClientWidth: nav.clientWidth,
      tiles,
    };
  });
}

const rows = (tiles: Tile[]) => {
  const tops = [...new Set(tiles.map((t) => Math.round(t.top)))].sort((a, b) => a - b);
  return tops.map((top) => tiles.filter((t) => Math.round(t.top) === top));
};

function expectNoOverflow(m: Measure, label: string): void {
  expect(m.navScrollWidth, `${label}: nav scrolls sideways`).toBeLessThanOrEqual(m.navClientWidth + 0.5);
  for (const t of m.tiles) {
    expect(t.left, `${label}: ${t.text} starts left of the container`).toBeGreaterThanOrEqual(m.host.left - 0.5);
    expect(t.right, `${label}: ${t.text} ends right of the container`).toBeLessThanOrEqual(m.host.right + 0.5);
    expect(t.height, `${label}: ${t.text} height`).toBeGreaterThanOrEqual(44);
    expect(t.ariaCurrent, `${label}: ${t.text} aria-current`).toBe(false);
  }
}

function expectGrid(m: Measure, label: string): void {
  const lines = rows(m.tiles);
  expect(lines[0].length, `${label}: first line`).toBe(Math.min(4, m.tiles.length));
  const columns = new Set(m.tiles.map((t) => Math.round(t.left)));
  expect(columns.size, `${label}: columns`).toBe(Math.min(4, m.tiles.length));
  for (const line of lines.slice(1)) {
    for (const t of line) {
      expect(
        [...columns].some((c) => Math.abs(c - t.left) <= 1),
        `${label}: ${t.text} sits in one of the four columns`,
      ).toBe(true);
    }
  }
  for (const t of m.tiles) {
    expect(t.height, `${label}: ${t.text} height`).toBeGreaterThanOrEqual(72);
    expect(t.icon && t.label, `${label}: ${t.text} has an icon and a label`).toBeTruthy();
    expect(t.icon!.bottom, `${label}: ${t.text} icon above its label`).toBeLessThanOrEqual(t.label!.top + 1);
  }
}

function expectWrappingRow(m: Measure, label: string): void {
  for (const t of m.tiles) {
    expect(t.icon && t.label, `${label}: ${t.text} has an icon and a label`).toBeTruthy();
    expect(t.icon!.right, `${label}: ${t.text} icon left of its label`).toBeLessThanOrEqual(t.label!.left + 1);
    const overlap = Math.min(t.icon!.bottom, t.label!.bottom) - Math.max(t.icon!.top, t.label!.top);
    expect(overlap, `${label}: ${t.text} icon beside its label`).toBeGreaterThan(0);
  }
  for (const line of rows(m.tiles)) {
    for (let i = 1; i < line.length; i++) {
      expect(line[i].left, `${label}: ${line[i].text} follows ${line[i - 1].text}`).toBeGreaterThan(line[i - 1].right - 0.5);
    }
  }
}

function inbox(m: Measure): Tile {
  const t = m.tiles[m.tiles.length - 1];
  expect(t.text.startsWith("Inbox") || t.text.startsWith("受信箱"), "the last entry is the Inbox").toBe(true);
  return t;
}


const LONG_ADDON_LABEL = "Field notes, photos and sensor exports gathered across three years of farm trips";
const LONG_SHORTCUT_LABEL = "Lecture recordings and papers from one long running research project on soil use";
const LONG_LABELS = [LONG_SHORTCUT_LABEL, LONG_ADDON_LABEL];

interface LabelBox {
  tileWidth: number;
  rem: number;
  lineHeight: number;
  /** The label's text box clipped by every ancestor inside the tile that hides overflow. */
  visible: { width: number; height: number };
  full: { width: number; height: number };
  ellipsis: boolean;
  clamp: string;
}

/** The tile whose label is `label`, measured as it is painted. */
function measureLabel(page: Page, label: string): Promise<LabelBox | null> {
  return page.evaluate((label) => {
    const host = document.getElementById("home-app-entries-host")!;
    const a = [...host.querySelectorAll<HTMLAnchorElement>("nav a")].find((el) => (el.textContent ?? "").includes(label));
    if (!a) return null;
    const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.textContent ?? "").includes(label)) {
        node = n as Text;
        break;
      }
    }
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const full = range.getBoundingClientRect();
    let top = full.top;
    let bottom = full.bottom;
    let left = full.left;
    let right = full.right;
    let ellipsis = false;
    let clamp = "";
    for (let el: HTMLElement | null = node.parentElement; el && a.contains(el); el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.textOverflow === "ellipsis") ellipsis = true;
      const lc = cs.getPropertyValue("-webkit-line-clamp") || cs.getPropertyValue("line-clamp");
      if (lc && lc !== "none" && !clamp) clamp = lc;
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const r = el.getBoundingClientRect();
        top = Math.max(top, r.top);
        bottom = Math.min(bottom, r.bottom);
        left = Math.max(left, r.left);
        right = Math.min(right, r.right);
      }
    }
    const textEl = node.parentElement!;
    const cs = getComputedStyle(textEl);
    const lh = parseFloat(cs.lineHeight);
    return {
      tileWidth: a.getBoundingClientRect().width,
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      lineHeight: Number.isFinite(lh) ? lh : parseFloat(cs.fontSize) * 1.25,
      visible: { width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
      full: { width: full.width, height: full.height },
      ellipsis,
      clamp,
    };
  }, label);
}

async function expectFullAccessibleNames(page: Page): Promise<void> {
  for (const label of LONG_LABELS) {
    expect(label, "fixture label length").toHaveLength(80);
    await expect(page.getByRole("link", { name: label, exact: true }), `${label}: accessible name`).toHaveCount(1);
  }
}

export function phoneCases(): void {
  test.describe("SPEC-CORE-073 I4 D4 the entry row in a 358px container", () => {
    test("SPEC-CORE-073 I4 D4 seven entries make a 4 + 3 grid of tall tiles with no sideways overflow", async ({ page }) => {
      await open(page, { width: 358, count: 3 });
      const m = await measure(page);

      expect(m.tiles.map((t) => t.text)).toEqual(["Library", "Video", "Reading", "Ask", "Notes", "PhotoDiary", "Inbox3"]);
      expectNoOverflow(m, "358");
      expectGrid(m, "358");
      expect(rows(m.tiles).map((l) => l.length)).toEqual([4, 3]);
    });

    test("SPEC-CORE-073 D4 the Inbox count sits at the tile's top-right corner", async ({ page }) => {
      await open(page, { width: 358, count: 3 });
      const t = inbox(await measure(page));

      expect(t.pill, "the count is drawn").not.toBeNull();
      const midX = (t.left + t.right) / 2;
      const midY = (t.top + t.bottom) / 2;
      expect(t.pill!.left, "pill in the right half").toBeGreaterThanOrEqual(midX);
      expect(t.pill!.bottom, "pill in the top half").toBeLessThanOrEqual(midY);
      expect(t.pill!.right, "pill inside the tile").toBeLessThanOrEqual(t.right + 0.5);
      expect(t.pill!.top, "pill inside the tile").toBeGreaterThanOrEqual(t.top - 0.5);
    });

    test("SPEC-CORE-073 D6 six entries without an Inbox make a 4 + 2 grid", async ({ page }) => {
      await open(page, { width: 358, count: 0 });
      const m = await measure(page);

      expect(m.tiles.map((t) => t.text)).toEqual(["Library", "Video", "Reading", "Ask", "Notes", "PhotoDiary"]);
      expectNoOverflow(m, "358 no inbox");
      expectGrid(m, "358 no inbox");
      expect(rows(m.tiles).map((l) => l.length)).toEqual([4, 2]);
    });

    test("SPEC-CORE-073 I4 Japanese labels keep the grid in a 358px container", async ({ page }) => {
      await open(page, { width: 358, count: 120, locale: "ja" });
      const m = await measure(page);

      expect(m.tiles).toHaveLength(7);
      expectNoOverflow(m, "358 ja");
      expectGrid(m, "358 ja");
    });

    test("SPEC-CORE-073 I4 three entries fit one line of the grid", async ({ page }) => {
      await open(page, { width: 358, count: 0, addons: false });
      const m = await measure(page);

      expect(m.tiles.map((t) => t.text)).toEqual(["Library", "Video", "Reading"]);
      expectNoOverflow(m, "358 core only");
      expect(rows(m.tiles)).toHaveLength(1);
      for (const t of m.tiles) expect(t.height).toBeGreaterThanOrEqual(72);
    });
  });

  test.describe("SPEC-CORE-101 I13 80-character labels in a 358px container", () => {
    test("SPEC-CORE-101 I13 each long label wraps to at most two lines, clamped, and the grid holds", async ({ page }) => {
      await open(page, { width: 358, count: 3, long: true });
      const m = await measure(page);

      expect(m.tiles.map((t) => t.text)).toHaveLength(9);
      expect(inbox(m).text).toBe("Inbox3");
      for (const label of LONG_LABELS) {
        const box = await measureLabel(page, label);
        expect(box, `${label}: drawn`).not.toBeNull();
        expect(box!.visible.height, `${label}: at most two lines`).toBeLessThanOrEqual(2 * box!.lineHeight + 1);
        expect(box!.visible.height, `${label}: at least one line shows`).toBeGreaterThanOrEqual(box!.lineHeight - 1);
        expect(box!.clamp, `${label}: clamped to two lines`).toBe("2");
      }
      await expectFullAccessibleNames(page);
      expectNoOverflow(m, "358 long");
      expectGrid(m, "358 long");
    });
  });
}

export function desktopCases(): void {
  for (const width of [960, 1136]) {
    test(`SPEC-CORE-073 I4 D3 a ${width}px container holds the entries in one row of icon-beside-label tiles`, async ({ page }) => {
      await open(page, { width, count: 3 });
      const m = await measure(page);

      expect(m.tiles).toHaveLength(7);
      expectNoOverflow(m, String(width));
      expectWrappingRow(m, String(width));
      expect(rows(m.tiles), `${width}: one line`).toHaveLength(1);
    });

    test(`SPEC-CORE-073 D3 in a ${width}px container the Inbox count follows its label`, async ({ page }) => {
      await open(page, { width, count: 3 });
      const t = inbox(await measure(page));

      expect(t.pill, "the count is drawn").not.toBeNull();
      expect(t.pill!.left).toBeGreaterThanOrEqual(t.label!.right - 0.5);
      const overlap = Math.min(t.pill!.bottom, t.label!.bottom) - Math.max(t.pill!.top, t.label!.top);
      expect(overlap, "pill on the label's line").toBeGreaterThan(0);
    });
  }

  test("SPEC-CORE-073 I4 at 36rem (576px) the entries are wrapping tiles, not the grid", async ({ page }) => {
    await open(page, { width: 576, count: 3 });
    const m = await measure(page);

    expectNoOverflow(m, "576");
    expectWrappingRow(m, "576");
  });

  test("SPEC-CORE-073 I4 just under 36rem (575px) the entries are the 4-column grid", async ({ page }) => {
    await open(page, { width: 575, count: 3 });
    const m = await measure(page);

    expectNoOverflow(m, "575");
    expectGrid(m, "575");
  });

  test("SPEC-CORE-073 I4 a 600px container with Japanese labels and a 99+ count stays in wrapping tiles with no sideways overflow", async ({ page }) => {
    await open(page, { width: 600, count: 2140, locale: "ja" });
    const m = await measure(page);

    expectNoOverflow(m, "600 ja");
    expectWrappingRow(m, "600 ja");
  });

  test("SPEC-CORE-101 I13 in a 960px container each 80-character label is one truncated line in a tile at most 16rem wide", async ({ page }) => {
    await open(page, { width: 960, count: 3, long: true });
    const m = await measure(page);

    expect(m.tiles).toHaveLength(9);
    expect(inbox(m).text).toBe("Inbox3");
    for (const label of LONG_LABELS) {
      const box = await measureLabel(page, label);
      expect(box, `${label}: drawn`).not.toBeNull();
      expect(box!.tileWidth, `${label}: tile width`).toBeLessThanOrEqual(16 * box!.rem + 0.5);
      expect(box!.visible.height, `${label}: one line`).toBeLessThanOrEqual(box!.lineHeight + 1);
      expect(box!.full.height, `${label}: never wraps`).toBeLessThanOrEqual(box!.lineHeight + 1);
      expect(box!.full.width, `${label}: is wider than what shows`).toBeGreaterThan(box!.visible.width + 1);
      expect(box!.ellipsis, `${label}: truncated with an ellipsis`).toBe(true);
    }
    await expectFullAccessibleNames(page);
    expectNoOverflow(m, "960 long");
    expectWrappingRow(m, "960 long");
  });
}
