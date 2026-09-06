/**
 * The archive grid's cells, at the pages' own proportions.
 *
 * The column count used to come from viewport breakpoints
 * (`grid-cols-2 sm: md: lg: xl:`) while the grid renders beside a 384px
 * inspector — it was counting columns for a width it does not have. A
 * justified row has no column count at all, which is why the rule it
 * broke is gone rather than corrected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ArchiveEntryGrid } from "../ArchiveEntryGrid";
import {
  NON_IMAGE_RATIO,
  UNMEASURED_PAGE_RATIO,
} from "../ArchiveEntryCard";
import type { ArchiveEntry } from "@/types";

vi.mock("@/lib/api", () => ({
  getArchiveEntryUrl: (fileId: string, path: string) =>
    `/api/files/${fileId}/archive/entry?path=${encodeURIComponent(path)}`,
}));

vi.mock("../../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

/** Reports every observed element as already in view. */
class ImmediateIntersectionObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb(
      [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}

function entry(path: string, overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  const is_dir = path.endsWith("/");
  return {
    path,
    filename: is_dir ? path.slice(0, -1).split("/").pop()! : path.split("/").pop()!,
    file_size: 1024,
    compressed_size: 512,
    file_type: "other",
    mime_type: "",
    is_dir,
    ...overrides,
  };
}

const pages = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    entry(`page-${i}.jpg`, { file_type: "image", mime_type: "image/jpeg" }),
  );

function renderGrid(entries: ArchiveEntry[]) {
  return render(
    <ArchiveEntryGrid
      entries={entries}
      fileId="file-1"
      handleDirClick={vi.fn()}
      handleFileClick={vi.fn()}
      isClickable={() => true}
    />,
  );
}

const cells = (c: HTMLElement) => c.querySelectorAll(".justified-grid-cell");
const ratioOf = (el: Element) =>
  Number((el as HTMLElement).style.getPropertyValue("--jg-ratio"));

describe("archive grid cells", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      ImmediateIntersectionObserver as unknown as typeof IntersectionObserver,
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("counts no columns of its own", () => {
    // The rule the old grid broke, asserted as its absence: `toBe(0)`,
    // over the rendered markup rather than the source, so a breakpoint
    // reintroduced anywhere under here is caught.
    const { container } = renderGrid(pages(12));
    const withColumnClass = Array.from(
      container.querySelectorAll("[class]"),
    ).filter((el) => /(^|[\s:])grid-cols-/.test(el.className.toString()));
    expect(withColumnClass).toHaveLength(0);
    // The population is not empty: something really was rendered for
    // the rule to be false of.
    expect(cells(container)).toHaveLength(12);
  });

  it("packs the level into justified rows", () => {
    const { container } = renderGrid(pages(12));
    expect(container.querySelector(".justified-grid")).not.toBeNull();
    expect(cells(container)).toHaveLength(12);
    expect(container.querySelectorAll(".justified-grid-tail")).toHaveLength(1);
  });

  it("draws an unread page at a page's proportions", () => {
    // The literal, not the constant: an expectation read out of the
    // implementation agrees with it whatever it says, and 0.7 versus a
    // square is the whole point — a square placeholder that grows taller
    // on load moves every cell after it on the row.
    const { container } = renderGrid(pages(3));
    expect(ratioOf(cells(container)[0])).toBe(0.7);
    expect(UNMEASURED_PAGE_RATIO).toBe(0.7);
  });

  it("takes the real proportions from the picture once it loads", () => {
    const { container } = renderGrid(pages(3));
    const img = container.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 1600, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 1000, configurable: true });
    fireEvent.load(img);
    expect(ratioOf(cells(container)[0])).toBe(1.6);
  });

  it("ignores a picture that reports no size", () => {
    // A decode failure reports 0x0, and `0 / 0` is `NaN`, which CSS
    // drops silently — the cell would be laid out at whatever the
    // failed `calc()` falls back to.
    const { container } = renderGrid(pages(3));
    const img = container.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 0, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 0, configurable: true });
    fireEvent.load(img);
    expect(ratioOf(cells(container)[0])).toBe(0.7);
  });

  it("keeps folders and binaries square", () => {
    const { container } = renderGrid([
      entry("src/"),
      entry("main.dart", { file_type: "other", mime_type: "text/plain" }),
    ]);
    const ratios = Array.from(cells(container)).map(ratioOf);
    expect(ratios).toHaveLength(2);
    expect(ratios).toEqual([1, 1]);
    expect(NON_IMAGE_RATIO).toBe(1);
  });
});

describe("the canvas viewer's floor", () => {
  const css = readFileSync(
    join(__dirname, "..", "..", "..", "app", "globals.css"),
    "utf8",
  );

  it("measures the canvas, not the viewport", () => {
    expect(css).toContain("min-height: max(320px, 70cqh)");
    expect(css).toMatch(
      /main\[data-canvas-floor="true"\] \{[^}]*container-type: size;/,
    );
  });
});
