import { test, expect, type Page } from "@playwright/test";

import { epubReaderCsp } from "../src/lib/epubReaderCsp";

declare global {
  interface Window {
    __msgs: { type: string; [key: string]: unknown }[];
    __loads: number;
    __pwned?: string[];
    turn: (direction: string) => void;
    seek: (fraction: number) => void;
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

/** Waits until foliate has loaded the section into its frame. */
async function sectionLoaded(page: Page, section: string) {
  const index = HOSTILE_SECTIONS.indexOf(section);
  await page.waitForFunction((i) => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      renderer: { getContents(): { index: number; doc: Document }[] };
    };
    const shown = view.renderer.getContents()[0];
    return shown?.index === i && shown.doc.readyState === "complete";
  }, index);
  await clickEverything(page);
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
    await sectionLoaded(page, "c5-svg");
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
    await sectionLoaded(page, "c5-svg");
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

  test("an arrow typed into the book inline turns the page and is not handed to the page", async ({ page }) => {
    await open(page, "horizontal.epub");
    const win = await sectionWindow(page);
    await win.evaluate((w) => w.focus());
    const before = await where(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await messages(page, "turned")).length).toBe(1);
    expect((await where(page)).page).toBe(before.page + 1);
    await page.keyboard.press("f");
    await expect.poll(() => messages(page, "key")).toEqual([{ type: "key", key: "f" }]);
  });

  test("an arrow with a modifier typed into the book is left to the browser", async ({ page }) => {
    await open(page, "horizontal.epub");
    const win = await sectionWindow(page);
    // Claimed keys are the ones the reader cancels; a turn is asynchronous and
    // drops a second request while one runs, so the absence of `turned` proves nothing.
    const claimed = await win.evaluate((w) =>
      [{}, { shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }].map((mods) => {
        const e = new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true, ...mods });
        w.document.dispatchEvent(e);
        return e.defaultPrevented;
      }),
    );
    expect(claimed).toEqual([true, false, false, false, false]);
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

test.describe("columns", () => {
  const columnCount = (page: Page) =>
    page.evaluate(
      () =>
        (
          (document.getElementById("reader") as HTMLIFrameElement).contentDocument!.querySelector(
            "foliate-view",
          ) as unknown as { renderer: { columnCount: number } }
        ).renderer.columnCount,
    );

  test("a vertical book on a tall screen is one page, not two stacked", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await open(page, "vertical.epub");
    await page.evaluate(() => window.setMode(true));
    await page.waitForTimeout(400);
    expect(await columnCount(page)).toBe(1);
  });

  test("the count follows each section's writing mode, not the first one's", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await open(page, "mixed.epub");
    await page.evaluate(() => window.setMode(true));
    for (let i = 0; i < 10 && (await where(page)).index !== 1; i++) await turnAndSettle(page);
    expect((await where(page)).index).toBe(1);
    await expect.poll(() => columnCount(page)).toBe(2);
  });

  test("on a tall screen, a vertical section after a horizontal one is one page again", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await open(page, "mixed.epub");
    await page.evaluate(() => window.setMode(true));
    for (let i = 0; i < 20 && (await where(page)).index !== 2; i++) await turnAndSettle(page);
    expect((await where(page)).index).toBe(2);
    await expect.poll(() => columnCount(page)).toBe(1);
  });

  test("a horizontal book on a wide screen is a spread", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await open(page, "horizontal.epub");
    await page.evaluate(() => window.setMode(true));
    await page.waitForTimeout(400);
    expect(await columnCount(page)).toBe(2);
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

test.describe("the table of contents", () => {
  test("a book whose entries have no title, no link or a missing target opens, and lists every entry", async ({
    page,
  }) => {
    await open(page, "toc.epub");
    const [ready] = await messages(page, "ready");
    expect(ready).toBeDefined();
    const toc = ready.toc as { label: string; depth: number; fraction: number | null }[];
    expect(toc.map((e) => [e.label, e.depth])).toEqual([
      ["", 0],
      ["Part", 0],
      ["Two", 1],
      ["Three", 1],
      ["Gone", 0],
      ["Four & bold", 0],
    ]);
    expect(toc.map((e) => e.fraction === null)).toEqual([false, true, false, false, true, false]);
    const starts = toc.filter((e) => e.fraction !== null).map((e) => e.fraction as number);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  test("the book's own markup never reaches the page", async ({ page }) => {
    await open(page, "toc.epub");
    const [ready] = await messages(page, "ready");
    expect(JSON.stringify(ready)).not.toMatch(/<|xhtml|href/);
  });
});

test.describe("location", () => {
  test("follows each page after ready, with the chapter the page is in", async ({ page }) => {
    await open(page, "toc.epub");
    await expect.poll(async () => (await messages(page, "location")).length).toBeGreaterThan(0);
    const order = await page.evaluate(() => window.__msgs.map((m) => m.type));
    expect(order.indexOf("location")).toBeGreaterThan(order.indexOf("ready"));
    expect((await messages(page, "location")).at(-1)).toMatchObject({ fraction: 0, tocIndex: 0 });

    let chapter = 0;
    for (let i = 0; i < 40 && chapter < 1; i++) {
      await turnAndSettle(page);
      chapter = (await where(page)).index ?? 0;
    }
    const location = (await messages(page, "location")).at(-1)!;
    const turned = (await messages(page, "turned")).at(-1)!;
    expect(location.tocIndex).toBe(2);
    expect(location.fraction).toBe(turned.fraction);
    const [ready] = await messages(page, "ready");
    const toc = ready.toc as { fraction: number | null }[];
    expect(location.fraction).toBe(toc[2].fraction);
    const at = await where(page);
    expect(location.pagesLeft).toBe(at.pages - 2 - at.page);
  });

  test("a relayout reports where the reader is, and no turn", async ({ page }) => {
    await open(page, "horizontal.epub", 0.3);
    const before = (await messages(page, "location")).length;
    await page.setViewportSize({ width: 600, height: 600 });
    await expect.poll(async () => (await messages(page, "location")).length).toBeGreaterThan(before);
    expect(await messages(page, "turned")).toEqual([]);
  });
});

for (const book of ["horizontal.epub", "vertical.epub"]) {
  test.describe(`seek in ${book}`, () => {
    test("reports one turn, and lands where reopening at that place lands", async ({ page }) => {
      await open(page, book);
      await page.evaluate(() => window.seek(0.55));
      await expect.poll(async () => (await messages(page, "turned")).length).toBe(1);
      const landed = await where(page);
      const [turned] = await messages(page, "turned");
      expect(turned.fraction as number).toBeGreaterThan(0.4);
      expect(turned.fraction as number).toBeLessThan(0.7);

      await open(page, book, turned.fraction as number);
      const back = await where(page);
      expect({ index: back.index, page: back.page }).toEqual({ index: landed.index, page: landed.page });
    });

    test("to the end shows the last page", async ({ page }) => {
      await open(page, book);
      await page.evaluate(() => window.seek(1));
      await expect.poll(async () => (await messages(page, "turned")).length).toBe(1);
      expect((await messages(page, "turned"))[0].atEnd).toBe(true);
    });

    test("seeks sent together land on the last one", async ({ page }) => {
      await open(page, book);
      await page.evaluate(() => {
        window.seek(0.2);
        window.seek(0.4);
        window.seek(0.8);
      });
      await expect
        .poll(async () => ((await messages(page, "turned")).at(-1)?.fraction as number) ?? 0)
        .toBeGreaterThan(0.7);
      await page.waitForTimeout(500);
      expect((await messages(page, "turned")).at(-1)!.fraction as number).toBeGreaterThan(0.7);
    });
  });
}

test("a seek outside 0..1 does nothing", async ({ page }) => {
  await open(page, "horizontal.epub");
  const before = await where(page);
  await page.evaluate(() => {
    window.seek(1.5);
    window.seek(Number.NaN);
    window.seek(-1);
  });
  await page.waitForTimeout(500);
  expect(await where(page)).toEqual(before);
  expect(await messages(page, "turned")).toEqual([]);
});

test.describe("activity", () => {
  test("a mouse moving over the book is reported only in full screen", async ({ page }) => {
    await open(page, "horizontal.epub");
    await page.mouse.move(400, 300);
    await page.mouse.move(420, 320);
    await page.waitForTimeout(300);
    expect(await messages(page, "activity")).toEqual([]);
    await page.evaluate(() => window.setMode(true));
    await page.waitForTimeout(300);
    await page.mouse.move(500, 300);
    await page.mouse.move(520, 320);
    await expect.poll(async () => (await messages(page, "activity")).length).toBeGreaterThan(0);
    expect((await messages(page, "activity"))[0]).toEqual({ type: "activity", kind: "pointer" });
  });
});

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

  test("a tap in the middle is reported in full screen and turns nothing", async ({ page }) => {
    await open(page, "horizontal.epub");
    await tap(page, 500);
    expect(await messages(page, "activity")).toEqual([]);
    await page.evaluate(() => window.setMode(true));
    await page.waitForTimeout(400);
    const pinned = await where(page);
    await tap(page, 500);
    expect(await messages(page, "activity")).toEqual([{ type: "activity", kind: "tap" }]);
    expect(await where(page)).toEqual(pinned);
    expect(await messages(page, "turned")).toEqual([]);
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
