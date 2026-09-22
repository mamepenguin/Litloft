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

test("only the outer edges of a citation in code are rounded", async ({
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
        const s = getComputedStyle(n);
        return {
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
  expect(boxes[0].radii[0]).not.toBe("0px");
  expect(boxes[0].radii[1]).toBe("0px");
  expect(boxes[1].radii.every((r) => r === "0px")).toBe(true);
  expect(boxes[2].radii[0]).toBe("0px");
  expect(boxes[2].radii[1]).not.toBe("0px");
});

test("a passage in a note draws one shape however many elements it spans", async ({
  page,
}) => {
  await page.goto(`${FIXTURE}#citation-seams-prose`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "citation-seams-prose",
  );

  await expect(page.locator("#split mark.ask-citation-highlight")).toHaveCount(3);
  await expect(page.locator("#whole mark.ask-citation-highlight")).toHaveCount(1);

  const [splitTail, wholeTail] = await Promise.all([
    page.locator("#split-tail").boundingBox(),
    page.locator("#whole-tail").boundingBox(),
  ]);
  expect(splitTail).not.toBeNull();
  expect(wholeTail).not.toBeNull();
  expect(splitTail!.x).toBe(wholeTail!.x);
});

test("a passage in a note keeps its outer padding and corners", async ({ page }) => {
  await page.goto(`${FIXTURE}#citation-seams-prose`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    "citation-seams-prose",
  );

  const edges = await page
    .locator("#split mark.ask-citation-highlight")
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const s = getComputedStyle(n);
        return {
          seam: (n as HTMLElement).dataset.citationSeam,
          padLeft: s.paddingLeft,
          padRight: s.paddingRight,
          topLeft: s.borderTopLeftRadius,
          topRight: s.borderTopRightRadius,
        };
      }),
    );

  expect(edges.map((e) => e.seam)).toEqual(["start", "mid", "end"]);

  // The run's two outer edges are the shape; everything between them is not.
  expect(edges[0].padLeft).not.toBe("0px");
  expect(edges[0].topLeft).not.toBe("0px");
  expect(edges[2].padRight).not.toBe("0px");
  expect(edges[2].topRight).not.toBe("0px");

  expect(edges[0].padRight).toBe("0px");
  expect(edges[0].topRight).toBe("0px");
  expect(edges[1].padLeft).toBe("0px");
  expect(edges[1].padRight).toBe("0px");
  expect(edges[2].padLeft).toBe("0px");
  expect(edges[2].topLeft).toBe("0px");
});
