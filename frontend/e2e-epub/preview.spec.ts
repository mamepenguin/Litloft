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

async function rgbAt(page: Page, x: number, y: number): Promise<number[]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
  }, png.toString("base64"));
}

function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

async function expectPageColour(page: Page, want?: number[]): Promise<void> {
  want ??= hexToRgb(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim(),
    ),
  );
  const box = (await page.locator("iframe").boundingBox())!;
  const points: [number, number][] = [
    [box.x + 3, box.y + box.height / 2],
    [box.x + box.width - 4, box.y + box.height / 2],
    [box.x + box.width / 2, box.y + 3],
  ];
  for (const [x, y] of points) {
    const got = await rgbAt(page, Math.round(x), Math.round(y));
    expect(got.map((v, i) => Math.abs(v - want[i]) <= 2), `${got} at ${x},${y}, want ${want}`).toEqual([
      true,
      true,
      true,
    ]);
  }
}

for (const [from, to] of [
  ["light", "dark"],
  ["dark", "light"],
] as const) {
  test(`after a ${from} to ${to} switch, and again after a later render, the page and its margins are the app's page colour`, async ({
    page,
  }) => {
    await page.addInitScript((theme) => document.documentElement.setAttribute("data-theme", theme), from);
    await page.goto(`${origin()}/preview/index.html?book=horizontal`);
    await expect.poll(() => readerIndex(page)).not.toBeNull();

    await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), to);
    await page.waitForTimeout(500);
    await expectPageColour(page);

    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(800);
    await expectPageColour(page);
  });
}

test("with a page colour the reader cannot read, the book and its margins take the theme's system colour", async ({
  page,
}) => {
  await page.goto(`${origin()}/preview/index.html?book=horizontal`);
  await expect.poll(() => readerIndex(page)).not.toBeNull();

  await page.evaluate(() => {
    document.documentElement.style.setProperty("--bg-primary", "red");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(500);
  const system = await page.evaluate(async () => {
    const probe = document.createElement("div");
    probe.style.cssText = "color-scheme: dark; background: Canvas; width: 1px; height: 1px";
    document.body.append(probe);
    const [r, g, b] = getComputedStyle(probe).backgroundColor.match(/\d+/g)!.map(Number);
    probe.remove();
    return [r, g, b];
  });
  await expectPageColour(page, system);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.waitForTimeout(800);
  await expectPageColour(page, system);
});
