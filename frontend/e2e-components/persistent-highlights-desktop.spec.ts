/**
 * SPEC-CORE-053 / SPEC-CORE-052: the parts of persistent highlights that need
 * a layout engine and a real selection. The fixture arrangement
 * `persistent-highlights` does not exist yet; it must render, in the same
 * page, with the real components and the real quote button slot:
 *   - `?doc=pdf`   a PdfPreview of a 3-page text PDF (inline), with a button
 *                  that opens PdfFullscreenViewer, and zoom in / out buttons;
 *   - `?doc=markdown` a MarkdownPreview of "Alpha Beta Gamma Beta" plus an
 *                  in-file find box wired to useFindMarksIn;
 *   - a stand-in for the Knowledge quote button (`[data-testid=quote-button]`)
 *     mounted the way the knowledge-edit slot mounts it;
 *   - `?profile=none|alice` choosing the store; both inside
 *     HighlightFileContext.Provider value="fixture-file".
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
let run = 0;

async function open(page: Page, doc: "pdf" | "markdown", profile = "none") {
  await page.goto(
    `${FIXTURE}?arrangement=persistent-highlights&doc=${doc}&profile=${profile}&run=${++run}`,
  );
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "persistent-highlights");
}

async function selectText(page: Page, text: string, nth = 0) {
  await page.evaluate(
    ({ text, nth }) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) nodes.push(node);
      const joined = nodes.map((entry) => entry.data).join("");

      let at = -1;
      let from = 0;
      for (let seen = 0; seen <= nth; seen += 1) {
        at = joined.indexOf(text, from);
        if (at < 0) throw new Error("text not found");
        from = at + 1;
      }

      const locate = (offset: number, start: boolean): [Text, number] => {
        let consumed = 0;
        for (const entry of nodes) {
          const next = consumed + entry.data.length;
          if (start ? offset < next : offset <= next) {
            return [entry, offset - consumed];
          }
          consumed = next;
        }
        const last = nodes[nodes.length - 1];
        return [last, last.data.length];
      };

      const [startNode, startOffset] = locate(at, true);
      const [endNode, endOffset] = locate(at + text.length, false);
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    },
    { text, nth },
  );
}

test("a PDF highlight is drawn again after zoom rebuilds the text layer (I5, SPEC-CORE-053)", async ({ page }) => {
  await open(page, "pdf");
  await selectText(page, "Quarterly");
  await page.getByRole("button", { name: "Highlight" }).click();
  await expect(page.locator(".highlight-mark")).toHaveText("Quarterly");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".highlight-mark")).toHaveText("Quarterly");
});

test("a PDF highlight is drawn only on its own page (I5, SPEC-CORE-053)", async ({ page }) => {
  await open(page, "pdf");
  await selectText(page, "Quarterly");
  await page.getByRole("button", { name: "Highlight" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator(".highlight-mark")).toHaveCount(0);
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.locator(".highlight-mark")).toHaveCount(1);
});

test("a save in the inline viewer is visible in full screen at once (SPEC-CORE-053)", async ({ page }) => {
  await open(page, "pdf");
  await selectText(page, "Quarterly");
  await page.getByRole("button", { name: "Highlight" }).click();
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.locator(".highlight-mark")).toHaveText("Quarterly");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".highlight-mark")).toHaveText("Quarterly");
});

test("a selection spanning pages is cut to the page where it starts (SPEC-CORE-053)", async ({ page }) => {
  await open(page, "pdf", "alice");
  const posted = page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/highlights"));
  await page.evaluate(() => {
    const layers = document.querySelectorAll(".textLayer");
    const range = document.createRange();
    range.setStart(layers[0].firstChild!.firstChild!, 0);
    range.setEnd(layers[1].lastChild!.firstChild!, 3);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.getByRole("button", { name: "Highlight" }).click();
  const body = (await posted).postDataJSON();
  expect(body.page).toBe(1);
});

test("clicking a mark offers Remove for the newest covering highlight, then the older (SPEC-CORE-053)", async ({ page }) => {
  await open(page, "markdown");
  await selectText(page, "Alpha Beta");
  await page.getByRole("button", { name: "Highlight" }).click();
  await selectText(page, "Beta Gamma");
  await page.getByRole("button", { name: "Highlight" }).click();
  const overlap = page.locator(".highlight-mark", { hasText: "Beta" }).first();
  await overlap.click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".highlight-mark")).toContainText(["Alpha Beta"]);
  await page.locator(".highlight-mark").first().click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".highlight-mark")).toHaveCount(0);
});

test("find marks drawn over a highlight stay visible, and a click on one reaches the highlight (I9, SPEC-CORE-053)", async ({ page }) => {
  await open(page, "markdown");
  await selectText(page, "Gamma");
  await page.getByRole("button", { name: "Highlight" }).click();
  await page.getByRole("textbox", { name: "Find" }).fill("Gamma");
  await expect(page.locator(".find-mark")).toHaveCount(1);
  await expect(page.locator(".highlight-mark")).toHaveCount(1);
  await page.locator(".find-mark").click();
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();
  await page.getByRole("textbox", { name: "Find" }).fill("");
  await expect(page.locator(".highlight-mark")).toHaveCount(1);
});

test("the Highlight control neither covers nor hides the quote button (I9, SPEC-CORE-053)", async ({ page }) => {
  await open(page, "markdown");
  await selectText(page, "Gamma");
  const quote = page.getByTestId("quote-button");
  const add = page.getByRole("button", { name: "Highlight" });
  await expect(quote).toBeVisible();
  await expect(add).toBeVisible();
  const a = (await quote.boundingBox())!;
  const b = (await add.boundingBox())!;
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlap).toBe(false);
});

test("a re-rendered Markdown preview recomputes its marks (SPEC-CORE-053)", async ({ page }) => {
  await open(page, "markdown");
  await selectText(page, "Gamma");
  await page.getByRole("button", { name: "Highlight" }).click();
  await page.getByRole("button", { name: "Edit source" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator(".highlight-mark")).toHaveText("Gamma");
});

test("a mouse drag that starts inside a mark selects and offers Highlight (SPEC-CORE-053)", async ({ page }) => {
  await open(page, "markdown");
  await selectText(page, "Alpha");
  await page.getByRole("button", { name: "Highlight" }).click();
  const mark = page.locator(".highlight-mark").first();
  const from = await mark.boundingBox();
  const target = await page.getByText("Gamma").first().boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width, target!.y + target!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Highlight" })).toBeVisible();
});
