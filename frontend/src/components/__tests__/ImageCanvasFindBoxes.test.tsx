import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FindProvider } from "@/components/FileDetail/find/FindContext";
import type { FindContextValue, FindStatus } from "@/components/FileDetail/find/types";
import { ImageCanvas } from "@/components/ImageCanvas";
import type { FindRow } from "@/lib/fileFind";
import type { FileItem } from "@/types";

const TERM = "needle";

type BoxRow = FindRow & { boxes?: unknown };

const Q1 = [0.1, 0.2, 0.4, 0.2, 0.4, 0.3, 0.1, 0.3];
const Q2 = [0.5, 0.1, 0.7, 0.1, 0.7, 0.2, 0.5, 0.2];
const Q3 = [0.2, 0.6, 0.8, 0.6, 0.8, 0.9, 0.2, 0.9];

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const DEFAULT_BOX: Box = { left: 0, top: 0, width: 300, height: 300 };

function makeRect(box: Box): DOMRect {
  return {
    x: box.left,
    y: box.top,
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    right: box.left + box.width,
    bottom: box.top + box.height,
    toJSON: () => box,
  } as DOMRect;
}

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    title: "photo",
    file_type: "image",
    mime_type: "image/jpeg",
    has_thumbnail: true,
    image_width: 400,
    image_height: 300,
    ...overrides,
  } as FileItem;
}

function pictureRow(overrides: Partial<BoxRow> = {}): BoxRow {
  return {
    kind: "picture_text",
    ordinal: 1,
    snippet: `alpha ${TERM} bravo`,
    match_start: "alpha ".length,
    match_length: TERM.length,
    ...overrides,
  };
}

function findValue(
  rows: BoxRow[],
  currentRow: BoxRow | null,
  overrides: Partial<FindContextValue> = {},
): FindContextValue {
  const answer = {
    query: TERM,
    indexed: true,
    total: rows.length,
    truncated: false,
    rows: rows as FindRow[],
  };
  const noop = () => {};
  return {
    enabled: true,
    shortcutEnabled: true,
    open: true,
    query: TERM,
    status: { kind: "hits", answer },
    filter: "all",
    rows: rows as FindRow[],
    visibleRows: rows as FindRow[],
    currentRow: currentRow as FindRow | null,
    currentIndex: 0,
    truncated: false,
    focusNonce: 0,
    selectRequest: null,
    openFind: noop,
    closeFind: noop,
    openFindByShortcut: () => false,
    changeQuery: noop,
    commitQuery: noop,
    compositionStart: noop,
    compositionEnd: noop,
    keyDown: noop,
    step: noop,
    selectRow: noop,
    selectFilter: noop,
    retry: noop,
    reportTab: noop,
    registerUrlStrip: noop,
    ...overrides,
  };
}

let decodeResolves: boolean;
let originalDecode: typeof HTMLImageElement.prototype.decode;

beforeEach(() => {
  decodeResolves = true;
  originalDecode = HTMLImageElement.prototype.decode;
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () =>
      decodeResolves ? Promise.resolve() : new Promise<void>(() => {}),
  });
});

afterEach(() => {
  cleanup();
  if (originalDecode) HTMLImageElement.prototype.decode = originalDecode;
  else delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  vi.unstubAllGlobals();
});

function stubPicture(
  img: HTMLElement,
  {
    naturalWidth = 400,
    naturalHeight = 300,
    box = DEFAULT_BOX,
  }: { naturalWidth?: number; naturalHeight?: number; box?: Box } = {},
) {
  Object.defineProperty(img, "naturalWidth", {
    configurable: true,
    value: naturalWidth,
  });
  Object.defineProperty(img, "naturalHeight", {
    configurable: true,
    value: naturalHeight,
  });
  img.getBoundingClientRect = () => makeRect(box);
}

async function paint(img: HTMLElement) {
  await act(async () => {
    fireEvent.load(img);
  });
}

async function renderPicture(
  value: FindContextValue,
  file: FileItem = makeFile(),
  size: { naturalWidth?: number; naturalHeight?: number; box?: Box } = {},
) {
  const view = render(
    <FindProvider value={value}>
      <ImageCanvas file={file} />
    </FindProvider>,
  );
  stubPicture(screen.getByRole("img"), size);
  return view;
}

const layer = () => document.querySelector("[data-find-boxes]");
const polygons = () =>
  Array.from(document.querySelectorAll("[data-find-box]")).map((node) => ({
    kind: node.getAttribute("data-find-box"),
    points: (node.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number)),
  }));

function expectPx(value: string, expected: number) {
  expect(value.endsWith("px")).toBe(true);
  expect(Math.abs(Number.parseFloat(value) - expected)).toBeLessThanOrEqual(0.6);
}

const pointsOf = (quad: number[]) => {
  const out: number[][] = [];
  for (let i = 0; i < quad.length; i += 2) out.push([quad[i], quad[i + 1]]);
  return out;
};

describe("SPEC-CORE-051 I9 one outline per distinct quad of the rows that have boxes", () => {
  it("draws every distinct quad once, shared quads current when the current row has them, marks before current", async () => {
    const first = pictureRow({ ordinal: 1, boxes: [Q1, Q2, Q3] });
    const second = pictureRow({ ordinal: 2, boxes: [Q2] });
    const view = await renderPicture(findValue([first, second], second));

    await paint(screen.getByRole("img"));

    expect(layer()).not.toBeNull();
    const drawn = polygons();
    expect(drawn).toHaveLength(3);
    expect(drawn.map((entry) => entry.kind)).toEqual(["mark", "mark", "current"]);
    expect(drawn.map((entry) => entry.points)).toEqual([
      pointsOf(Q1),
      pointsOf(Q3),
      pointsOf(Q2),
    ]);

    // Re-rendering the same rows must not add a second copy of a shared quad.
    view.rerender(
      <FindProvider value={findValue([first, second], first)}>
        <ImageCanvas file={makeFile()} />
      </FindProvider>,
    );
    expect(polygons()).toHaveLength(3);
    expect(polygons().map((entry) => entry.kind)).toEqual([
      "current",
      "current",
      "current",
    ]);
  });

  it("draws a malformed row as nothing while another row still draws", async () => {
    const bad = pictureRow({ ordinal: 1, boxes: [[0.1, 0.2, 0.3]] });
    const good = pictureRow({ ordinal: 2, boxes: [Q1] });
    await renderPicture(findValue([bad, good], good));

    await paint(screen.getByRole("img"));

    expect(polygons().map((entry) => entry.points)).toEqual([pointsOf(Q1)]);
  });

  it.each([
    { name: "no row has boxes", rows: [pictureRow({ boxes: undefined })] },
    { name: "a row has an empty list", rows: [pictureRow({ boxes: [] })] },
    { name: "a row has null", rows: [pictureRow({ boxes: null })] },
  ])("renders no layer and leaves the picture span unchanged when $name", async ({ rows }) => {
    const control = await renderPicture(
      findValue([pictureRow({ boxes: [Q1] })], null),
    );
    await paint(screen.getByRole("img"));
    expect(layer()).not.toBeNull();
    control.unmount();

    const without = await renderPicture(findValue([pictureRow()], null));
    await paint(screen.getByRole("img"));
    const withoutLayer = document.querySelector("[data-image-canvas]")!.outerHTML;
    without.unmount();

    await renderPicture(findValue(rows, rows[0]));
    await paint(screen.getByRole("img"));

    expect(layer()).toBeNull();
    expect(document.querySelector("[data-image-canvas]")!.outerHTML).toBe(
      withoutLayer,
    );
  });
});

describe("SPEC-CORE-051 I9, I10 no outline until the picture is painted and the term is answered", () => {
  it("draws nothing before the picture has decoded, then draws once it has", async () => {
    decodeResolves = false;
    const early = await renderPicture(
      findValue([pictureRow({ boxes: [Q1] })], null),
    );

    expect(layer()).toBeNull();

    await paint(screen.getByRole("img"));
    expect(layer()).toBeNull();
    early.unmount();

    decodeResolves = true;
    await renderPicture(findValue([pictureRow({ boxes: [Q1] })], null));
    await paint(screen.getByRole("img"));
    expect(layer()).not.toBeNull();
  });

  it.each([
    { name: "the natural width is zero", naturalWidth: 0, naturalHeight: 300 },
    { name: "the natural height is zero", naturalWidth: 400, naturalHeight: 0 },
  ])("draws nothing when $name", async ({ naturalWidth, naturalHeight }) => {
    const control = await renderPicture(
      findValue([pictureRow({ boxes: [Q1] })], null),
    );
    await paint(screen.getByRole("img"));
    expect(layer()).not.toBeNull();
    control.unmount();

    await renderPicture(
      findValue([pictureRow({ boxes: [Q1] })], null),
      makeFile(),
      { naturalWidth, naturalHeight },
    );

    await paint(screen.getByRole("img"));

    expect(layer()).toBeNull();
  });

  it.each([
    {
      name: "the bar is closed",
      overrides: { open: false } as Partial<FindContextValue>,
    },
    {
      name: "a new query is pending",
      overrides: { status: { kind: "pending" } as FindStatus },
    },
    {
      name: "the answer is not hits",
      overrides: { status: { kind: "noHits" } as FindStatus },
    },
    {
      name: "the answer failed",
      overrides: { status: { kind: "failed" } as FindStatus },
    },
    {
      name: "find is idle",
      overrides: { status: { kind: "idle" } as FindStatus },
    },
  ])("draws nothing when $name", async ({ overrides }) => {
    const rows = [pictureRow({ boxes: [Q1] })];
    const view = await renderPicture(findValue(rows, rows[0]));
    await paint(screen.getByRole("img"));
    expect(layer()).not.toBeNull();

    view.rerender(
      <FindProvider value={findValue(rows, rows[0], overrides)}>
        <ImageCanvas file={makeFile()} />
      </FindProvider>,
    );

    expect(layer()).toBeNull();
  });

  it("draws nothing outside the find provider, and marks inside it", async () => {
    const outside = render(<ImageCanvas file={makeFile()} />);
    stubPicture(screen.getByRole("img"));

    await paint(screen.getByRole("img"));

    expect(layer()).toBeNull();
    outside.unmount();

    await renderPicture(findValue([pictureRow({ boxes: [Q1] })], null));
    await paint(screen.getByRole("img"));

    expect(layer()).not.toBeNull();
  });

  it("removes the outlines when the bar closes", async () => {
    const rows = [pictureRow({ boxes: [Q1] })];
    const view = await renderPicture(findValue(rows, rows[0]));
    await paint(screen.getByRole("img"));
    expect(layer()).not.toBeNull();

    view.rerender(
      <FindProvider value={findValue(rows, rows[0], { open: false })}>
        <ImageCanvas file={makeFile()} />
      </FindProvider>,
    );

    expect(layer()).toBeNull();
  });

  it("removes the outlines when another file opens, until that picture is painted", async () => {
    const rows = [pictureRow({ boxes: [Q1] })];
    const view = await renderPicture(findValue(rows, rows[0]));
    await paint(screen.getByRole("img"));
    expect(layer()).not.toBeNull();

    view.rerender(
      <FindProvider value={findValue(rows, rows[0])}>
        <ImageCanvas file={makeFile({ id: "f2" })} />
      </FindProvider>,
    );

    expect(layer()).toBeNull();

    stubPicture(screen.getByRole("img"));
    await paint(screen.getByRole("img"));
    expect(layer()).not.toBeNull();
  });
});

describe("SPEC-CORE-051 I11 the layer is hidden from access and pointer, and changes nothing about the picture", () => {
  it("is an aria-hidden, pointer-transparent, absolutely positioned layer in the picture span", async () => {
    await renderPicture(findValue([pictureRow({ boxes: [Q1] })], null));
    await paint(screen.getByRole("img"));

    const svg = layer() as SVGSVGElement;
    expect(svg).not.toBeNull();
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.closest("[data-image-canvas]")).not.toBeNull();
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 1 1");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    const pointer =
      svg.style.pointerEvents || svg.className.baseVal;
    expect(pointer === "none" || pointer.includes("pointer-events-none")).toBe(
      true,
    );
    expect(svg.style.position || svg.className.baseVal).toContain("absolute");
  });

  it("leaves the picture span's style, class and img attributes as they are without the layer", async () => {
    const withLayer = await renderPicture(
      findValue([pictureRow({ boxes: [Q1] })], null),
    );
    await paint(screen.getByRole("img"));
    expect(layer()).not.toBeNull();
    const canvas = document.querySelector("[data-image-canvas]")!;
    const img = screen.getByRole("img");
    const ctx = {
      canvasClass: canvas.className,
      canvasStyle: canvas.getAttribute("style"),
      imgWidth: img.getAttribute("width"),
      imgHeight: img.getAttribute("height"),
      imgClass: img.className,
      imgStyle: img.getAttribute("style"),
      imgSrc: img.getAttribute("src"),
    };
    const stripped = canvas.cloneNode(true) as HTMLElement;
    stripped.querySelector("[data-find-boxes]")!.remove();
    const canvasWithoutLayer = stripped.outerHTML;
    withLayer.unmount();

    await renderPicture(findValue([pictureRow()], null));
    await paint(screen.getByRole("img"));

    expect(document.querySelector("[data-image-canvas]")!.outerHTML).toBe(
      canvasWithoutLayer,
    );
    expect(document.querySelector("[data-image-canvas]")!.className).toBe(
      ctx.canvasClass,
    );
    expect(document.querySelector("[data-image-canvas]")!.getAttribute("style")).toBe(
      ctx.canvasStyle,
    );
    const plain = screen.getByRole("img");
    expect(plain.getAttribute("width")).toBe(ctx.imgWidth);
    expect(plain.getAttribute("height")).toBe(ctx.imgHeight);
    expect(plain.className).toBe(ctx.imgClass);
    expect(plain.getAttribute("style")).toBe(ctx.imgStyle);
    expect(plain.getAttribute("src")).toBe(ctx.imgSrc);
  });
});

describe("SPEC-CORE-051 I9 the layer covers the contain-fitted painted picture", () => {
  it("fits a landscape picture inside a square element box with the side bands and centres it", async () => {
    await renderPicture(findValue([pictureRow({ boxes: [Q1] })], null), makeFile(), {
      naturalWidth: 400,
      naturalHeight: 300,
      box: { left: 0, top: 0, width: 300, height: 300 },
    });
    await paint(screen.getByRole("img"));

    const svg = layer() as SVGSVGElement;
    expectPx(svg.style.left, 0);
    expectPx(svg.style.top, 37.5);
    expectPx(svg.style.width, 300);
    expectPx(svg.style.height, 225);
  });

  it("fits a portrait picture inside a square element box with the side bands and centres it", async () => {
    await renderPicture(findValue([pictureRow({ boxes: [Q1] })], null), makeFile(), {
      naturalWidth: 300,
      naturalHeight: 400,
      box: { left: 0, top: 0, width: 300, height: 300 },
    });
    await paint(screen.getByRole("img"));

    const svg = layer() as SVGSVGElement;
    expectPx(svg.style.left, 37.5);
    expectPx(svg.style.top, 0);
    expectPx(svg.style.width, 225);
    expectPx(svg.style.height, 300);
  });

  it("follows the img element when its box changes", async () => {
    const callbacks: Array<{
      callback: ResizeObserverCallback;
      targets: Element[];
    }> = [];
    class RecordedResizeObserver {
      targets: Element[] = [];
      constructor(public callback: ResizeObserverCallback) {
        callbacks.push(this);
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", RecordedResizeObserver);

    let box: Box = { left: 0, top: 0, width: 300, height: 300 };
    const view = render(
      <FindProvider value={findValue([pictureRow({ boxes: [Q1] })], null)}>
        <ImageCanvas file={makeFile()} />
      </FindProvider>,
    );
    const img = screen.getByRole("img");
    stubPicture(img);
    img.getBoundingClientRect = () => makeRect(box);
    await paint(img);

    expectPx((layer() as SVGSVGElement).style.width, 300);

    box = { left: 0, top: 0, width: 600, height: 300 };
    await act(async () => {
      callbacks.forEach(({ callback, targets }) =>
        callback(
          targets.map(
            (target) => ({ target }) as unknown as ResizeObserverEntry,
          ),
          {} as ResizeObserver,
        ),
      );
    });

    const svg = layer() as SVGSVGElement;
    expectPx(svg.style.left, 100);
    expectPx(svg.style.top, 0);
    expectPx(svg.style.width, 400);
    expectPx(svg.style.height, 300);
    view.unmount();
  });
});
