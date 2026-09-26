import { test, expect, type Page } from "@playwright/test";

type Typography = { fontSize?: number; lineHeight?: string; margin?: string; fontFamily?: string };

declare global {
  interface Window {
    __msgs: { type: string; [key: string]: unknown }[];
    turn: (direction: string) => void;
    seek: (fraction: number, id?: number) => void;
    setTheme: (theme: string) => void;
    setTypography: (t: unknown) => void;
  }
}

const origin = () => process.env.EPUB_E2E_ORIGIN!;
const ORIGINAL = { fontSize: 2, lineHeight: "original", margin: "normal", fontFamily: "original" };
const SETTLE_MS = 700;

async function open(page: Page, book: string, { fraction, typography }: { fraction?: number; typography?: unknown } = {}) {
  const f = fraction === undefined ? "" : `&f=${fraction}`;
  const t = typography === undefined ? "" : `&t=${encodeURIComponent(JSON.stringify(typography))}`;
  await page.goto(`${origin()}/host.html?book=${book}${f}${t}`);
  await page.waitForFunction(() => window.__msgs.some((m) => m.type === "ready" || m.type === "error"));
  await page.waitForTimeout(SETTLE_MS);
}

function messages(page: Page, type: string) {
  return page.evaluate((t) => window.__msgs.filter((m) => m.type === t), type);
}

/** The section on screen, the page within it, and facts about its document. */
function where(page: Page) {
  return page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      lastLocation?: { section?: { current: number } };
      renderer: {
        page: number;
        pages: number;
        getAttribute(name: string): string | null;
        getContents(): { doc: Document }[];
      };
    };
    const section = view.renderer.getContents()[0].doc;
    const css = (sel: string, prop: string) => {
      const el = section.querySelector(sel);
      return el ? section.defaultView!.getComputedStyle(el).getPropertyValue(prop) : null;
    };
    return {
      index: view.lastLocation?.section?.current,
      page: view.renderer.page,
      gap: view.renderer.getAttribute("gap"),
      rootSize: css("html", "font-size"),
      pFamily: css("p", "font-family"),
      pLineHeight: css("p", "line-height"),
      codeFamily: css("#codespan", "font-family"),
      inlineCodeFamily: css("#inlinespan", "font-family"),
      bodyBg: css("body", "background-color"),
    };
  });
}

/** Whether the start of the range the reader was showing is still on screen. */
function startStillShown(page: Page) {
  return page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as { lastLocation?: { range?: Range } };
    const range = (window as unknown as { __kept?: Range }).__kept;
    if (!range) return null;
    // A collapsed range has no box at an element boundary; the first line box
    // of the range is where its start is drawn.
    const rect = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0);
    if (!rect) return null;
    const frame = range.startContainer.ownerDocument!.defaultView!.frameElement!;
    const x = rect.left + frame.getBoundingClientRect().left;
    void view;
    return x >= 0 && x < doc.defaultView!.innerWidth;
  });
}

function keepStart(page: Page) {
  return page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as { lastLocation?: { range?: Range } };
    (window as unknown as { __kept?: Range }).__kept = view.lastLocation!.range!.cloneRange();
  });
}

async function setTypography(page: Page, t: Typography) {
  await page.evaluate((v) => window.setTypography(v), { ...ORIGINAL, ...t });
  await page.waitForTimeout(SETTLE_MS);
}

async function turnTimes(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.turn("next"));
    await page.waitForTimeout(250);
  }
}

test("with nothing set, the book's own styles and today's gap are kept", async ({ page }) => {
  await open(page, "styled.epub");
  const at = await where(page);
  expect(at.rootSize).toBe("10px");
  expect(at.gap).toBe("6%");
  expect(at.pFamily).toBe("serif");
});

test.describe("font size", () => {
  test("scales the book's own root size in every chapter, after any sequence of steps", async ({ page }) => {
    await open(page, "styled.epub", { typography: { ...ORIGINAL, fontSize: 4 } });
    expect((await where(page)).rootSize).toBe("13px");
    await setTypography(page, { fontSize: 5 });
    await setTypography(page, { fontSize: 4 });
    expect((await where(page)).rootSize).toBe("13px");
    await page.evaluate(() => window.seek(0.9));
    await page.waitForTimeout(SETTLE_MS);
    const third = await where(page);
    expect(third.index).toBe(2);
    expect(third.rootSize).toBe("13px");
    await setTypography(page, { fontSize: 2 });
    expect((await where(page)).rootSize).toBe("10px");
  });
});

test.describe("a change", () => {
  test("posts no turn", async ({ page }) => {
    await open(page, "styled.epub", { fraction: 0.4 });
    await setTypography(page, { fontSize: 5, lineHeight: "1.9", margin: "wide", fontFamily: "sans" });
    expect(await messages(page, "turned")).toEqual([]);
  });

  for (const delay of [0, 5, 15, 40]) test(`${delay} ms into a seek posts only the seek's turn, at the place the seek went to`, async ({ page }) => {
    await open(page, "styled.epub");
    await page.evaluate((ms) => {
      window.seek(0.7, 5);
      setTimeout(() => window.setTypography({ fontSize: 5, lineHeight: "original", margin: "normal", fontFamily: "original" }), ms);
    }, delay);
    await expect.poll(async () => (await messages(page, "seeked")).length).toBe(1);
    await page.waitForTimeout(SETTLE_MS * 2);
    const turned = await messages(page, "turned");
    expect(turned).toHaveLength(1);
    expect(turned[0].fraction as number).toBeGreaterThan(0.6);
    const at = await where(page);
    expect(at.index).toBe(2);
    expect(at.rootSize).toBe("16px");
  });

  for (const [name, prepare] of [
    ["after opening", async (_page: Page) => {}],
    ["after a seek", async (page: Page) => {
      await page.evaluate(() => window.seek(0.5));
      await page.waitForTimeout(SETTLE_MS);
    }],
    ["after turning pages", async (page: Page) => turnTimes(page, 3)],
  ] as const) {
    test(`keeps the page's first text on screen ${name}`, async ({ page }) => {
      await open(page, "styled.epub", { fraction: 0.2 });
      await prepare(page);
      await keepStart(page);
      for (const t of [{ fontSize: 6 }, { margin: "wide" }, { lineHeight: "1.9" }, { fontFamily: "sans" }, {}] as Typography[]) {
        await setTypography(page, t);
        expect(await startStillShown(page)).toBe(true);
      }
    });
  }

  test("keeps the page's first text on screen when changes and relayouts alternate", async ({ page }) => {
    await open(page, "styled.epub", { fraction: 0.2 });
    await turnTimes(page, 3);
    await keepStart(page);
    for (const [i, width] of [640, 1000, 760, 900, 580, 1000].entries()) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(SETTLE_MS);
      await setTypography(page, i % 2 === 0 ? { fontSize: 5 } : {});
      expect(await startStillShown(page)).toBe(true);
    }
  });

  test("and back to the setting before shows the page shown before", async ({ page }) => {
    await open(page, "styled.epub", { fraction: 0.2 });
    await turnTimes(page, 2);
    const before = await where(page);
    await setTypography(page, { fontSize: 6 });
    await setTypography(page, {});
    const after = await where(page);
    expect({ index: after.index, page: after.page }).toEqual({ index: before.index, page: before.page });
  });
});

test("opening with a setting lands where a seek to the same place lands under it", async ({ page }) => {
  const typography = { ...ORIGINAL, fontSize: 6, margin: "wide" };
  await open(page, "styled.epub", { fraction: 0.45, typography });
  const opened = await where(page);
  await open(page, "styled.epub", { typography });
  await page.evaluate(() => window.seek(0.45));
  await page.waitForTimeout(SETTLE_MS);
  const sought = await where(page);
  expect({ index: sought.index, page: sought.page }).toEqual({ index: opened.index, page: opened.page });
});

test.describe("an open with a typography that cannot be read", () => {
  for (const typography of ["garbage", { fontSize: 99, margin: "huge" }, null]) {
    test(`opens with the book's own styles: ${JSON.stringify(typography)}`, async ({ page }) => {
      await open(page, "styled.epub", { typography });
      expect(await messages(page, "error")).toEqual([]);
      const at = await where(page);
      expect(at.rootSize).toBe("10px");
      expect(at.gap).toBe("6%");
    });
  }
});

test("a theme change keeps the typography, a typography change keeps the theme, and code keeps its face", async ({
  page,
}) => {
  await open(page, "styled.epub");
  await page.evaluate(() => window.seek(0.34));
  await page.waitForTimeout(SETTLE_MS);
  expect((await where(page)).index).toBe(1);
  await setTypography(page, { fontFamily: "sans", lineHeight: "1.9" });
  await page.evaluate(() => window.setTheme("dark"));
  await page.waitForTimeout(SETTLE_MS);
  let at = await where(page);
  expect(at.pFamily).toMatch(/Helvetica/);
  expect(at.bodyBg).toBe("rgb(22, 22, 22)");
  await setTypography(page, { fontFamily: "serif" });
  at = await where(page);
  expect(at.pFamily).toMatch(/Georgia/);
  expect(at.bodyBg).toBe("rgb(22, 22, 22)");
  expect(at.pLineHeight).not.toBe("");
  expect(at.codeFamily).toBe("monospace");
  expect(at.inlineCodeFamily).toBe("monospace");
});

test("line spacing wins over the book's own class rules", async ({ page }) => {
  await open(page, "styled.epub", { typography: { ...ORIGINAL, lineHeight: "1.9" } });
  const at = await where(page);
  // 1.9 × the 16 px body text.
  expect(at.pLineHeight).toBe("30.4px");
});

test("a theme change lays the book out no more than once", async ({ page }) => {
  await open(page, "styled.epub", { fraction: 0.3 });
  const before = (await messages(page, "location")).length;
  await page.evaluate(() => window.setTheme("dark"));
  await page.waitForTimeout(SETTLE_MS);
  expect((await messages(page, "location")).length - before).toBeLessThanOrEqual(1);
});
