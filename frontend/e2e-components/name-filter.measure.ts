/**
 * SPEC-CORE-156 SPEC-ADDON-159: what the name-field specs measure, shared by the phone and
 * desktop specs.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

export const FIXTURE = pathToFileURL(PAGE).href;

/** Forty characters, the name I8 measures with. */
export const NAME_40 = "Autumn leaves in Kyoto, the whole trip!!";

export const LABELS = {
  en: { field: "Filter by name", discover: "Discover", library: "Library", home: "Home", sort: /^Sort/, tag: /^Tag/, group: /^Group By/ },
  ja: { field: "名前で絞り込み", discover: "発見", library: "ライブラリ", home: "ホーム", sort: /^並び順/, tag: /^タグ/, group: /^分類/ },
} as const;

export type Locale = keyof typeof LABELS;

export async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

export async function noSidewaysScroll(page: Page) {
  const o = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(o.scrollWidth, "the page does not scroll sideways").toBeLessThanOrEqual(o.clientWidth);
}

let navigation = 0;

export async function openApp(page: Page, app: "video" | "reading", locale: Locale) {
  const q = new URLSearchParams({ run: String(++navigation), page: app, face: "library", locale });
  await page.goto(`${FIXTURE}?${q}#app-header`);
  await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
}

export async function openSeeAll(page: Page, app: "video" | "reading", locale: Locale) {
  const q = new URLSearchParams({ run: String(++navigation), page: `${app}-shelf`, locale });
  await page.goto(`${FIXTURE}?${q}#app-header`);
  await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
}

export async function openClips(page: Page, locale: Locale, clipsQuery: string) {
  const q = new URLSearchParams({ run: String(++navigation), locale, q: clipsQuery });
  await page.goto(`${FIXTURE}?${q}#clips-page`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "clips-page");
}

export const fieldIcon = (page: Page, locale: Locale) => page.getByRole("button", { name: LABELS[locale].field, exact: true });
export const fieldInput = (page: Page, locale: Locale) => page.getByRole("searchbox", { name: LABELS[locale].field });

/** The tab-row tabs of Video and Reading. */
export const appTabs = (page: Page, locale: Locale) => [
  page.getByRole("tab", { name: LABELS[locale].discover }),
  page.getByRole("tab", { name: LABELS[locale].library }),
];

/** The tab-row links of Clips. */
export const clipsTabs = (page: Page, locale: Locale) => [
  page.getByRole("link", { name: LABELS[locale].home, exact: true }),
  page.getByRole("link", { name: LABELS[locale].library, exact: true }),
];

export async function widths(tabs: Locator[]) {
  return Promise.all(tabs.map(async (t) => (await box(t)).width));
}

/** The field's own box: the nearest ancestor of the input that draws a border. */
export async function fieldBox(page: Page, locale: Locale) {
  const input = fieldInput(page, locale);
  await expect(input).toBeVisible();
  return input.evaluate((el) => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node && parseFloat(getComputedStyle(node).borderTopWidth) === 0) node = node.parentElement;
    const target = node ?? (el as HTMLElement);
    const r = target.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, borderColor: getComputedStyle(target).borderTopColor };
  });
}
