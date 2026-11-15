/**
 * Boxes of the Target menu's rows and of Manage…'s checklist rows, drawn by the real Video
 * page with two collections and two Smart Collections, one of each with a long name.
 */

import { expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

export const LONG_COLLECTION_NAME = "Every lecture we filmed at the community hall in the autumn of 2021";
export const LONG_FOLDER_NAME = "Every holiday film we recorded in the summer of 2019";

export const LISTED: readonly { name: string; kind: "collection" | "smart" }[] = [
  { name: "Bedside", kind: "collection" },
  { name: LONG_FOLDER_NAME, kind: "smart" },
  { name: LONG_COLLECTION_NAME, kind: "collection" },
  { name: "Holiday 25", kind: "smart" },
];

let navigation = 0;

export async function openVideoWithBothKinds(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  const q = new URLSearchParams({ run: String(++navigation), page: "video", targets: "both" });
  await page.goto(`${FIXTURE}?${q}#app-header`);
  await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
  await expect(page.locator("header h1")).toBeVisible();
}

export function targetButton(page: Page) {
  return page.locator("header").getByRole("button", { name: /^Target: / });
}

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

export type RowMetrics = {
  name: string;
  kind: "collection" | "smart" | "none";
  row: Box;
  icon: Box | null;
  iconColour: string | null;
  /** The first line box of the row's name. */
  firstLine: Box;
  /** The centre of the row's checkbox, for a Manage… row. */
  checkboxCentre: number | null;
  /** The row's checkbox, for a Manage… row. */
  checkbox: Box | null;
};

export type RowsSnapshot = {
  viewport: number;
  scrollWidth: number;
  muted: string;
  rows: RowMetrics[];
};

/** `menu` reads the open Target menu's radio rows; `manage` reads Manage…'s checklist. */
export async function measureRows(page: Page, where: "menu" | "manage"): Promise<RowsSnapshot> {
  // The surface scales in as it opens, and a box measured mid-animation is
  // smaller than the one it settles at.
  await page
    .locator(where === "menu" ? '[role="menu"]' : '[role="dialog"]')
    .evaluate(async (surface) => {
      await Promise.all(
        surface.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
  return page.evaluate((where) => {
    const box = (r: DOMRect) => ({
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    });
    const firstText = (root: Element): Text | null => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => ((n.textContent ?? "").trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
      });
      return walker.nextNode() as Text | null;
    };
    const rowOf = (el: Element): Element => {
      if (where === "menu") return el;
      let node: Element | null = el.parentElement;
      while (node && !(node.textContent ?? "").trim()) node = node.parentElement;
      return node ?? el;
    };
    const selector = where === "menu" ? '[role="menuitemradio"]' : 'input[type="checkbox"], [role="checkbox"]';
    const rows = Array.from(document.querySelectorAll(selector)).map((el) => {
      const row = rowOf(el);
      const text = firstText(row);
      const range = document.createRange();
      if (text) range.selectNodeContents(text);
      const line = text ? range.getClientRects()[0] : row.getBoundingClientRect();
      const icon = row.querySelector("svg.lucide-library, svg.lucide-list-filter");
      const kind = !icon ? "none" : icon.classList.contains("lucide-library") ? "collection" : "smart";
      const cb = where === "manage" ? el.getBoundingClientRect() : null;
      return {
        name: (text?.textContent ?? "").trim(),
        kind,
        row: box(row.getBoundingClientRect()),
        icon: icon ? box(icon.getBoundingClientRect()) : null,
        iconColour: icon ? getComputedStyle(icon).color : null,
        firstLine: box(line),
        checkboxCentre: cb ? cb.left + cb.width / 2 : null,
        checkbox: cb ? box(cb) : null,
      };
    });
    return {
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      muted: getComputedStyle(document.getElementById("probe-muted")!).color,
      rows,
    };
  }, where) as Promise<RowsSnapshot>;
}

/** Every listed row carries its kind's 14px muted icon, on the name's first line, before the name. */
export function expectIconRows(m: RowsSnapshot, after: (row: RowMetrics) => number): void {
  expect(m.scrollWidth).toBeLessThanOrEqual(m.viewport);
  for (const { name, kind } of LISTED) {
    const row = m.rows.find((r) => r.name === name);
    expect(row, name).toBeDefined();
    expect(row!.kind, name).toBe(kind);
    const icon = row!.icon!;
    expect(icon.width, name).toBeCloseTo(14, 0);
    expect(icon.height, name).toBeCloseTo(14, 0);
    expect(row!.iconColour, name).toBe(m.muted);
    expect(icon.right, name).toBeLessThanOrEqual(row!.firstLine.left + 0.5);
    expect(icon.left, name).toBeGreaterThanOrEqual(after(row!) - 0.5);
    const centre = (icon.top + icon.bottom) / 2;
    expect(centre, name).toBeGreaterThanOrEqual(row!.firstLine.top);
    expect(centre, name).toBeLessThanOrEqual(row!.firstLine.bottom);
    expect(row!.row.right, name).toBeLessThanOrEqual(m.viewport + 0.5);
  }
}
