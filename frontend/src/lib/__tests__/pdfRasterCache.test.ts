import { describe, expect, it, vi } from "vitest";

import {
  PdfRasterCache,
  type Raster,
  type Rasterize,
} from "@/lib/pdfRasterCache";

interface FakePage {
  pageNumber: number;
  cleanup: ReturnType<typeof vi.fn>;
}

interface Job {
  pageNumber: number;
  renderScale: number;
  resolve: () => void;
  reject: (error: unknown) => void;
  cancel: ReturnType<typeof vi.fn>;
  raster: Raster;
}

function setup() {
  const pages = new Map<number, FakePage>();
  const pageOf = (n: number): FakePage => {
    let page = pages.get(n);
    if (!page) {
      page = { pageNumber: n, cleanup: vi.fn(() => true) };
      pages.set(n, page);
    }
    return page;
  };
  const pdf = {
    numPages: 10,
    getPage: vi.fn(async (n: number) => pageOf(n)),
  };
  const jobs: Job[] = [];
  const rasterize: Rasterize = (page, renderScale) => {
    const canvas = { width: 100, height: 100 } as HTMLCanvasElement;
    const raster: Raster = { canvas, renderScale };
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Raster>((res, rej) => {
      resolve = () => res(raster);
      reject = rej;
    });
    const job: Job = {
      pageNumber: (page as unknown as FakePage).pageNumber,
      renderScale,
      resolve,
      reject,
      cancel: vi.fn(() => reject(new Error("cancelled"))),
      raster,
    };
    jobs.push(job);
    return { promise, cancel: job.cancel };
  };
  const cache = new PdfRasterCache(
    pdf as unknown as ConstructorParameters<typeof PdfRasterCache>[0],
    rasterize,
  );
  return { cache, jobs, pageOf, pdf };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("PdfRasterCache", () => {
  it("renders the same page again at a new scale without cleaning it up", async () => {
    const { cache, jobs, pageOf } = setup();
    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    await flush();
    jobs[0].resolve();
    await flush();

    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 2 }] });
    await flush();

    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({ pageNumber: 1, renderScale: 2 });
    expect(pageOf(1).cleanup).not.toHaveBeenCalled();
  });

  it("keeps the previous raster of a page on show until the new scale is drawn", async () => {
    const { cache, jobs } = setup();
    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    await flush();
    jobs[0].resolve();
    await flush();

    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 2 }] });
    await flush();
    expect(cache.get(1, 2)).toBeUndefined();
    expect(cache.best(1)).toBe(jobs[0].raster);

    jobs[1].resolve();
    await flush();
    expect(cache.best(1)).toBe(jobs[1].raster);
    expect(jobs[0].raster.canvas.width).toBe(0);
  });

  it("releases a page no viewer keeps and cleans it up once", async () => {
    const { cache, jobs, pageOf } = setup();
    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    await flush();
    jobs[0].resolve();
    await flush();

    cache.release("canvas");
    await flush();

    expect(jobs[0].raster.canvas.width).toBe(0);
    expect(jobs[0].raster.canvas.height).toBe(0);
    expect(pageOf(1).cleanup).toHaveBeenCalledTimes(1);
    expect(cache.best(1)).toBeUndefined();
  });

  it("does not evict a page when one owner drops it and another remounts it in the same tick", async () => {
    const { cache, jobs, pageOf } = setup();
    cache.want("a", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    await flush();
    jobs[0].resolve();
    await flush();

    cache.release("a");
    cache.want("b", { visible: [{ pageNumber: 1, renderScale: 1.5 }] });
    await flush();

    expect(pageOf(1).cleanup).not.toHaveBeenCalled();
    expect(cache.best(1)).toBe(jobs[0].raster);
  });

  it("does not evict a page another viewer still keeps", async () => {
    const { cache, jobs, pageOf } = setup();
    cache.want("inline", { visible: [{ pageNumber: 3, renderScale: 1 }] });
    cache.want("fullscreen", { visible: [{ pageNumber: 3, renderScale: 2 }] });
    await flush();
    jobs[0].resolve();
    await flush();
    jobs[1].resolve();
    await flush();

    cache.release("fullscreen");
    await flush();

    expect(pageOf(3).cleanup).not.toHaveBeenCalled();
    expect(cache.get(3, 1)).toBe(jobs[0].raster);
    expect(jobs[1].raster.canvas.width).toBe(0);
  });

  it("starts no prefetch until the pages on screen have rendered", async () => {
    const { cache, jobs } = setup();
    cache.want("viewer", {
      visiblePages: [5],
      prefetch: [
        { pageNumber: 6, renderScale: 1 },
        { pageNumber: 4, renderScale: 1 },
      ],
    });
    await flush();
    expect(jobs).toHaveLength(0);

    cache.want("canvas", { visible: [{ pageNumber: 5, renderScale: 1 }] });
    await flush();
    expect(jobs.map((j) => j.pageNumber)).toEqual([5]);

    jobs[0].resolve();
    await flush();
    expect(jobs.map((j) => j.pageNumber)).toEqual([5, 6]);

    jobs[1].resolve();
    await flush();
    expect(jobs.map((j) => j.pageNumber)).toEqual([5, 6, 4]);
  });

  it("starts prefetch after the page on screen failed", async () => {
    const { cache, jobs } = setup();
    cache.want("viewer", {
      visiblePages: [5],
      prefetch: [{ pageNumber: 6, renderScale: 1 }],
    });
    cache.want("canvas", { visible: [{ pageNumber: 5, renderScale: 9 }] });
    await flush();
    jobs[0].reject(new Error("too large"));
    await flush();

    expect(cache.error(5, 9)).toBeInstanceOf(Error);
    expect(jobs.map((j) => j.pageNumber)).toEqual([5, 6]);
  });

  it("draws a page on screen before a queued prefetch", async () => {
    const { cache, jobs } = setup();
    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    cache.want("viewer", {
      visiblePages: [1],
      prefetch: [{ pageNumber: 2, renderScale: 1 }],
    });
    await flush();
    jobs[0].resolve();
    await flush();
    // prefetch of 2 is running; the reader turns to 3
    cache.want("viewer", {
      visiblePages: [3],
      prefetch: [{ pageNumber: 2, renderScale: 1 }],
    });
    cache.want("canvas", { visible: [{ pageNumber: 3, renderScale: 1 }] });
    await flush();
    jobs[1].resolve();
    await flush();

    expect(jobs.map((j) => j.pageNumber)).toEqual([1, 2, 3]);
  });

  it("cancels a prefetch that no viewer wants any more", async () => {
    const { cache, jobs } = setup();
    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    cache.want("viewer", {
      visiblePages: [1],
      prefetch: [{ pageNumber: 2, renderScale: 1 }],
    });
    await flush();
    jobs[0].resolve();
    await flush();

    cache.want("viewer", { visiblePages: [1], prefetch: [] });
    await flush();

    expect(jobs[1].cancel).toHaveBeenCalled();
    expect(cache.get(2, 1)).toBeUndefined();
  });

  it("hands a prefetched raster to the page when it comes on screen, without rendering again", async () => {
    const { cache, jobs } = setup();
    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    cache.want("viewer", {
      visiblePages: [1],
      prefetch: [{ pageNumber: 2, renderScale: 1.25 }],
    });
    await flush();
    jobs[0].resolve();
    await flush();
    jobs[1].resolve();
    await flush();

    cache.want("viewer", { visiblePages: [2], prefetch: [] });
    cache.want("canvas", { visible: [{ pageNumber: 2, renderScale: 1.25 }] });
    await flush();

    expect(cache.get(2, 1.25)).toBe(jobs[1].raster);
    expect(jobs).toHaveLength(2);
  });

  it("drops a failed prefetch silently and renders the page again when it is shown", async () => {
    const { cache, jobs } = setup();
    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    cache.want("viewer", {
      visiblePages: [1],
      prefetch: [{ pageNumber: 2, renderScale: 1 }],
    });
    await flush();
    jobs[0].resolve();
    await flush();
    jobs[1].reject(new Error("boom"));
    await flush();
    expect(cache.error(2, 1)).toBeUndefined();
    expect(jobs).toHaveLength(2);

    cache.want("canvas", { visible: [{ pageNumber: 2, renderScale: 1 }] });
    await flush();
    expect(jobs.map((j) => j.pageNumber)).toEqual([1, 2, 2]);
  });

  it("releases every raster on dispose", async () => {
    const { cache, jobs, pageOf } = setup();
    cache.want("canvas", { visible: [{ pageNumber: 1, renderScale: 1 }] });
    await flush();
    jobs[0].resolve();
    await flush();

    cache.dispose();

    expect(jobs[0].raster.canvas.width).toBe(0);
    expect(pageOf(1).cleanup).toHaveBeenCalledTimes(1);
  });
});
