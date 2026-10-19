/**
 * The scoped search modal adds a chip to the input row and key hints and a
 * see-all link to the footer. Neither row may push anything out of the panel
 * or break a label over two lines.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

const WIDTHS = [320, 390, 768] as const;

const COPY = {
  ja: {
    chip: "ノート",
    query: "レビューの頼み方と観点のメモと過去のラウンドの記録をまとめたもの",
    hints: ["選ぶ", "開く", "範囲を外す"],
  },
  en: {
    chip: "Notes",
    query: "review checklist and notes from every past round of the redesign",
    hints: ["Select", "Open", "Remove scope"],
  },
} as const;

let navigation = 0;

for (const locale of ["ja", "en"] as const) {
  for (const width of WIDTHS) {
    test(`${locale} at ${width}px: the chip, the hints and the see-all link stay on one line inside the panel`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      const arrangement = `scoped-search-${locale}`;
      await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
      await expect(page.locator("body")).toHaveAttribute("data-arrangement", arrangement);

      const input = page.getByRole("textbox");
      await expect(input).toBeVisible();
      await input.fill(COPY[locale].query);
      const link = page.getByRole("link");
      await expect(link).toBeVisible();

      const measured = await page.evaluate(
        ({ chip, hints }) => {
          const field = document.querySelector("input")!;
          const panel = field.closest(".bg-bg-primary")!.getBoundingClientRect();
          const inside = (el: Element) => {
            const box = el.getBoundingClientRect();
            return box.left >= panel.left - 0.5 && box.right <= panel.right + 0.5;
          };
          // The element's own text only: a control beside the text (the
          // chip's remove button grows to 44px on a touch screen) is not a
          // second line of it.
          const lines = (el: Element) => {
            const tops = [...el.childNodes]
              .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
              .flatMap((n) => {
                const range = document.createRange();
                range.selectNodeContents(n);
                return [...range.getClientRects()].map((r) => Math.round(r.top));
              });
            return new Set(tops).size;
          };
          const textElement = (text: string) =>
            [...document.querySelectorAll("span")].find(
              (el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent === text),
            );

          const chipEl = textElement(chip);
          const remover = chipEl?.querySelector("button");
          const linkEl = document.querySelector("a")!;
          const hintEls = hints.map(textElement);
          const hintBoxes = hintEls.filter(Boolean).map((el) => el!.getBoundingClientRect());
          const linkBox = linkEl.getBoundingClientRect();
          return {
            innerWidth: window.innerWidth,
            desktop: hintEls.every(Boolean),
            chip: chipEl ? { lines: lines(chipEl), inside: inside(chipEl) } : null,
            remover: remover ? inside(remover) : false,
            field: { inside: inside(field), width: field.getBoundingClientRect().width },
            link: { inside: inside(linkEl) && inside(linkEl.querySelector("span")!), lines: lines(linkEl.querySelector("span")!) },
            hints: hintEls.map((el) => (el ? { lines: lines(el), inside: inside(el) } : null)),
            hintsClearOfLink: hintBoxes.every((box) => box.right <= linkBox.left + 0.5),
          };
        },
        { chip: COPY[locale].chip, hints: [...COPY[locale].hints] },
      );

      expect(measured.innerWidth).toBe(width);
      expect(measured.chip).toEqual({ lines: 1, inside: true });
      expect(measured.remover).toBe(true);
      expect(measured.field.inside).toBe(true);
      expect(measured.field.width).toBeGreaterThan(80);
      expect(measured.link).toEqual({ inside: true, lines: 1 });
      // The desktop modal starts at 640px; below it the full-screen sheet has no keyboard hints.
      expect(measured.desktop).toBe(width >= 640);
      if (measured.desktop) {
        for (const hint of measured.hints) expect(hint).toEqual({ lines: 1, inside: true });
        expect(measured.hintsClearOfLink).toBe(true);
      }
    });
  }
}
