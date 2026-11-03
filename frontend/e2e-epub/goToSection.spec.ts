import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __msgs: { type: string; [key: string]: unknown }[];
    goToSection: (section: unknown) => void;
  }
}

const origin = () => process.env.EPUB_E2E_ORIGIN!;
const SETTLE_MS = 700;

/**
 * `s` is the reader's own 0-based section index, as the host fixture has
 * always passed it. The app's `?section=` is 1-based and `useEpubReader`
 * subtracts one before it posts `open`.
 */
async function open(page: Page, book: string, query = "") {
  await page.goto(`${origin()}/host.html?book=${book}${query}`);
  await page.waitForFunction(() =>
    window.__msgs.some((m) => m.type === "ready" || m.type === "error"),
  );
  await page.waitForTimeout(SETTLE_MS);
}

function messages(page: Page, type: string) {
  return page.evaluate(
    (t) => window.__msgs.filter((m) => m.type === t),
    type,
  );
}

function where(page: Page) {
  return page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement)
      .contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      lastLocation?: { section?: { current: number } };
      renderer: { page: number };
    };
    return { index: view.lastLocation?.section?.current, page: view.renderer.page };
  });
}

function shownHeading(page: Page) {
  return page.evaluate(() => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement)
      .contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      renderer: { getContents(): { doc: Document }[] };
    };
    return view.renderer.getContents()[0]?.doc.querySelector("h1")?.textContent ?? null;
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

async function goToSection(page: Page, section: unknown) {
  await page.evaluate((s) => window.goToSection(s), section);
  await page.waitForTimeout(SETTLE_MS);
}

test.describe("goToSection", () => {
  test("moves to the start of the section, forwards and back", async ({ page }) => {
    await open(page, "horizontal.epub");
    expect((await where(page)).index).toBe(0);

    await goToSection(page, 3);
    const moved = await where(page);
    expect(moved).toEqual({ index: 2, page: 1 });
    expect(await shownHeading(page)).toBe("Chapter 3");

    await goToSection(page, 1);
    expect(await where(page)).toEqual({ index: 0, page: 1 });
    expect(await shownHeading(page)).toBe("Chapter 1");
  });

  test("lands where opening at that section lands", async ({ page }) => {
    await open(page, "horizontal.epub");
    await goToSection(page, 3);
    const moved = await where(page);
    const heading = await shownHeading(page);

    // The app sends the 1-based section minus one as `open`'s index.
    await open(page, "horizontal.epub", "&s=2");
    expect(await where(page)).toEqual(moved);
    expect(await shownHeading(page)).toBe(heading);
  });

  test("counts the sections the way ?section= does, skipping a spine entry with no item", async ({
    page,
  }) => {
    await open(page, "dangling.epub");
    await goToSection(page, 2);
    expect((await where(page)).index).toBe(1);
    expect(await shownHeading(page)).toBe("Chapter 2");

    await open(page, "dangling.epub", "&s=1");
    expect(await shownHeading(page)).toBe("Chapter 2");
  });

  test("reports no turn, so it writes no reading progress", async ({ page }) => {
    await open(page, "horizontal.epub");
    await goToSection(page, 2);

    expect((await where(page)).index).toBe(1);
    expect(await messages(page, "turned")).toEqual([]);
  });

  for (const section of [0, -1, 6, 1.5, "3", null]) {
    test(`goToSection(${JSON.stringify(section)}) does nothing and logs nothing`, async ({
      page,
    }) => {
      await open(page, "horizontal.epub", "&f=0.5");
      const before = await where(page);
      // Only what the command causes: opening logs the policy probe's
      // refusal.
      const errors = recordErrors(page);

      await goToSection(page, section);

      expect(await where(page)).toEqual(before);
      expect(await messages(page, "turned")).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
