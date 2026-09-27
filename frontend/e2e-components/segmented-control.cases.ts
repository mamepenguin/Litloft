/**
 * Measured with the real stylesheet on a phone (coarse pointer) and on a
 * desktop (fine pointer): jsdom lays nothing out.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let navigation = 0;

async function openArrangement(page: Page, id: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", id);
}

function coarse(page: Page): Promise<boolean> {
  return page.evaluate(() => matchMedia("(pointer: coarse)").matches);
}

/** Whether a press this far outside the box's edges still lands on the button. */
function hits(page: Page, selector: string, index: number, dx: number, dy: number): Promise<boolean> {
  return page.evaluate(
    ([sel, i, x, y]) => {
      const el = document.querySelectorAll(sel)[i] as HTMLElement;
      const r = el.getBoundingClientRect();
      const points = [
        [r.left + r.width / 2, r.top - y],
        [r.left + r.width / 2, r.bottom + y],
        [r.left - x, r.top + r.height / 2],
        [r.right + x, r.top + r.height / 2],
      ];
      return points.every(([px, py]) => document.elementFromPoint(px, py)?.closest("button") === el);
    },
    [selector, index, dx, dy] as const,
  );
}

export function segmentedControlCases(): void {
  for (const locale of ["ja", "en"] as const) {
    for (const width of [320, 375]) {
      test(`the text settings panel (${locale}, ${width}px): segments fit, sized for the pointer, selected by border`, async ({
        page,
      }) => {
        await openArrangement(page, `typography-panel-${locale}`, width);
        const isCoarse = await coarse(page);
        const m = await page.evaluate(() => {
          const tokenRgb = (name: string) => {
            const probe = document.createElement("span");
            probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            document.body.append(probe);
            const rgb = getComputedStyle(probe).color;
            probe.remove();
            return rgb;
          };
          const accentRgb = tokenRgb("--accent");
          const segments = [...document.querySelectorAll('[role="group"] button')].map((el) => {
            const cs = getComputedStyle(el);
            const label = el.querySelector("span")!;
            return {
              pressed: el.getAttribute("aria-pressed") === "true",
              height: el.getBoundingClientRect().height,
              borderColor: cs.borderTopColor,
              borderWidth: cs.borderTopWidth,
              background: cs.backgroundColor,
              fits: label.scrollWidth <= label.clientWidth,
            };
          });
          const textPrimary = tokenRgb("--text-primary");
          const dots = [...document.querySelectorAll('[data-testid="epub-size-step"]')].map(
            (el) => getComputedStyle(el).backgroundColor,
          );
          const panel = document.querySelector('[data-testid="epub-typography-panel"]')!.getBoundingClientRect();
          return { accentRgb, segments, dots, textPrimary, panelHeight: panel.height, panelRight: panel.right };
        });

        test.info().annotations.push({ type: "panel height", description: `${m.panelHeight}px` });
        expect(m.panelRight).toBeLessThanOrEqual(width);
        expect(m.segments).toHaveLength(9);
        for (const s of m.segments) {
          expect(s.fits).toBe(true);
          expect(s.height).toBe(isCoarse ? 44 : 32);
          expect(s.background).toBe("rgba(0, 0, 0, 0)");
          expect(s.borderWidth).toBe("1px");
          expect(s.borderColor).toBe(s.pressed ? m.accentRgb : "rgba(0, 0, 0, 0)");
        }
        expect(m.segments.filter((s) => s.pressed)).toHaveLength(3);
        expect(m.dots).toHaveLength(7);
        expect(m.dots.filter((c) => c === m.textPrimary)).toHaveLength(1);

        const sizeButtons = 'button[aria-label="Smaller text"], button[aria-label="Larger text"], button[aria-label="文字を小さく"], button[aria-label="文字を大きく"]';
        expect(await page.locator(sizeButtons).count()).toBe(2);
        for (const i of [0, 1]) {
          const box = await page.locator(sizeButtons).nth(i).boundingBox();
          expect(box!.width).toBe(32);
          expect(await hits(page, sizeButtons, i, 5, 5)).toBe(isCoarse);
        }

        const smaller = page.locator(sizeButtons).first();
        while (await smaller.isEnabled()) await smaller.click();
        expect(await smaller.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
      });
    }
  }

  test("the Markdown view toggle in the file header: wide enough to press, and the row keeps its height", async ({
    page,
  }) => {
    await openArrangement(page, "file-detail-chrome-note", 390);
    const isCoarse = await coarse(page);
    const segments = page.locator('[data-testid^="view-mode-"]');
    expect(await segments.count()).toBe(2);
    for (const i of [0, 1]) {
      const box = await segments.nth(i).boundingBox();
      expect(box!.width).toBe(isCoarse ? 44 : 32);
      expect(box!.height).toBe(32);
      // The row centres the group on a half pixel, and the overhang's lower
      // edge snaps to the pixel above.
      expect(await hits(page, '[data-testid^="view-mode-"]', i, -2, 4)).toBe(isCoarse);
    }
    const row = await page.locator("[data-testid='file-detail-chrome']").boundingBox();
    expect(row!.height).toBe(48);
  });
}
