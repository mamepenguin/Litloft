import { test, expect, type Page } from "@playwright/test";

import { epubReaderCsp } from "../src/lib/epubReaderCsp";

declare global {
  interface Window {
    __msgs: { type: string; [key: string]: unknown }[];
    __loads: number;
    __pwned?: string[];
    turn: (direction: string) => void;
    setTheme: (theme: string) => void;
    setMode: (fullscreen: boolean) => void;
  }
}

const origin = () => process.env.EPUB_E2E_ORIGIN!;

async function open(page: Page, book: string, fraction?: number) {
  const query = fraction === undefined ? "" : `&f=${fraction}`;
  await page.goto(`${origin()}/host.html?book=${book}${query}`);
  await page.waitForFunction(() =>
    window.__msgs.some((m) => m.type === "ready" || m.type === "error"),
  );
}

function messages(page: Page, type: string) {
  return page.evaluate((t) => window.__msgs.filter((m) => m.type === t), type);
}

/** Where foliate is: the section, and the page within it. */
function where(page: Page) {
  return page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      lastLocation?: { section?: { current: number } };
      renderer: { page: number; pages: number };
    };
    return { index: view.lastLocation?.section?.current, page: view.renderer.page };
  });
}

async function turnAndSettle(page: Page, direction = "next") {
  const before = (await messages(page, "turned")).length;
  const at = await where(page);
  await page.evaluate((d) => window.turn(d), direction);
  await expect
    .poll(async () => {
      const now = await where(page);
      return now.index !== at.index || now.page !== at.page;
    })
    .toBe(true);
  await expect.poll(async () => (await messages(page, "turned")).length).toBe(before + 1);
}

/** Clicks everything clickable in the section on screen. */
function clickEverything(page: Page) {
  return page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      renderer: { getContents(): { doc: Document }[] };
    };
    const section = view.renderer.getContents()[0]?.doc;
    section?.querySelectorAll("a, button, summary, details, div, img, svg").forEach((el) => {
      (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  });
}

async function walkHostileBook(page: Page) {
  await open(page, "hostile.epub");
  expect((await messages(page, "ready")).length).toBe(1);
  for (let i = 0; i < 5; i++) {
    await clickEverything(page);
    await page.evaluate(() => window.turn("next"));
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(500);
}

test.describe("the reader document", () => {
  test("carries the policy for its host, and nothing outside the reader is served under it", async ({
    request,
  }) => {
    const host = new URL(origin()).host;
    const reader = await request.get(`${origin()}/epub-reader/reader.html`);
    expect(reader.status()).toBe(200);
    expect(reader.headers()["content-security-policy"]).toBe(epubReaderCsp(host));

    for (const path of [
      "/epub-reader/..%2fevil.js",
      "/epub-reader/%2e%2e%2fevil.js",
      "/epub-reader/vendor/LICENSE",
    ]) {
      const res = await request.fetch(`${origin()}${path}`);
      expect(res.status(), path).toBe(404);
    }
  });
});

test.describe("a hostile book", () => {
  test("runs no script", async ({ page }) => {
    await walkHostileBook(page);
    expect(await page.evaluate(() => window.__pwned ?? null)).toBeNull();
    const links = await messages(page, "link");
    for (const link of links) expect(String(link.url)).toMatch(/^https?:/);
  });

  test("runs no script with the policy alone", async ({ page }) => {
    await page.route("**/epub-reader/sanitize.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "export const transformResource = () => {};",
      }),
    );
    await walkHostileBook(page);
    expect(await page.evaluate(() => window.__pwned ?? null)).toBeNull();
  });

  test("is never opened without the policy", async ({ page }) => {
    await page.route("**/epub-reader/reader.html", async (route) => {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers["content-security-policy"];
      await route.fulfill({ response, headers });
    });
    await open(page, "hostile.epub");
    expect(await messages(page, "error")).toEqual([{ type: "error", code: "isolation" }]);
    expect(
      await page.evaluate(
        () =>
          (document.getElementById("reader") as HTMLIFrameElement).contentDocument!.querySelector(
            "foliate-view",
          ) === null,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => window.__pwned ?? null)).toBeNull();
  });
});

test("a fixed-layout book is refused", async ({ page }) => {
  await open(page, "fixed.epub");
  expect(await messages(page, "error")).toEqual([{ type: "error", code: "unsupported" }]);
});

for (const book of ["horizontal.epub", "vertical.epub"]) {
  test.describe(book, () => {
    test("a turn across a chapter reports, and reopening lands on the same page", async ({
      page,
    }) => {
      await open(page, book);
      expect((await where(page)).index).toBe(0);

      let crossed = false;
      for (let i = 0; i < 40 && !crossed; i++) {
        await turnAndSettle(page);
        crossed = (await where(page)).index === 1;
      }
      expect(crossed).toBe(true);
      await turnAndSettle(page);
      await turnAndSettle(page);

      const target = await where(page);
      const last = (await messages(page, "turned")).at(-1)!;
      expect(last.atEnd).toBe(false);

      await open(page, book, last.fraction as number);
      expect(await where(page)).toEqual(target);
      expect(await messages(page, "turned")).toEqual([]);
    });

    test("opening, resizing, changing theme and mode report no turn", async ({ page }) => {
      await open(page, book, 0.3);
      await page.setViewportSize({ width: 700, height: 600 });
      await page.waitForTimeout(400);
      await page.evaluate(() => window.setTheme("dark"));
      await page.evaluate(() => window.setMode(true));
      await page.waitForTimeout(400);
      await page.evaluate(() => window.setMode(false));
      await page.setViewportSize({ width: 1000, height: 800 });
      await page.waitForTimeout(400);
      expect(await messages(page, "turned")).toEqual([]);
      expect(await page.evaluate(() => window.__loads)).toBe(1);
    });

    test("a turn onto the last page says so, and only that one", async ({ page }) => {
      await open(page, book, 0.9);
      const atEnd = () =>
        page.evaluate(
          () =>
            (
              (document.getElementById("reader") as HTMLIFrameElement).contentDocument!.querySelector(
                "foliate-view",
              ) as unknown as { renderer: { atEnd: boolean } }
            ).renderer.atEnd,
        );
      expect(await atEnd()).toBe(false);
      for (let i = 0; i < 40 && !(await atEnd()); i++) await turnAndSettle(page);
      const turned = await messages(page, "turned");
      expect(turned.at(-1)?.atEnd).toBe(true);
      expect(turned.slice(0, -1).every((m) => m.atEnd === false)).toBe(true);
    });
  });
}
