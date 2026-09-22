/**
 * A citation that crosses syntax-highlighting tokens is several <mark>s.
 * jsdom lays none of this out, so the seams are measured here.
 */

import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

test("a marked run does not move the characters after it", async ({ page }) => {
  await page.goto(`${FIXTURE}#citation-seams`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "citation-seams",
  );

  const marks = page.locator("#marked mark.ask-citation-highlight");
  await expect(marks).toHaveCount(3);

  const [markedTail, plainTail] = await Promise.all([
    page.locator("#marked-tail").boundingBox(),
    page.locator("#plain-tail").boundingBox(),
  ]);
  expect(markedTail).not.toBeNull();
  expect(plainTail).not.toBeNull();
  expect(markedTail!.x).toBe(plainTail!.x);
});

test("the marks of one citation meet with no gap and no overlap", async ({
  page,
}) => {
  await page.goto(`${FIXTURE}#citation-seams`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "citation-seams",
  );

  const boxes = await page
    .locator("#marked mark.ask-citation-highlight")
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        const s = getComputedStyle(n);
        return {
          left: r.left,
          right: r.right,
          radii: [
            s.borderTopLeftRadius,
            s.borderTopRightRadius,
            s.borderBottomLeftRadius,
            s.borderBottomRightRadius,
          ],
        };
      }),
    );

  expect(boxes).toHaveLength(3);
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].left).toBeCloseTo(boxes[i - 1].right, 1);
  }
  // Only the two outer edges of the run are rounded.
  expect(boxes[0].radii[1]).toBe("0px");
  expect(boxes[1].radii.every((r) => r === "0px")).toBe(true);
  expect(boxes[2].radii[0]).toBe("0px");
});
