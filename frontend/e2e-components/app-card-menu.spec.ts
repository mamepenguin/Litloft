/**
 * The app cards' file menu in a real browser: the selection styles a long
 * press must not reach, and the press that opens the menu without opening the
 * card.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

async function open(page: Page): Promise<void> {
  await page.goto(`${FIXTURE}#app-card-menu`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.getByText("A video card")).toBeVisible();
}

function card(page: Page, title: string) {
  return page.getByText(title).locator("xpath=ancestor::a[1]");
}

async function touch(page: Page, selector: string, type: string, x: number, y: number) {
  await page.evaluate(
    ([selector, type, x, y]) => {
      const el = document.querySelector(selector) as HTMLElement;
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === "touchend" ? [] : [touch],
          targetTouches: type === "touchend" ? [] : [touch],
          changedTouches: [touch],
        }),
      );
    },
    [selector, type, x, y] as const,
  );
}

test("I2 the card stops text selection and the platform callout", async ({ page }) => {
  await open(page);
  const video = card(page, "A video card");
  const reading = card(page, "A reading card");

  for (const element of [video, reading]) {
    const styles = await element.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        userSelect: computed.userSelect,
        callout: computed.getPropertyValue("-webkit-touch-callout"),
      };
    });
    expect(styles.userSelect).toBe("none");
    if (styles.callout !== "") expect(styles.callout).toBe("none");
  }
});

test("I2 a 500 ms press opens the menu and does not open the card; a moving press opens nothing", async ({
  page,
}) => {
  await open(page);
  const video = card(page, "A video card");
  const selector = await video.evaluate((el) => {
    el.setAttribute("data-probe", "video");
    return "[data-probe=video]";
  });

  await touch(page, selector, "touchstart", 20, 20);
  await page.waitForTimeout(400);
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await expect(page.getByRole("menuitem").first()).toBeVisible({ timeout: 1000 });

  const cancelled = await page.evaluate((selector) => {
    const el = document.querySelector(selector) as HTMLElement;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    return !el.dispatchEvent(click);
  }, selector);
  expect(cancelled).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);

  await touch(page, selector, "touchstart", 20, 20);
  await touch(page, selector, "touchmove", 80, 20);
  await touch(page, selector, "touchend", 80, 20);
  await page.waitForTimeout(600);
  await expect(page.getByRole("menuitem")).toHaveCount(0);
});
