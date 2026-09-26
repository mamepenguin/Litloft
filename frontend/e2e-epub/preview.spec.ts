import { test, expect, type Page } from "@playwright/test";

const origin = () => process.env.EPUB_E2E_ORIGIN!;

function readerIndex(page: Page) {
  return page.evaluate(() => {
    const doc = document.querySelector("iframe")?.contentDocument;
    const view = doc?.querySelector("foliate-view") as unknown as
      | { lastLocation?: { section?: { current: number } } }
      | null;
    return view?.lastLocation?.section?.current ?? null;
  });
}

test("a new section for the book already open reopens the reader at that chapter", async ({ page }) => {
  await page.goto(`${origin()}/preview/index.html?book=horizontal&s=2`);
  await expect.poll(() => readerIndex(page)).toBe(1);
  const first = await page.locator("iframe").elementHandle();

  await page.evaluate(() => window.setSection(4));
  await expect.poll(() => readerIndex(page)).toBe(3);
  expect(await first!.evaluate((el) => el.isConnected)).toBe(false);
});
