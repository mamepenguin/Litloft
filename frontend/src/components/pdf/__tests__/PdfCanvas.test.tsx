import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfRasterCache, type Raster, type Rasterize } from "@/lib/pdfRasterCache";

const pageContext: { current: Record<string, unknown> } = { current: {} };
const documentContext: { current: Record<string, unknown> } = { current: {} };

vi.mock("react-pdf", () => ({
  usePageContext: () => pageContext.current,
  useDocumentContext: () => documentContext.current,
}));

let cache: PdfRasterCache;
vi.mock("@/lib/pdfRasterCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdfRasterCache")>()),
  rasterCacheFor: () => cache,
}));

import { PdfCanvas } from "@/components/pdf/PdfCanvas";

interface Job {
  renderScale: number;
  resolve: () => void;
  reject: (e: Error) => void;
}

const page = {
  pageNumber: 1,
  cleanup: vi.fn(() => true),
  getViewport: ({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 800 * scale,
  }),
};

let jobs: Job[];

beforeEach(() => {
  // jsdom has no 2D context; the copy onto the visible canvas is skipped.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  jobs = [];
  page.cleanup.mockClear();
  const rasterize: Rasterize = (_page, renderScale) => {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<Raster>((res, rej) => {
      resolve = () =>
        res({
          canvas: {
            width: Math.floor(600 * renderScale),
            height: Math.floor(800 * renderScale),
          } as HTMLCanvasElement,
          renderScale,
        });
      reject = rej;
    });
    jobs.push({ renderScale, resolve, reject });
    return { promise, cancel: () => reject(new Error("cancelled")) };
  };
  cache = new PdfRasterCache({ getPage: async () => page } as never, rasterize);
  documentContext.current = { pdf: {} };
});

function setPage(scale: number, extra: Record<string, unknown> = {}) {
  pageContext.current = {
    _className: "react-pdf__Page",
    page,
    pageNumber: 1,
    rotate: 0,
    scale,
    devicePixelRatio: 2,
    ...extra,
  };
}

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
};

describe("PdfCanvas", () => {
  it("reports success once the page's raster is drawn", async () => {
    const onRenderSuccess = vi.fn();
    setPage(1, { onRenderSuccess });
    render(<PdfCanvas />);
    await flush();
    expect(jobs.map((j) => j.renderScale)).toEqual([2]);
    expect(onRenderSuccess).not.toHaveBeenCalled();

    jobs[0].resolve();
    await flush();
    expect(onRenderSuccess).toHaveBeenCalledTimes(1);
  });

  it("reports a failed render", async () => {
    const onRenderError = vi.fn();
    setPage(1, { onRenderError });
    render(<PdfCanvas />);
    await flush();
    jobs[0].reject(new Error("too large"));
    await flush();
    expect(onRenderError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("keeps the previous picture on screen while the page is redrawn at a new scale", async () => {
    setPage(1);
    const { container, rerender } = render(<PdfCanvas key="1" />);
    await flush();
    jobs[0].resolve();
    await flush();

    // react-pdf remounts the renderer when the scale changes
    setPage(2);
    rerender(<PdfCanvas key="2" />);
    await flush();

    const canvas = container.querySelector("canvas")!;
    expect(jobs.map((j) => j.renderScale)).toEqual([2, 4]);
    expect(canvas.style.visibility).not.toBe("hidden");
    expect(canvas.width).toBe(1200);
    expect(canvas.style.width).toBe("1200px");
    expect(page.cleanup).not.toHaveBeenCalled();

    jobs[1].resolve();
    await flush();
    expect(canvas.width).toBe(2400);
  });

  it("hides the canvas while nothing of the page has been drawn yet", async () => {
    setPage(1);
    const { container } = render(<PdfCanvas />);
    await flush();
    expect(container.querySelector("canvas")!.style.visibility).toBe("hidden");
  });

  it("gives the page up when it unmounts", async () => {
    setPage(1);
    const { unmount } = render(<PdfCanvas />);
    await flush();
    jobs[0].resolve();
    await flush();

    unmount();
    await flush();
    expect(page.cleanup).toHaveBeenCalledTimes(1);
  });
});
