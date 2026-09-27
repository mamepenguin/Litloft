/**
 * The reader's bar and panels as the real stylesheet lays them out, in the
 * preview harness (the real `FilePreview`).
 */

import { test, expect, type Page } from "@playwright/test";

const origin = () => process.env.EPUB_E2E_ORIGIN!;

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${origin()}/preview/index.html?book=horizontal`);
  await expect(page.getByRole("slider")).toBeEnabled();
}

function barRows(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector("[data-player-scrub]")!;
    const line = document.querySelector('[data-testid="epub-position-line"]')!.parentElement!;
    const knob = document.querySelector('[data-testid="epub-position-knob"]');
    const fill = document.querySelector('[data-testid="epub-position-fill"]');
    return {
      scrub: row.getBoundingClientRect().height,
      controls: line.getBoundingClientRect().height,
      frame: document.querySelector('[data-testid="epub-frame"]')!.getBoundingClientRect().height,
      knobOpacity: knob ? getComputedStyle(knob).opacity : null,
      fill: fill ? getComputedStyle(fill).backgroundColor : null,
    };
  });
}

function accent(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  });
}

test("the slider is quiet at rest and shows its thumb on hover and while dragging, at the same bar height", async ({
  page,
  browserName,
}) => {
  await open(page, 1000);
  const rest = await barRows(page);
  expect(rest.scrub).toBe(20);
  expect(rest.controls).toBe(40);
  expect(rest.knobOpacity).toBe("0");
  expect(rest.fill).toBe(
    await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--warm-silver").trim();
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    }),
  );

  const row = (await page.locator("[data-player-scrub]").boundingBox())!;
  await page.mouse.move(row.x + row.width * 0.5, row.y + row.height / 2);
  await page.waitForTimeout(250);
  const hover = await barRows(page);
  // The fixture stylesheet is compiled without optimisation, so hover rules
  // stay nested in `@media (hover: hover)`, which WebKit does not apply there;
  // the app's optimised build flattens them.
  if (browserName !== "webkit") {
    expect(hover.knobOpacity).toBe("1");
    expect(hover.fill).toBe(await accent(page));
  }
  expect([hover.scrub, hover.controls, hover.frame]).toEqual([rest.scrub, rest.controls, rest.frame]);

  await page.mouse.down();
  await page.mouse.move(row.x + row.width * 0.98, row.y + row.height / 2);
  const bubble = (await page.getByTestId("epub-position-bubble").boundingBox())!;
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(row.x + row.width + 0.5);
  const drag = await barRows(page);
  expect([drag.scrub, drag.controls, drag.frame]).toEqual([rest.scrub, rest.controls, rest.frame]);
  await page.mouse.up();
  await expect(page.getByTestId("epub-position-bubble")).toHaveCount(0);
});

for (const [width, shape] of [
  [1000, "popover"],
  [390, "sheet"],
] as const) {
  test(`at ${width}px the text settings open as a ${shape}`, async ({ page }) => {
    await open(page, width);
    await page.getByRole("button", { name: "Text settings" }).click();
    const panel = (await page.getByTestId("epub-typography-panel").boundingBox())!;
    const frame = (await page.getByTestId("epub-frame").boundingBox())!;
    const bar = (await page.getByTestId("epub-position-bar").boundingBox())!;
    if (shape === "popover") {
      expect(panel.width).toBe(320);
      expect(panel.x).toBe(frame.x + 8);
      expect(bar.y - (panel.y + panel.height)).toBe(8);
    } else {
      expect(panel.width).toBe(frame.width);
      expect(panel.x).toBe(frame.x);
      expect(panel.y + panel.height).toBe(bar.y);
    }
  });
}

test("inline, the full-screen button is in the bar and nothing lies over the book", async ({ page }) => {
  await open(page, 1000);
  const button = (await page.getByRole("button", { name: "Read full screen" }).boundingBox())!;
  const bar = (await page.locator("[data-player-scrub]").boundingBox())!;
  expect(button.y).toBeGreaterThan(bar.y);
  const overBook = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="epub-frame"] iframe')!.getBoundingClientRect();
    return document.elementFromPoint(frame.right - 12, frame.top + 12)?.tagName;
  });
  expect(overBook).toBe("IFRAME");
});

test("a keyboard focus on the slider shows the thumb and the focus ring", async ({ page }) => {
  await open(page, 1000);
  await page.getByRole("slider").focus();
  const m = await page.evaluate(() => ({
    knob: getComputedStyle(document.querySelector('[data-testid="epub-position-knob"]')!).opacity,
    ring: getComputedStyle(document.querySelector('[data-testid="epub-position-fill"]')!.parentElement!).boxShadow,
    fill: getComputedStyle(document.querySelector('[data-testid="epub-position-fill"]')!).backgroundColor,
  }));
  expect(m.knob).toBe("1");
  expect(m.ring).not.toBe("none");
  expect(m.fill).toBe(await accent(page));
});

for (const [width, shape] of [
  [1000, "popover"],
  [390, "sheet"],
] as const) {
  test(`in full screen at ${width}px the text settings open as a ${shape} above the bar`, async ({ page }) => {
    await open(page, width);
    await page.getByRole("button", { name: "Read full screen" }).click();
    await expect(page.getByTestId("epub-chrome-bottom")).toBeVisible();
    await page.getByRole("button", { name: "Text settings" }).click();
    const panel = (await page.getByTestId("epub-typography-panel").boundingBox())!;
    const chrome = (await page.getByTestId("epub-chrome-bottom").boundingBox())!;
    expect(chrome.y - (panel.y + panel.height)).toBe(shape === "popover" ? 8 : 0);
  });
}

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("in full screen the text settings sheet sits on the taller bar", async ({ page, browserName }) => {
    // Playwright's desktop WebKit cannot emulate a mobile device.
    test.skip(browserName === "webkit");
    await open(page, 390);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await page.getByRole("button", { name: "Read full screen" }).click();
    await expect(page.getByTestId("epub-chrome-bottom")).toBeVisible();
    await page.getByRole("button", { name: "Text settings" }).click();
    const panel = (await page.getByTestId("epub-typography-panel").boundingBox())!;
    const chrome = (await page.getByTestId("epub-chrome-bottom").boundingBox())!;
    expect(chrome.y - (panel.y + panel.height)).toBe(0);
  });
});
