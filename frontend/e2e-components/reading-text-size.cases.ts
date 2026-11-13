/**
 * Text read for its content, measured on the real components with the real
 * stylesheet under `lang="ja"`. jsdom computes no cascade, so the sizes are
 * read from a laid-out page.
 *
 * Elements are found by the text the fixture feeds them, never by class, so
 * a case reads what the reader sees whichever element carries the style.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { test, expect, type Page } from "@playwright/test";

import { PAGE } from "./build-bundle";
import { READING } from "./readingTextSize.data";

const FIXTURE = pathToFileURL(PAGE).href;

const EN = JSON.parse(
  readFileSync(resolve(__dirname, "..", "src", "messages-core", "en.json"), "utf8"),
) as { search: { matchClip: string; passageScreenText: string } };

let navigation = 0;

async function open(page: Page, id: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", id);
  await page.evaluate(() => {
    document.documentElement.lang = "ja";
  });
}

interface Computed {
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  color: string;
  height: number;
}

interface Probes {
  primary: string;
  muted: string;
  highlight: string;
}

async function probes(page: Page): Promise<Probes> {
  return page.evaluate(() => {
    const read = (name: string) =>
      getComputedStyle(document.querySelector(`[data-probe="${name}"]`)!);
    return {
      primary: read("primary").color,
      muted: read("muted").color,
      highlight: read("highlight").backgroundColor,
    };
  });
}

/**
 * The innermost non-field element whose whole text is `text`. Waits for it,
 * since most surfaces fill in after a request.
 */
async function textStyle(page: Page, text: string): Promise<Computed> {
  const handle = await page.waitForFunction(
    (wanted) => {
      const all = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter(
        (el) =>
          !["TEXTAREA", "INPUT", "SCRIPT", "STYLE"].includes(el.tagName) &&
          (el.textContent ?? "").trim() === wanted,
      );
      const innermost = all.filter(
        (el) => !all.some((other) => other !== el && el.contains(other)),
      );
      const el = innermost[0];
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        fontWeight: s.fontWeight,
        color: s.color,
        height: el.getBoundingClientRect().height,
      };
    },
    text,
    { timeout: 10_000 },
  );
  return (await handle.jsonValue()) as Computed;
}

/** A textarea or input, found by its current value or its accessible label. */
async function fieldStyle(
  page: Page,
  by: { value?: string; label?: string; within?: string },
): Promise<Computed> {
  const handle = await page.waitForFunction(
    ({ value, label, within }) => {
      const root = within ? document.querySelector(within) : document;
      if (!root) return null;
      const fields = Array.from(
        root.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea, input"),
      );
      const el = fields.find(
        (f) =>
          (value === undefined || f.value === value) &&
          (label === undefined || f.getAttribute("aria-label") === label ||
            f.getAttribute("placeholder") === label),
      );
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        fontWeight: s.fontWeight,
        color: s.color,
        height: el.getBoundingClientRect().height,
      };
    },
    by,
    { timeout: 10_000 },
  );
  return (await handle.jsonValue()) as Computed;
}

function expectReadText(c: Computed, p: Probes): void {
  expect.soft(c.fontSize).toBe("16px");
  expect.soft(c.lineHeight).toBe("26px");
  expect.soft(c.color).toBe(p.primary);
}

export function readingTextSizeCases(width: number): void {
  test.describe(`reading text size at ${width}px`, () => {
    test(`SPEC-CORE-096 I1: a passage row's excerpt is 16px / 26px primary, its locator and file name 12px`, async ({
      page,
    }) => {
      await open(page, "reading-passages", width);
      const p = await probes(page);

      expectReadText(await textStyle(page, READING.passagePlain), p);
      expectReadText(await textStyle(page, READING.passageKeyword), p);
      expectReadText(await textStyle(page, READING.passageScreenText), p);

      const locator = await textStyle(page, READING.passageSectionTitle);
      expect.soft(locator.fontSize).toBe("12px");
      expect.soft(locator.fontWeight).toBe("600");
      const filename = await textStyle(page, READING.passageFilename);
      expect.soft(filename.fontSize).toBe("12px");
      expect.soft(filename.color).toBe(p.muted);
      const kind = await textStyle(page, EN.search.passageScreenText);
      expect.soft(kind.fontSize).toBe("11px");
      expect.soft(kind.color).toBe(p.muted);
    });

    test(`SPEC-CORE-096 I1: an image-query document row's excerpt is 16px / 26px primary, its locator and file name 12px`, async ({
      page,
    }) => {
      await open(page, "reading-image-query", width);
      const p = await probes(page);

      expectReadText(await textStyle(page, READING.imageDocExcerpt), p);
      expect.soft((await textStyle(page, READING.imageDocSectionTitle)).fontSize).toBe("12px");
      expect.soft((await textStyle(page, READING.imageDocFilename)).fontSize).toBe("12px");
    });

    test(`SPEC-CORE-096 I2: a scene match with no text keeps its label at 13px muted`, async ({
      page,
    }) => {
      await open(page, "reading-passages", width);
      const p = await probes(page);
      const label = await textStyle(page, EN.search.matchClip);
      expect.soft(label.fontSize).toBe("13px");
      expect.soft(label.color).toBe(p.muted);
    });

    test(`SPEC-CORE-096 I3: only the matched terms of a keyword passage are marked, and a passage that is not a keyword match has none`, async ({
      page,
    }) => {
      await open(page, "reading-passages", width);
      const p = await probes(page);
      await textStyle(page, READING.passageKeyword);

      const marks = await page.evaluate(
        ({ keyword, plain }) => {
          const excerpt = (text: string) => {
            const all = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter(
              (el) => (el.textContent ?? "").trim() === text,
            );
            return all.find((el) => !all.some((o) => o !== el && el.contains(o)))!;
          };
          const marked = Array.from(excerpt(keyword).querySelectorAll("mark"));
          return {
            keyword: marked.map((m) => ({
              text: m.textContent,
              background: getComputedStyle(m).backgroundColor,
            })),
            plain: excerpt(plain).querySelectorAll("mark").length,
          };
        },
        { keyword: READING.passageKeyword, plain: READING.passagePlain },
      );

      const occurrences = READING.passageKeyword.split(READING.passageKeywordTerm).length - 1;
      expect.soft(marks.keyword).toHaveLength(occurrences);
      for (const mark of marks.keyword) {
        expect.soft(mark.text).toBe(READING.passageKeywordTerm);
        expect.soft(mark.background).toBe(p.highlight);
      }
      expect.soft(marks.plain).toBe(0);
    });

    test(`SPEC-CORE-096 I4: a comment body is 16px / 26px, and the new and edit comment fields are 16px / 24px`, async ({
      page,
    }) => {
      await open(page, "reading-comments", width);
      await page.getByRole("button", { name: /Comments/ }).click();

      const body = await textStyle(page, READING.comment);
      expect.soft(body.fontSize).toBe("16px");
      expect.soft(body.lineHeight).toBe("26px");

      const field = await fieldStyle(page, { label: "Write a comment..." });
      expect.soft(field.fontSize).toBe("16px");
      expect.soft(field.lineHeight).toBe("24px");

      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const edit = await fieldStyle(page, { value: READING.comment });
      expect.soft(edit.fontSize).toBe("16px");
      expect.soft(edit.lineHeight).toBe("24px");
    });

    test(`SPEC-CORE-096 I5: a file description is 16px / 26px primary and its field is 16px`, async ({
      page,
    }) => {
      await open(page, "reading-file-description", width);
      const p = await probes(page);

      const collapsed = await textStyle(page, READING.fileDescription);
      expectReadText(collapsed, p);

      const field = await fieldStyle(page, { value: READING.fileDescriptionDraft });
      expect.soft(field.fontSize).toBe("16px");
    });

    test(`SPEC-CORE-096 I5: a file description stays clamped to three lines before it is expanded`, async ({
      page,
    }) => {
      await open(page, "reading-file-description", width);
      const collapsed = await textStyle(page, READING.fileDescription);
      const line = parseFloat(collapsed.lineHeight);
      expect.soft(Math.abs(collapsed.height - 3 * line)).toBeLessThanOrEqual(1);
      await page.getByRole("button", { name: "Show more" }).click();
      const expanded = await textStyle(page, READING.fileDescription);
      expect.soft(expanded.height).toBeGreaterThan(3 * line + 1);
    });

    test(`SPEC-CORE-096 I5: a collection description is 16px / 26px primary and its field is 16px`, async ({
      page,
    }) => {
      await open(page, "reading-collection", width);
      const p = await probes(page);

      expectReadText(await textStyle(page, READING.collectionDescription), p);

      await page.getByRole("button", { name: READING.collectionDescription }).click();
      const field = await fieldStyle(page, { value: READING.collectionDescription });
      expect.soft(field.fontSize).toBe("16px");
    });

    test(`SPEC-CORE-096 I5: the Quick Note body field is 16px`, async ({ page }) => {
      await open(page, "reading-quick-note", width);
      const field = await fieldStyle(page, { value: READING.quickNote });
      expect.soft(field.fontSize).toBe("16px");
    });

    for (const form of ["paragraph", "list"] as const) {
      test(`SPEC-ADDON-105 I6: the short summary is 16px / 500 and the ${form} long summary 16px / 400, both 26px primary`, async ({
        page,
      }) => {
        await open(page, `reading-summary-${form}`, width);
        const p = await probes(page);

        const short = await textStyle(page, READING.summaryShort);
        expectReadText(short, p);
        expect.soft(short.fontWeight).toBe("500");

        const longTexts =
          form === "paragraph" ? [READING.summaryLongParagraph] : [...READING.summaryLongItems];
        for (const text of longTexts) {
          const long = await textStyle(page, text);
          expectReadText(long, p);
          expect.soft(long.fontWeight).toBe("400");
        }
      });

      test(`SPEC-ADDON-105 I7: each ${form} summary edit textarea matches the read-only text it replaces`, async ({
        page,
      }) => {
        await open(page, `reading-summary-${form}`, width);

        const short = await textStyle(page, READING.summaryShort);
        const long = await textStyle(
          page,
          form === "paragraph" ? READING.summaryLongParagraph : READING.summaryLongItems[0],
        );

        await page.getByRole("button", { name: "Edit", exact: true }).click();
        const shortField = await fieldStyle(page, { value: READING.summaryShort });
        const longField = await fieldStyle(page, {
          value:
            form === "paragraph"
              ? READING.summaryLongParagraph
              : READING.summaryLongItems.map((item) => `- ${item}`).join("\n"),
        });

        for (const [field, read] of [
          [shortField, short],
          [longField, long],
        ] as const) {
          expect.soft({
            fontSize: field.fontSize,
            fontWeight: field.fontWeight,
            lineHeight: field.lineHeight,
            color: field.color,
          }).toEqual({
            fontSize: read.fontSize,
            fontWeight: read.fontWeight,
            lineHeight: read.lineHeight,
            color: read.color,
          });
        }
      });
    }

    test(`SPEC-ADDON-105 I8: the visual description is 16px / 26px primary`, async ({ page }) => {
      await open(page, "reading-visual-description", width);
      const p = await probes(page);
      expectReadText(await textStyle(page, READING.visualDescription), p);
    });

    test(`SPEC-ADDON-105 I8: each picture-text line is 16px / 26px primary and its edit field is 16px`, async ({
      page,
    }) => {
      await open(page, "reading-picture-text", width);
      const p = await probes(page);
      for (const line of READING.pictureLines) {
        expectReadText(await textStyle(page, line), p);
      }

      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const field = await fieldStyle(page, { value: READING.pictureLines.join("\n") });
      expect.soft(field.fontSize).toBe("16px");
    });

    test(`SPEC-ADDON-105 I8: the citation inline panel's passage is 16px / 26px primary`, async ({
      page,
    }) => {
      await open(page, "reading-citation", width);
      const p = await probes(page);
      expectReadText(
        await textStyle(
          page,
          READING.citationPrefix + READING.citationTarget + READING.citationSuffix,
        ),
        p,
      );
    });

    test(`SPEC-ADDON-105 I11: the citation's prefix and suffix take the passage's size in the muted colour, and the target is still marked`, async ({
      page,
    }) => {
      await open(page, "reading-citation", width);
      const p = await probes(page);
      const passage = await textStyle(
        page,
        READING.citationPrefix + READING.citationTarget + READING.citationSuffix,
      );

      for (const text of [READING.citationPrefix, READING.citationSuffix]) {
        const around = await textStyle(page, text);
        expect.soft(around.fontSize).toBe(passage.fontSize);
        expect.soft(around.color).toBe(p.muted);
      }

      const target = await page.evaluate((text) => {
        const mark = Array.from(document.querySelectorAll("mark")).find(
          (m) => m.textContent === text,
        );
        return mark ? getComputedStyle(mark).backgroundColor : null;
      }, READING.citationTarget);
      expect.soft(target).toBe(p.highlight);
    });

    test(`SPEC-ADDON-105 I9: the file Ask tab's question field is 16px, and an asked question echoes at 16px / 26px`, async ({
      page,
    }) => {
      await open(page, "reading-ask-tab", width);

      const field = page.locator("#reading-ask-tab textarea");
      await expect(field).toBeVisible();
      const before = await fieldStyle(page, { within: "#reading-ask-tab" });
      expect.soft(before.fontSize).toBe("16px");

      await field.fill(READING.askQuestion);
      const submit = page.locator('#reading-ask-tab button[type="submit"]');
      await expect(submit).toBeEnabled();
      await submit.click();

      const echo = await textStyle(page, READING.askQuestion);
      expect.soft(echo.fontSize).toBe("16px");
      expect.soft(echo.lineHeight).toBe("26px");
      expect.soft(echo.fontWeight).toBe("500");
    });

    test(`SPEC-ADDON-105 I9: the Ask page's question field is 16px`, async ({ page }) => {
      await open(page, "reading-ask-page", width);
      const field = await fieldStyle(page, { label: "Question input" });
      expect.soft(field.fontSize).toBe("16px");
    });

    test(`SPEC-CORE-096 I10: the Find-in-file tab's match rows keep 13px`, async ({ page }) => {
      await open(page, "reading-find-tab", width);
      expect.soft((await textStyle(page, READING.findSnippet)).fontSize).toBe("13px");
    });

    test(`SPEC-CORE-096 I10: the Files view's match snippet keeps 11px`, async ({ page }) => {
      await open(page, "reading-match-snippet", width);
      expect.soft((await textStyle(page, READING.matchSnippet)).fontSize).toBe("11px");
    });
  });
}
