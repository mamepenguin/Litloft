/**
 * The Quick Note footer holds three labelled buttons. At a narrow width the
 * row wraps rather than squeezing a button below its label.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const WIDTHS = [320, 390, 768] as const;

const LABELS = {
  ja: ["保存して開く", "キャンセル", "保存"],
  en: ["Save and open", "Cancel", "Save"],
} as const;

let navigation = 0;

for (const locale of ["ja", "en"] as const) {
  for (const width of WIDTHS) {
    test(`${locale} at ${width}px: every footer button keeps its label on one line inside the panel`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      const arrangement = `quick-note-footer-${locale}`;
      await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
      await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const measured = await dialog.evaluate((root, labels) => {
        const panel = root.getBoundingClientRect();
        const buttons = labels.map((label) => {
          const button = [...root.querySelectorAll("button")].find(
            (b) => b.textContent?.trim() === label,
          );
          if (!button) return { label, found: false };
          const textRange = document.createRange();
          const textNode = [...button.childNodes].find(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
          );
          if (textNode) textRange.selectNodeContents(textNode);
          const textLines = textNode
            ? new Set([...textRange.getClientRects()].map((r) => Math.round(r.top))).size
            : 0;
          const box = button.getBoundingClientRect();
          return {
            label,
            found: true,
            textLines,
            clipped: button.scrollWidth > button.clientWidth,
            insidePanel: box.left >= panel.left - 0.5 && box.right <= panel.right + 0.5,
          };
        });
        return { innerWidth: window.innerWidth, buttons };
      }, [...LABELS[locale]]);

      expect(measured.innerWidth).toBe(width);
      for (const button of measured.buttons) {
        expect(button, button.label).toMatchObject({
          found: true,
          textLines: 1,
          clipped: false,
          insidePanel: true,
        });
      }
    });
  }
}
