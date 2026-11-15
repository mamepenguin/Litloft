/**
 * SPEC-CORE-108 step 4 placement, measured at 375px (spec §10): the
 * name-in-use line sits under the input's row inside the viewport, with no
 * horizontal scroll, in `CollectionPicker` and the collection page title.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const NAME_IN_USE = "A collection with this name already exists";
const COLLECTION = "Lecture recordings and papers from one long running research project";

let run = 0;

async function open(page: Page, id: string): Promise<void> {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${FIXTURE}?run=${++run}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

interface Placement {
  line: Box;
  row: Box;
  fontSize: string;
  viewport: number;
  scrollWidth: number;
  clientWidth: number;
}

function measure(page: Page, rowHolds: string | null): Promise<Placement> {
  return page.evaluate(
    ({ text, rowHolds: holds }) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width };
      };
      const input = document.querySelector<HTMLInputElement>('input[aria-invalid="true"]')!;
      const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const line = ids
        .map((id) => document.getElementById(id))
        .find((el) => el && (el.textContent ?? "").includes(text))!;
      let row: HTMLElement = input;
      if (holds) {
        while (row.parentElement && ![...row.querySelectorAll("button")].some((b) => b.textContent?.trim() === holds)) {
          row = row.parentElement;
        }
      }
      return {
        line: box(line),
        row: box(row),
        fontSize: getComputedStyle(line).fontSize,
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    },
    { text: NAME_IN_USE, rowHolds },
  );
}

function expectUnderRow(m: Placement) {
  expect(m.fontSize).toBe("12px");
  expect(m.line.top).toBeGreaterThanOrEqual(m.row.bottom - 0.5);
  expect(m.line.left).toBeGreaterThanOrEqual(m.row.left - 0.5);
  expect(m.line.right).toBeLessThanOrEqual(m.row.right + 0.5);
  expect(Math.abs(m.line.width - m.row.width)).toBeLessThanOrEqual(1);
  expect(m.line.left).toBeGreaterThanOrEqual(0);
  expect(m.line.right).toBeLessThanOrEqual(m.viewport);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
}

test("SPEC-CORE-108 the CollectionPicker line sits under the input and Create row at 375px", async ({ page }) => {
  await open(page, "name-in-use-picker");
  await page.getByText("New collection", { exact: true }).click();
  await page.getByPlaceholder("New collection name...").fill("Trip");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(NAME_IN_USE)).toBeVisible();

  expectUnderRow(await measure(page, "Create"));
});

test("SPEC-CORE-108 the collection page title line sits under the title input at 375px", async ({ page }) => {
  await open(page, "name-in-use-title");
  await page.getByRole("button", { name: COLLECTION, exact: true }).click();
  // A handle, not a locator on the value: the value is what is about to change.
  const input = (await page.locator(`input[value="${COLLECTION}"]`).elementHandle())!;
  await input.fill("Trip");
  await input.press("Enter");
  await expect(page.getByText(NAME_IN_USE)).toBeVisible();

  expectUnderRow(await measure(page, null));
});
