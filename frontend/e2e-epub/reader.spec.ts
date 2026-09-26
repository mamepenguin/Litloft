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
    return {
      index: view.lastLocation?.section?.current,
      page: view.renderer.page,
      pages: view.renderer.pages,
    };
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

/** The hostile book's spine, in order. */
const HOSTILE_SECTIONS = ["c1", "c6", "c7", "c2", "c3", "c4", "c5-svg"];

/**
 * Turns until a turn no longer moves, clicking everything on the way, and
 * returns the sections it paged through. The turn after the last section it
 * can page through still loads the next one.
 */
async function walkHostileBook(page: Page): Promise<number[]> {
  await open(page, "hostile.epub");
  expect((await messages(page, "ready")).length).toBe(1);
  const reached = new Set<number>();
  let still = 0;
  for (let i = 0; i < 40 && still < 2; i++) {
    const before = await where(page);
    if (before.index !== undefined) reached.add(before.index);
    await clickEverything(page);
    await page.evaluate(() => window.turn("next"));
    await page.waitForTimeout(300);
    const after = await where(page);
    still = after.index === before.index && after.page === before.page ? still + 1 : 0;
  }
  await clickEverything(page);
  await page.waitForTimeout(500);
  return [...reached].sort((a, b) => a - b);
}

const upTo = (section: string) =>
  Array.from({ length: HOSTILE_SECTIONS.indexOf(section) + 1 }, (_, i) => i);

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
  test("runs no script and reaches no same-origin path", async ({ page, request }, info) => {
    const id = `${info.project.name}:${info.testId}`;
    await page.setExtraHTTPHeaders({ "x-e2e-test": id });
    expect(await walkHostileBook(page)).toEqual(upTo("c4"));
    expect(await page.evaluate(() => window.__pwned ?? null)).toBeNull();
    const leaks = await request.get(`${origin()}/leaks?test=${encodeURIComponent(id)}`);
    expect(await leaks.json()).toEqual([]);
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
    // Unsanitized, whether the section of unknown type can be laid out
    // depends on the engine, so only the sections before it are held.
    const reached = await walkHostileBook(page);
    expect(reached.slice(0, upTo("c3").length)).toEqual(upTo("c3"));
    expect(await page.evaluate(() => window.__pwned ?? null)).toBeNull();
  });

  test("runs no script with the sanitizer alone", async ({ page }) => {
    await page.route("**/epub-reader/reader.html", async (route) => {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers["content-security-policy"];
      await route.fulfill({ response, headers });
    });
    await page.route("**/epub-reader/reader.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const probeless = body.replace("if (!cspIsActive()) {", "if (false) {");
      expect(probeless).not.toBe(body);
      await route.fulfill({ response, body: probeless });
    });
    expect(await walkHostileBook(page)).toEqual(upTo("c4"));
    expect(await page.evaluate(() => window.__pwned ?? null)).toBeNull();
  });

  // The reader's own policy plus one weakening each: the probe's eval and
  // inline checks are what refuse these.
  for (const weakening of ["'unsafe-eval'", "'unsafe-inline'"]) {
    test(`is never opened when the policy adds ${weakening}`, async ({ page }) => {
      await page.route("**/epub-reader/reader.html", async (route) => {
        const response = await route.fetch();
        const host = new URL(route.request().url()).host;
        const policy = epubReaderCsp(host).replace(
          `script-src ${host}/epub-reader/`,
          `script-src ${host}/epub-reader/ ${weakening}`,
        );
        expect(policy).toContain(weakening);
        await route.fulfill({
          response,
          headers: { ...response.headers(), "content-security-policy": policy },
        });
      });
      await open(page, "hostile.epub");
      expect(await messages(page, "error")).toEqual([{ type: "error", code: "isolation" }]);
    });
  }

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

function sectionWindow(page: Page) {
  return page.evaluateHandle(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      renderer: { getContents(): { doc: Document }[] };
    };
    return view.renderer.getContents()[0].doc.defaultView!;
  });
}

test.describe("reader actions inside the book", () => {
  test("a key typed into the book turns and reports", async ({ page }) => {
    await open(page, "horizontal.epub");
    const win = await sectionWindow(page);
    await win.evaluate((w) => w.focus());
    const before = await where(page);
    await page.keyboard.press("PageDown");
    await expect.poll(async () => (await messages(page, "turned")).length).toBe(1);
    expect((await where(page)).page).toBe(before.page + 1);
  });

  test("an arrow typed into the book inline is handed to the page", async ({ page }) => {
    await open(page, "horizontal.epub");
    const win = await sectionWindow(page);
    await win.evaluate((w) => w.focus());
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => messages(page, "key")).toEqual([{ type: "key", key: "ArrowRight" }]);
    expect(await messages(page, "turned")).toEqual([]);
  });

  test("a link inside the book moves there and reports", async ({ page }) => {
    await open(page, "horizontal.epub");
    const win = await sectionWindow(page);
    await win.evaluate((w) =>
      w.document
        .getElementById("to-three")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
    );
    await expect.poll(async () => (await messages(page, "turned")).length).toBe(1);
    expect((await where(page)).index).toBe(2);
  });
});

test("a chapter with characters XML refuses is shown, and the book reads past it", async ({
  page,
}) => {
  await open(page, "flawed.epub");
  for (let i = 0; i < 10 && (await where(page)).index !== 2; i++) await turnAndSettle(page);
  expect((await where(page)).index).toBe(2);
  expect(await messages(page, "turned")).toHaveLength(2);
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
      const back = await where(page);
      expect({ index: back.index, page: back.page }).toEqual({ index: target.index, page: target.page });
      expect(await messages(page, "turned")).toEqual([]);
    });

    test("every page of the first two chapters reopens on itself", async ({ page }) => {
      await open(page, book);
      const places: { fraction: number; at: { index?: number; page: number } }[] = [];
      for (let i = 0; i < 60; i++) {
        await turnAndSettle(page);
        const now = await where(page);
        if ((now.index ?? 0) > 1) break;
        const last = (await messages(page, "turned")).at(-1)!;
        places.push({ fraction: last.fraction as number, at: { index: now.index, page: now.page } });
      }
      expect(new Set(places.map((p) => p.at.index))).toEqual(new Set([0, 1]));
      for (const place of places) {
        await open(page, book, place.fraction);
        const back = await where(page);
        expect({ index: back.index, page: back.page }).toEqual(place.at);
      }
    });

    test("a place taken in a narrow window never reopens on a blank page", async ({ page }) => {
      await page.setViewportSize({ width: 420, height: 700 });
      await open(page, book);
      for (let i = 0; i < 60; i++) {
        const now = await where(page);
        if (now.index === 0 && now.page === now.pages - 2) break;
        await turnAndSettle(page);
      }
      const last = (await messages(page, "turned")).at(-1)!;
      await page.setViewportSize({ width: 1400, height: 900 });
      await open(page, book, last.fraction as number);
      const reopened = await where(page);
      expect(reopened.page).toBeGreaterThanOrEqual(1);
      expect(reopened.page).toBeLessThanOrEqual(reopened.pages - 2);
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

test.describe("touch", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "touch is driven through CDP");
  test.use({ hasTouch: true });

  async function swipe(page: Page, fromX: number, toX: number) {
    const cdp = await page.context().newCDPSession(page);
    const y = 300;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y }] });
    for (let i = 1; i <= 6; i++) {
      const x = fromX + ((toX - fromX) * i) / 6;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(600);
    return cdp;
  }

  test("a swipe turns the page and reports it", async ({ page }) => {
    await open(page, "horizontal.epub");
    const before = await where(page);
    await swipe(page, 700, 300);
    const after = await where(page);
    expect(after.page).toBe(before.page + 1);
    expect(await messages(page, "turned")).toHaveLength(1);
  });

  async function tap(page: Page, x: number) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: 300 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(600);
  }

  test("an edge tap turns only in full screen", async ({ page }) => {
    await open(page, "horizontal.epub");
    const start = await where(page);
    await tap(page, 980);
    expect(await where(page)).toEqual(start);
    await page.evaluate(() => window.setMode(true));
    await page.waitForTimeout(400);
    const pinned = await where(page);
    await tap(page, 980);
    expect((await where(page)).page).toBe(pinned.page + 1);
    await tap(page, 20);
    expect((await where(page)).page).toBe(pinned.page);
    expect(await messages(page, "turned")).toHaveLength(2);
  });

  test("a sideways pan while the page is zoomed turns nothing", async ({ page }) => {
    await open(page, "horizontal.epub");
    // The page's own zoom, reported where a pinch reports it. Emulating the
    // scale in the browser pans the viewport instead of delivering the touch.
    await page.evaluate(() =>
      Object.defineProperty(window.visualViewport!, "scale", { get: () => 2 }),
    );
    const before = await where(page);
    await swipe(page, 700, 300);
    expect(await where(page)).toEqual(before);
    expect(await messages(page, "turned")).toEqual([]);
  });
});
