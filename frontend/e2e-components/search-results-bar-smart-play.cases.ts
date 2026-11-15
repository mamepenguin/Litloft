/**
 * SPEC-CORE-109 I11: the results bar with 再生 on a Smart Collection's own
 * search page, laid out by the real stylesheet. Both arrangements show a
 * Smart Collection whose saved query equals the page's, in the Files view,
 * with video among the loaded rows: one saved with operators only, one with
 * free text (so the Files / Passages switch and Scene search are drawn).
 */

import { expect, type Page } from "@playwright/test";

import { ARRANGEMENT, measure, open, type Box, type Measured } from "./search-results-bar.cases";

export const SMART_PLAY = {
  operator: "search-results-bar-smart-play-operator",
  text: "search-results-bar-smart-play-text",
} as const;

/** The plain arrangement whose bar a Smart Collection's bar matches below `md`. */
export const PLAIN_COUNTERPART: Record<string, string> = {
  [SMART_PLAY.operator]: ARRANGEMENT.filesOperator,
  [SMART_PLAY.text]: ARRANGEMENT.files,
};

export interface PlayMeasured extends Measured {
  plays: Box[];
}

export async function openSmartPlay(page: Page, id: string, width: number): Promise<void> {
  await open(page, id, width);
}

export async function measureWithPlay(page: Page): Promise<PlayMeasured> {
  const base = await measure(page);
  const plays = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    };
    const name = (el: Element) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
    return [...document.querySelectorAll("button")]
      .filter((b) => name(b) === "Play" && visible(b))
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
      });
  });
  return { ...base, plays };
}

export function controlCounts(m: Measured) {
  return {
    switches: m.switches.length,
    checkboxes: m.checkboxes.length,
    counts: m.counts.length,
    views: m.views.length,
    sorts: m.sorts.length,
    mores: m.mores.length,
  };
}

export async function firstMenuRow(page: Page): Promise<string> {
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const first = menu.getByRole("menuitem").first();
  return ((await first.getAttribute("aria-label")) ?? (await first.textContent()) ?? "").trim();
}
