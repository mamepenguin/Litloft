/**
 * SPEC-CORE-094 and SPEC-CORE-095 below 768px, measured on the real
 * `AppShell` with the real file page in it.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import enMessages from "../src/messages-core/en.json";

const FIXTURE = pathToFileURL(PAGE).href;
const EXPAND = enMessages.inspector.expandSheet;
const COLLAPSE = enMessages.inspector.collapseSheet;

type Box = { left: number; right: number; top: number; bottom: number };

let navigation = 0;

async function open(page: Page, arrangement: string, width = 390): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`${FIXTURE}?run=${++navigation}#${arrangement}`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
}

async function headerHeight(page: Page): Promise<number> {
  return page.locator("header").evaluate((el) => el.getBoundingClientRect().height);
}

const box = (l: Locator): Promise<Box> =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });

const overlaps = (a: Box, b: Box) =>
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5 &&
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5;

/** Visible glyphs of one lucide icon inside the header. */
const headerGlyph = (page: Page, icon: string) =>
  page.locator(`header svg.lucide-${icon}:visible`);

const fileName = (page: Page, name: string) =>
  page.locator("header").getByText(name, { exact: true }).filter({ visible: true });

test("SPEC-CORE-094 D1 / I1 (narrow): the file page's row is the app header's row, at the ordinary header's height", async ({
  page,
}) => {
  await open(page, "header-row-ordinary");
  const ordinary = await headerHeight(page);

  await open(page, "header-row-video");
  await expect(fileName(page, "holiday.webm")).toHaveCount(1);
  expect(await headerHeight(page)).toBe(ordinary);

  // No second row: nothing that leads to the parent folder is drawn below it.
  const parentLinks = page.locator('a[href="/drive/fixture/Videos/Clips"]:visible');
  await expect(parentLinks).toHaveCount(1);
  await expect(page.locator('header a[href="/drive/fixture/Videos/Clips"]:visible')).toHaveCount(1);
});

test("SPEC-CORE-094 D4 / I3 (narrow): no quick note, no avatar, no tree button and no inspector toggle; search stays", async ({
  page,
}) => {
  await open(page, "header-row-video");
  await expect(fileName(page, "holiday.webm")).toHaveCount(1);

  const header = page.locator("header");
  await expect(header.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Quick note" })).toBeHidden();
  await expect(header.getByRole("button", { name: "Profile Setup" })).toBeHidden();
  await expect(page.getByRole("button", { name: /tree/i })).toBeHidden();
  for (const name of [EXPAND, COLLAPSE, /inspector/i]) {
    await expect(page.locator("header").getByRole("button", { name })).toBeHidden();
  }
  await expect(page.getByRole("button", { name: EXPAND })).toHaveCount(1);
  await expect(page.getByTestId("mobile-inspector-peek").getByRole("button", { name: EXPAND })).toBeVisible();
});

test("SPEC-CORE-094 D5 (narrow): the heading is two lines, the parent folder (12px, a link) above the file name (14px, semibold)", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const parent = page.locator('header a[href="/drive/fixture/Videos/Clips"]:visible');
  await expect(parent).toHaveCount(1);
  await expect(parent).toContainText("Clips");
  const name = fileName(page, "holiday.webm");
  await expect(name).toHaveCount(1);

  const p = await box(parent);
  const n = await box(name);
  expect(p.bottom).toBeLessThanOrEqual(n.top + 1);

  const style = (l: Locator) =>
    l.evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: s.fontSize, weight: Number(s.fontWeight) };
    });
  expect((await style(parent)).size).toBe("12px");
  const nameStyle = await style(name);
  expect(nameStyle.size).toBe("14px");
  expect(nameStyle.weight).toBeGreaterThanOrEqual(600);
});

test("SPEC-CORE-094 D5 / I5 (narrow): for a file at the drive root, line 1 is the drive's name, linking to the drive", async ({
  page,
}) => {
  await open(page, "header-row-root");
  const line1 = page.locator('header a[href="/drive/fixture"]:visible');
  await expect(line1).toHaveCount(1);
  await expect(line1).toContainText("fixture");
  const name = fileName(page, "loose.webm");
  await expect(name).toHaveCount(1);
  expect((await box(line1)).bottom).toBeLessThanOrEqual((await box(name)).top + 1);
});

test("SPEC-CORE-094 I1 / D5 / failure case (narrow, loading): line 1 alone, centred, at the loaded row's height, with the content where the loaded page puts it", async ({
  page,
}) => {
  await open(page, "header-row-video");
  await expect(fileName(page, "holiday.webm")).toHaveCount(1);
  const loadedHeader = await box(page.locator("header"));
  const loadedContent = await box(page.locator("[data-testid='page-content'] > *").first());

  await open(page, "header-row-pending");
  const line1 = page.locator('header a[href="/drive/fixture"]:visible');
  await expect(line1).toHaveCount(1);
  const header = await box(page.locator("header"));
  expect(header.bottom - header.top).toBe(loadedHeader.bottom - loadedHeader.top);
  const l = await box(line1);
  expect(Math.abs((l.top + l.bottom) / 2 - (header.top + header.bottom) / 2)).toBeLessThanOrEqual(2);
  const content = await box(page.locator("[data-testid='page-content'] > *").first());
  expect(content.top).toBe(loadedContent.top);
});

test("SPEC-CORE-094 I4 (narrow): leaving the file page brings back quick note, the avatar and the tree button, and takes the heading away", async ({
  page,
}) => {
  await open(page, "header-row-leave");
  const header = page.locator("header");
  const parent = header.locator('a[href="/drive/fixture/Videos/Clips"]:visible');
  await expect(parent).toHaveCount(1);

  await page.getByRole("button", { name: "leave-file-page" }).click();
  await expect(page.getByText("Folder listing")).toBeVisible();

  await expect(header.locator('a[href="/drive/fixture/Videos/Clips"]')).toHaveCount(0);
  await expect(header.getByText("holiday.webm")).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Quick note" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Profile Setup" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: /tree/i })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`SPEC-CORE-094 I8 / non-functional (${width}px, 200-character name): the row does not wrap, the name truncates on one line, and no two controls overlap`, async ({
    page,
  }) => {
    await open(page, "header-row-ordinary", width);
    const ordinary = await headerHeight(page);
    await open(page, "header-row-long", width);

    const name = page.locator("header").getByText(/^a{196}\.mp4$/).filter({ visible: true });
    await expect(name).toHaveCount(1);
    expect(await headerHeight(page)).toBe(ordinary);

    const m = await name.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set<number>();
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.height > 0) tops.add(Math.round(r.top));
      }
      let ellipsis = false;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.textOverflow === "ellipsis" && node.scrollWidth > node.clientWidth + 1) {
          ellipsis = true;
          break;
        }
      }
      return {
        lines: tops.size,
        ellipsis,
        documentScroll: document.documentElement.scrollWidth,
        documentClient: document.documentElement.clientWidth,
      };
    });
    expect(m.lines).toBe(1);
    expect(m.ellipsis).toBe(true);
    expect(m.documentScroll).toBe(m.documentClient);

    const controls = page.locator("header button:visible, header a:visible");
    const boxes = await controls.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    );
    expect(boxes.length).toBeGreaterThan(1);
    const header = await box(page.locator("header"));
    for (let i = 0; i < boxes.length; i += 1) {
      expect(boxes[i].right).toBeLessThanOrEqual(header.right + 0.5);
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(overlaps(boxes[i], boxes[j]), `controls ${i} and ${j} overlap`).toBe(false);
      }
    }
  });
}

test("SPEC-CORE-094 D6 / D9 (narrow): a note shows find (FileSearch, not the magnifier), one view toggle, then search, right of the heading", async ({
  page,
}) => {
  await open(page, "header-row-note");
  const header = page.locator("header");
  const find = header.getByRole("button", { name: enMessages.find.button });
  const search = header.getByRole("button", { name: "Search" });
  await expect(find).toBeVisible();
  await expect(search).toBeVisible();

  await expect(find.locator("svg.lucide-file-search")).toHaveCount(1);
  await expect(find.locator("svg.lucide-search")).toHaveCount(0);

  await expect(headerGlyph(page, "pencil")).toHaveCount(1);
  await expect(headerGlyph(page, "eye")).toHaveCount(0);
  await expect(headerGlyph(page, "columns-2")).toHaveCount(0);

  const heading = await box(
    header.getByRole("button", { name: enMessages.inspector.rename.hint }),
  );
  const f = await box(find);
  const toggle = await box(headerGlyph(page, "pencil"));
  const s = await box(search);
  expect(heading.right).toBeLessThanOrEqual(f.left + 0.5);
  expect(f.right).toBeLessThanOrEqual(toggle.left + 0.5);
  expect(toggle.right).toBeLessThanOrEqual(s.left + 0.5);
});

test("SPEC-CORE-094 I10 (narrow): the one view toggle switches to the mode its glyph shows, and then shows the other", async ({
  page,
}) => {
  await open(page, "header-row-note");
  await expect(headerGlyph(page, "pencil")).toHaveCount(1);
  await expect(headerGlyph(page, "eye")).toHaveCount(0);

  await headerGlyph(page, "pencil").click();
  await expect(headerGlyph(page, "eye")).toHaveCount(1);
  await expect(headerGlyph(page, "pencil")).toHaveCount(0);

  await headerGlyph(page, "eye").click();
  await expect(headerGlyph(page, "pencil")).toHaveCount(1);
  await expect(headerGlyph(page, "eye")).toHaveCount(0);
});

test("SPEC-CORE-094 D7 / I6 (narrow): renaming a note hides every control right of the heading, widens the input over them with the whole name in it, and brings them back on cancel", async ({
  page,
}) => {
  await open(page, "header-row-note");
  const header = page.locator("header");
  const find = header.getByRole("button", { name: enMessages.find.button });
  const search = header.getByRole("button", { name: "Search" });
  await expect(search).toBeVisible();
  await expect(find).toBeVisible();
  const searchBefore = await box(search);
  const parent = header.locator('a[href="/drive/fixture/Notes"]:visible');
  await expect(parent).toHaveCount(1);

  await header.getByRole("button", { name: enMessages.inspector.rename.hint }).click();
  const input = header.getByRole("textbox");
  await expect(input).toBeVisible();

  await expect(search).toBeHidden();
  await expect(find).toBeHidden();
  await expect(headerGlyph(page, "pencil")).toHaveCount(0);
  await expect(headerGlyph(page, "eye")).toHaveCount(0);
  await expect(page.getByTestId("save-dot")).toBeHidden();
  await expect(parent).toBeVisible();

  // Nothing is left to press where the hidden controls were.
  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.closest("button")?.getAttribute("aria-label") ?? null) : null;
    },
    { x: (searchBefore.left + searchBefore.right) / 2, y: (searchBefore.top + searchBefore.bottom) / 2 },
  );
  expect(hit).not.toBe("Search");

  const i = await box(input);
  expect(i.right).toBeGreaterThanOrEqual(searchBefore.left);
  // A Markdown note keeps the whole name, `.md` included, inside the input.
  await expect(input).toHaveValue("meeting-notes.md");
  await expect(header.getByText(".md", { exact: true }).filter({ visible: true })).toHaveCount(0);

  await input.press("Escape");
  await expect(search).toBeVisible();
  await expect(find).toBeVisible();
  await expect(headerGlyph(page, "pencil")).toHaveCount(1);
});

test("SPEC-CORE-094 D7 (narrow, plain text): renaming hides the controls right of the heading and keeps the four-character suffix outside the input", async ({
  page,
}) => {
  await open(page, "header-row-text");
  const header = page.locator("header");
  const search = header.getByRole("button", { name: "Search" });
  await expect(search).toBeVisible();
  const parent = header.locator('a[href="/drive/fixture/Notes"]:visible');
  await expect(parent).toHaveCount(1);

  await header.getByRole("button", { name: enMessages.inspector.rename.hint }).click();
  const input = header.getByRole("textbox");
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("shopping-list");

  const suffix = header.getByText(".txt", { exact: true }).filter({ visible: true });
  await expect(suffix).toHaveCount(1);
  expect(await suffix.evaluate((el) => el.closest("input") === null)).toBe(true);
  expect((await box(suffix)).left).toBeGreaterThanOrEqual((await box(input)).right - 0.5);

  await expect(search).toBeHidden();
  await expect(headerGlyph(page, "pencil")).toHaveCount(0);
  await expect(headerGlyph(page, "eye")).toHaveCount(0);
  await expect(parent).toBeVisible();

  await input.press("Escape");
  await expect(search).toBeVisible();
  await expect(headerGlyph(page, "pencil").or(headerGlyph(page, "eye"))).toHaveCount(1);
});

/** What the narrow row may hold while walking the Inbox, besides line 1's link. */
const INBOX_ROW = /^(Back.*|Click to rename|Previous file|Next file|Done)$/;

for (const width of [390, 320]) {
  for (const arrangement of ["header-row-inbox-note", "header-row-inbox-long"] as const) {
    test(`SPEC-CORE-094 D4 / I3 / I8 (Inbox walk, ${width}px, ${arrangement === "header-row-inbox-long" ? "200-character name" : "short name"}): the row holds the heading, then previous / next / Done only, on one line with nothing overlapping`, async ({
      page,
    }) => {
      await open(page, "header-row-ordinary", width);
      const ordinary = await headerHeight(page);
      await open(page, arrangement, width);

      const header = page.locator("header");
      const previous = header.getByRole("button", { name: "Previous file" });
      const next = header.getByRole("button", { name: "Next file" });
      const done = header.getByRole("button", { name: "Done" });
      await expect(previous).toBeVisible();
      await expect(next).toBeVisible();
      await expect(done).toBeVisible();
      const heading = header.getByRole("button", { name: enMessages.inspector.rename.hint });
      await expect(heading).toBeVisible();

      for (const name of ["Search", "Quick note", "Profile Setup", enMessages.find.button, EXPAND, COLLAPSE]) {
        await expect(header.getByRole("button", { name })).toBeHidden();
      }
      await expect(headerGlyph(page, "pencil")).toHaveCount(0);
      await expect(headerGlyph(page, "eye")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /tree/i })).toBeHidden();

      const drawn = await header
        .locator("button:visible, a:visible")
        .evaluateAll((els) =>
          els.map((el) => ({
            tag: el.tagName,
            name: el.getAttribute("aria-label") ?? (el.textContent ?? "").trim(),
            href: el.getAttribute("href"),
          })),
        );
      for (const control of drawn) {
        const allowed =
          (control.tag === "A" && (control.href ?? "").startsWith("/drive/fixture")) ||
          INBOX_ROW.test(control.name);
        expect(allowed, `${control.tag} "${control.name}" in the Inbox row`).toBe(true);
      }

      const h = await box(heading);
      const p = await box(previous);
      const n = await box(next);
      const d = await box(done);
      expect(h.right).toBeLessThanOrEqual(p.left + 0.5);
      expect(p.right).toBeLessThanOrEqual(n.left + 0.5);
      expect(n.right).toBeLessThanOrEqual(d.left + 0.5);

      expect(await headerHeight(page)).toBe(ordinary);
      const m = await page.evaluate(() => ({
        documentScroll: document.documentElement.scrollWidth,
        documentClient: document.documentElement.clientWidth,
      }));
      expect(m.documentScroll).toBe(m.documentClient);
      const lines = await heading.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set<number>();
        for (const r of range.getClientRects()) {
          if (r.width > 0 && r.height > 0) tops.add(Math.round(r.top));
        }
        return tops.size;
      });
      expect(lines).toBe(1);

      const boxes = await header.locator("button:visible, a:visible").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      );
      const headerBox = await box(header);
      for (let i = 0; i < boxes.length; i += 1) {
        expect(boxes[i].right).toBeLessThanOrEqual(headerBox.right + 0.5);
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(overlaps(boxes[i], boxes[j]), `controls ${i} and ${j} overlap`).toBe(false);
        }
      }
    });
  }
}

test("SPEC-CORE-094 failure case (crossing 768px): a rename open on a phone keeps its text on a wide window, and the controls come back there", async ({
  page,
}) => {
  await open(page, "header-row-note");
  const header = page.locator("header");
  await header.getByRole("button", { name: enMessages.inspector.rename.hint }).click();
  const input = header.getByRole("textbox");
  await input.fill("renamed-on-the-phone");

  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(header.getByRole("textbox")).toHaveValue("renamed-on-the-phone");
  await expect(header.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Quick note" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header.getByRole("textbox")).toHaveValue("renamed-on-the-phone");
  await expect(header.getByRole("button", { name: "Search" })).toBeHidden();
});

test("SPEC-CORE-095 D8 / I7: a press on the strip's name while its menu is open only closes the menu", async ({
  page,
}) => {
  await open(page, "header-row-video");
  const strip = page.getByTestId("mobile-inspector-peek");
  const name = strip.getByRole("button", { name: EXPAND });
  await expect(name).toBeVisible();
  await expect(name).toHaveAttribute("aria-expanded", "false");
  await expect(name).toContainText("holiday.webm");
  await expect(name.locator("svg.lucide-chevron-up")).toHaveCount(1);

  await strip.getByRole("button", { name: "File actions" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();

  await name.click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId("mobile-inspector-sheet")).toHaveCount(0);
  await expect(page.getByTestId("mobile-inspector-peek")).toBeVisible();

  await name.click();
  await expect(page.getByTestId("mobile-inspector-sheet")).toBeVisible();
  await expect(page.getByRole("button", { name: EXPAND })).toHaveCount(0);
});

/**
 * A target is measured by what a finger lands on, not by its box: a hit area
 * may be widened past the glyph by a pseudo-element.
 */
async function reach(page: Page, target: Locator): Promise<{ x: number; y: number }> {
  return target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const lands = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && el.contains(hit);
    };
    let x = 0;
    while (x < 40 && lands(cx - x - 1, cy) && lands(cx + x + 1, cy)) x += 1;
    let y = 0;
    while (y < 40 && lands(cx, cy - y - 1) && lands(cx, cy + y + 1)) y += 1;
    return { x: 2 * x + 1, y: 2 * y + 1 };
  });
}

test("SPEC-CORE-094 / SPEC-CORE-095 non-functional (coarse pointer): the controls moved into the row and the strip's name button are at least 44px targets", async ({
  page,
}) => {
  await open(page, "header-row-note");
  const header = page.locator("header");
  const targets = [
    header.getByRole("button", { name: enMessages.find.button }),
    header.locator("button:visible", { has: page.locator("svg.lucide-pencil") }),
    page.getByTestId("mobile-inspector-peek").getByRole("button", { name: EXPAND }),
  ];
  for (const target of targets) {
    await expect(target).toBeVisible();
    const r = await reach(page, target);
    expect(r.x).toBeGreaterThanOrEqual(43);
    expect(r.y).toBeGreaterThanOrEqual(43);
  }
});
