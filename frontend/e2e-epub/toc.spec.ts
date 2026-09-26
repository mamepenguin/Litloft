import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __msgs: { type: string; [key: string]: unknown }[];
    goToToc: (index: unknown) => void;
  }
}

const origin = () => process.env.EPUB_E2E_ORIGIN!;
const SETTLE_MS = 700;

// toc.epub: "", "Part" (no link), "Two", "Three" (c3.xhtml#late, several pages
// into its chapter), "Gone" (not in
// the book), "Four & bold".
const THREE = 3;

async function open(page: Page, query = "") {
  await page.goto(`${origin()}/host.html?book=toc.epub${query}`);
  await page.waitForFunction(() => window.__msgs.some((m) => m.type === "ready" || m.type === "error"));
  await page.waitForTimeout(SETTLE_MS);
}

function messages(page: Page, type: string) {
  return page.evaluate((t) => window.__msgs.filter((m) => m.type === t), type);
}

function where(page: Page) {
  return page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      lastLocation?: { section?: { current: number } };
      renderer: { page: number };
    };
    return { index: view.lastLocation?.section?.current, page: view.renderer.page };
  });
}

function recordErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test("an entry with a fragment lands in its section and is saved once", async ({ page }) => {
  await open(page);
  await page.evaluate((i) => window.goToToc(i), THREE);
  await page.waitForTimeout(SETTLE_MS);
  const at = await where(page);
  expect(at.index).toBe(2);
  expect(at.page).toBeGreaterThan(2);
  const shown = await page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as { renderer: { getContents(): { doc: Document }[] } };
    const target = view.renderer.getContents()[0].doc.getElementById("late")!;
    const frame = target.ownerDocument.defaultView!.frameElement!;
    const x = target.getClientRects()[0].left + frame.getBoundingClientRect().left;
    return x >= 0 && x < doc.defaultView!.innerWidth;
  });
  expect(shown).toBe(true);
  expect(await messages(page, "turned")).toHaveLength(1);
});

test("the entry for the page already shown saves nothing", async ({ page }) => {
  await open(page);
  const before = await where(page);
  await page.evaluate(() => window.goToToc(0));
  await page.waitForTimeout(SETTLE_MS);
  expect(await where(page)).toEqual(before);
  expect(await messages(page, "turned")).toEqual([]);
});

for (const index of [-1, 1.5, 99, "3", null, 1, 4]) {
  test(`goToToc(${JSON.stringify(index)}) does nothing and logs nothing`, async ({ page }) => {
    await open(page);
    // Only what the command causes: opening logs the policy probe's refusal.
    const errors = recordErrors(page);
    const before = await where(page);
    await page.evaluate((i) => window.goToToc(i), index);
    await page.waitForTimeout(SETTLE_MS);
    expect(await where(page)).toEqual(before);
    expect(await messages(page, "turned")).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("a goToToc sent before the book is ready does nothing", async ({ page }) => {
  await open(page, `&early=${THREE}`);
  expect((await where(page)).index).toBe(0);
  expect(await messages(page, "turned")).toEqual([]);
});
