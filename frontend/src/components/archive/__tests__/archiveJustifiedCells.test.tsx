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
import {
  JG_FALLBACK_RATIO,
  JG_MAX_RATIO,
  JG_MIN_RATIO,
} from "@/lib/justifiedGrid";
import { MENU_SCRIM } from "@/components/DismissScrim";
import { viewerTakesCanvasFloor } from "@/lib/fileDetailShell";
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

  it("stops drawing a page shape once the picture has failed", () => {
    // `onError` swaps the picture for a 32px type icon. Leaving the cell
    // at a page's proportions gives that icon a tall portrait box on a
    // row of photographs.
    const { container } = renderGrid(pages(3));
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(ratioOf(cells(container)[0])).toBe(1);
  });

  it("stops a page whose proportions are outside the row's range", () => {
    // A zip carries whatever was put in it, and a cell's height comes
    // from this number, so a page outside the stops is a band rather
    // than a row. Inside them it is cropped by `object-fit: cover`, the
    // same trade the file grid makes for an extreme photograph.
    // Literals, not the constants, for the reason the 0.7 test gives.
    for (const [w, h, want] of [
      [12000, 1000, 3],
      [1000, 12000, 0.5],
    ] as const) {
      const { container, unmount } = renderGrid(pages(3));
      const img = container.querySelector("img")!;
      Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
      Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
      fireEvent.load(img);
      expect(ratioOf(cells(container)[0])).toBe(want);
      unmount();
    }
    // The same stops the file grid uses, not a second pair beside them.
    expect([JG_MIN_RATIO, JG_MAX_RATIO]).toEqual([0.5, 3]);
  });

  it("keeps every unmeasured stand-in inside the stops", () => {
    // `clampRatio` is on the two paths that measure a picture, and only
    // those. The other three values a cell can carry are constants, and
    // what makes "no cell is laid out outside the stops" true is that
    // each of them is written inside the range rather than clamped at
    // use. Nothing else says so, and a fourth constant added outside the
    // range would draw a band.
    for (const [name, value] of [
      ["UNMEASURED_PAGE_RATIO", UNMEASURED_PAGE_RATIO],
      ["NON_IMAGE_RATIO", NON_IMAGE_RATIO],
      ["JG_FALLBACK_RATIO", JG_FALLBACK_RATIO],
    ] as const) {
      expect(value, name).toBeGreaterThanOrEqual(JG_MIN_RATIO);
      expect(value, name).toBeLessThanOrEqual(JG_MAX_RATIO);
    }
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

  it("gives every cell a zero minimum, because the archive puts text in flow", () => {
    // The grid these replaced was `repeat(N, minmax(0, 1fr))`. A flex
    // item's automatic minimum is its min-content width instead, and an
    // archive cell carries a `truncate` — `white-space: nowrap` —
    // filename in flow, so one long name would become the cell's
    // minimum and the row would stop justifying.
    const rule = css.match(
      /\.justified-grid > \.justified-grid-cell \{([^}]*)\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/min-width:\s*0/);
  });

  it("takes its height from a measurement, not a container query", () => {
    expect(css).toContain(
      "min-height: max(320px, calc(var(--canvas-h, 0px) * 0.7))",
    );
  });

  it("stretches the viewer into the height it reserves", () => {
    // `min-height` on the wrapper alone reserves the space and stops:
    // a block box does not stretch its in-flow children, so the viewer
    // kept its content height and the reserved space became emptiness
    // inside the wrapper — the same picture as before, one element up.
    // Measuring `.media-detail-player` cannot tell the two apart, which
    // is why this pins the mechanism that carries the height down.
    const wrapper = css.match(
      /main\[data-canvas-floor="true"\] \.media-detail-player \{([^}]*)\}/,
    );
    expect(wrapper).not.toBeNull();
    expect(wrapper![1]).toMatch(/display:\s*flex/);
    expect(wrapper![1]).toMatch(/flex-direction:\s*column/);

    const child = css.match(
      /main\[data-canvas-floor="true"\] \.media-detail-player > :first-child \{([^}]*)\}/,
    );
    expect(child).not.toBeNull();
    expect(child![1]).toMatch(/flex:\s*1 1 auto/);
  });

  it("establishes no containment context on the canvas", () => {
    // The reason is not tidiness. `container-type: size` implies
    // `contain: layout`, which makes the canvas the containing block for
    // every `position: fixed` descendant — and the archive canvas holds
    // two that are not portalled: `ArchiveImageViewer`'s full-screen
    // page-turner and the toolbar's overflow backdrop. Under containment
    // the page-turner covers the column instead of the viewport, cannot
    // rise above the header, and scrolls away, while `useInertBackdrop`
    // has already made everything behind it unclickable.
    const floorRules = [
      ...css.matchAll(/main\[data-canvas-floor="true"\][^{]*\{([^}]*)\}/g),
    ];
    expect(floorRules.length).toBeGreaterThan(0);
    for (const [, body] of floorRules) {
      expect(body).not.toMatch(/container-type/);
      expect(body).not.toMatch(/\bcontain\s*:/);
    }
  });

  it("keeps the unportalled fixed overlays that the containment would have caught", () => {
    // The population the rule above protects. If either of these is ever
    // portalled or stops being `fixed`, this test says so — and the
    // containment answer becomes available again.
    //
    // The toolbar's is one step away now: it renders `DismissScrim` with
    // no `className`, so the box is `MENU_SCRIM`'s. Both halves are
    // asserted — the default being `fixed inset-0` says nothing if the
    // toolbar has started passing a box of its own, and the toolbar
    // taking the default says nothing if the default has moved.
    const viewer = readFileSync(
      join(__dirname, "..", "ArchiveImageViewer.tsx"),
      "utf8",
    );
    const toolbar = readFileSync(join(__dirname, "..", "ArchiveToolbar.tsx"), "utf8");
    const scrim = readFileSync(
      join(__dirname, "..", "..", "DismissScrim.tsx"),
      "utf8",
    );
    expect(viewer).toMatch(/fixed inset-0/);
    expect(MENU_SCRIM).toMatch(/\bfixed inset-0\b/);
    expect(toolbar).toMatch(/<DismissScrim onDismiss=\{closeMore\} \/>/);
    expect(viewer).not.toMatch(/createPortal/);
    // The scrim is written where it is used for exactly this reason: a
    // portal would leave the canvas and the rule above would stop
    // protecting anything.
    expect(scrim).not.toMatch(/createPortal/);
  });
});

describe("which viewers get a floor", () => {
  it("names them, rather than matching a mime prefix", () => {
    // `startsWith("text/")` was unreachable *and* a trap: it also
    // matches `text/html`, which is rendered in a sandboxed
    // (opaque-origin) iframe.
    expect(viewerTakesCanvasFloor("archive", "application/zip")).toBe(true);
    expect(viewerTakesCanvasFloor("document", "application/pdf")).toBe(true);
    expect(viewerTakesCanvasFloor("document", "text/html")).toBe(false);
    expect(viewerTakesCanvasFloor("document", "text/plain")).toBe(false);
    expect(viewerTakesCanvasFloor("document", "text/markdown")).toBe(false);
    expect(viewerTakesCanvasFloor("image", "image/jpeg")).toBe(false);
    expect(viewerTakesCanvasFloor("video", "video/mp4")).toBe(false);
    expect(viewerTakesCanvasFloor("audio", "audio/mpeg")).toBe(false);
  });
});
