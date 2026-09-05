import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

/**
 * The tree toggle sits at the same height in folder, file and search mode.
 *
 * `FolderBrowser` states this in a comment, and it is the reason `PageHeader`
 * carries the padding it does. But the property lives in three files and is
 * arithmetic, not a class anyone can point at — so it was true by coincidence
 * and could be broken from any of the three with the whole suite green.
 * Changing the title row's `items-start` to `items-center` drops the toggle
 * about 12px in search mode, where the row is two lines tall, and nothing
 * failed.
 *
 * jsdom does not lay out, so the centres cannot be measured. What can be done
 * is what `inspectorThresholdParity.test.ts` does for the inspector's widths:
 * bind the numbers the claim rests on, in one place, so that changing any of
 * them fails here and the reader is sent to the arithmetic rather than to a
 * pixel.
 *
 *   file detail  `h-12` (48px) + `items-center`      → centre at 24px
 *   page header  `py-2` (8px) + `items-start`, and
 *                a `h-8` (32px) toggle               → centre at 8 + 16 = 24px
 *
 * `items-start` is the load-bearing half: with `items-center` the toggle
 * centres against a row whose height depends on how many lines the title and
 * scope take, which is not 24px and is not even constant.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf-8");

/** Tailwind spacing is 0.25rem per step, at a 16px root. */
const STEP_PX = 4;
const px = (n: number) => n * STEP_PX;

describe("the tree toggle lands at the same height in every mode", () => {
  it("gives the file detail row a fixed height and centres in it", () => {
    const chrome = read("components/FileDetail/FileDetailChrome.tsx");
    expect(chrome).toContain("h-12");
    expect(chrome).toContain("items-center");
  });

  it("starts the page header's subject row rather than centring it", () => {
    const header = read("components/PageHeader.tsx");
    // Both rows: the trail centres (one line, nothing to align against), the
    // subject row starts (two lines, and the toggle belongs against the first).
    expect(header).toContain('className="flex min-w-0 items-start gap-2"');
    expect(header).toContain('className="flex min-w-0 items-center gap-2"');
    expect(header).toContain("px-4 py-2");
  });

  it("keeps the toggle the height the arithmetic assumes", () => {
    expect(read("components/TreeToggle.tsx")).toContain("h-8");
  });

  // The arithmetic itself. If any of the three numbers above moves, this is
  // the line that says what it was for.
  it("puts both centres at the same offset", () => {
    const fileDetailRowHeight = px(12); // h-12
    const fileDetailCentre = fileDetailRowHeight / 2;

    const headerPaddingTop = px(2); // py-2
    const toggleHeight = px(8); // h-8
    const headerCentre = headerPaddingTop + toggleHeight / 2;

    expect(headerCentre).toBe(fileDetailCentre);
    expect(headerCentre).toBe(24);
  });
});
