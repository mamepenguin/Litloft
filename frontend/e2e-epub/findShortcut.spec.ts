import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __msgs: { type: string; [key: string]: unknown }[];
    setFindIntercept: (interceptFind: boolean) => void;
  }
}

const origin = () => process.env.EPUB_E2E_ORIGIN!;

async function open(page: Page, interceptFind: "1" | "0" | null) {
  const query = interceptFind === null ? "" : `&find=${interceptFind}`;
  await page.goto(`${origin()}/host.html?book=horizontal.epub${query}`);
  await page.waitForFunction(() =>
    window.__msgs.some((m) => m.type === "ready" || m.type === "error"),
  );
}

type Modifiers = "primary" | "other" | "primary+shift" | "primary+alt";

/**
 * Presses `f` inside the book's own document, with the modifiers named
 * relative to the frame's platform, and reports whether the reader claimed
 * the key and how many `find-shortcut` messages reached the host.
 */
async function pressF(page: Page, modifiers: Modifiers) {
  const claimed = await page.evaluate((mods) => {
    const doc = (document.getElementById("reader") as HTMLIFrameElement).contentDocument!;
    const view = doc.querySelector("foliate-view") as unknown as {
      renderer: { getContents(): { doc: Document }[] };
    };
    const section = view.renderer.getContents()[0].doc;
    const frameWindow = (document.getElementById("reader") as HTMLIFrameElement).contentWindow!;
    const mac = /Mac|iPhone|iPad|iPod/.test(frameWindow.navigator.platform);
    const primary = mac ? { metaKey: true } : { ctrlKey: true };
    const other = mac ? { ctrlKey: true } : { metaKey: true };
    const init: KeyboardEventInit = {
      key: "f",
      bubbles: true,
      cancelable: true,
      ...(mods === "primary" || mods.startsWith("primary+") ? primary : {}),
      ...(mods === "other" ? other : {}),
      ...(mods === "primary+shift" ? { shiftKey: true, key: "F" } : {}),
      ...(mods === "primary+alt" ? { altKey: true } : {}),
    };
    const e = new KeyboardEvent("keydown", init);
    section.dispatchEvent(e);
    return e.defaultPrevented;
  }, modifiers);
  await page.waitForTimeout(100);
  const posted = await page.evaluate(
    () => window.__msgs.filter((m) => m.type === "find-shortcut").length,
  );
  return { claimed, posted };
}

test.describe("SPEC-CORE-028 I7 the reader frame forwards the find shortcut only when told to", () => {
  test("with interceptFind true, the primary modifier and f is claimed and posted as find-shortcut", async ({
    page,
  }) => {
    await open(page, "1");
    expect(await pressF(page, "primary")).toEqual({ claimed: true, posted: 1 });
    expect(await messages(page)).toEqual([{ type: "find-shortcut" }]);
  });

  for (const modifiers of ["primary+shift", "primary+alt", "other"] as const) {
    test(`with interceptFind true, f with ${modifiers} is left to the browser while the primary modifier is claimed`, async ({
      page,
    }) => {
      await open(page, "1");
      expect(await pressF(page, modifiers)).toEqual({ claimed: false, posted: 0 });
      expect(await pressF(page, "primary")).toEqual({ claimed: true, posted: 1 });
    });
  }

  for (const told of ["0", null] as const) {
    test(`an open with interceptFind ${told === null ? "absent" : "false"} leaves the primary modifier and f to the browser`, async ({
      page,
    }) => {
      await open(page, told);
      expect(await pressF(page, "primary")).toEqual({ claimed: false, posted: 0 });
      await open(page, "1");
      expect(await pressF(page, "primary")).toEqual({ claimed: true, posted: 1 });
    });
  }
});

test.describe("SPEC-CORE-028 I7 set-find-intercept changes what the reader frame does with the shortcut", () => {
  test("true after an open with false makes the frame claim the shortcut", async ({ page }) => {
    await open(page, "0");
    expect(await pressF(page, "primary")).toEqual({ claimed: false, posted: 0 });

    await page.evaluate(() => window.setFindIntercept(true));

    await expect.poll(async () => (await pressF(page, "primary")).claimed).toBe(true);
    expect(await messages(page)).not.toEqual([]);
  });

  test("false after an open with true hands the shortcut back to the browser", async ({ page }) => {
    await open(page, "1");
    expect(await pressF(page, "primary")).toEqual({ claimed: true, posted: 1 });

    await page.evaluate(() => window.setFindIntercept(false));

    await expect.poll(async () => (await pressF(page, "primary")).claimed).toBe(false);
    const before = (await messages(page)).length;
    expect(await pressF(page, "primary")).toEqual({ claimed: false, posted: before });
  });
});

function messages(page: Page) {
  return page.evaluate(() => window.__msgs.filter((m) => m.type === "find-shortcut"));
}
