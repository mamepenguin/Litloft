import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export interface RasterRequest {
  pageNumber: number;
  /** CSS scale times device pixel ratio: the canvas's pixels per PDF point. */
  renderScale: number;
}

export interface Raster {
  canvas: HTMLCanvasElement;
  renderScale: number;
}

export type Rasterize = (
  page: PDFPageProxy,
  renderScale: number,
) => { promise: Promise<Raster>; cancel: () => void };

/**
 * What one owner needs kept. `visiblePages` names pages that are on screen
 * before their canvas has asked for a size — react-pdf loads a page before it
 * mounts the renderer — so prefetch cannot jump ahead of them. `hold` keeps a
 * raster that is on show without asking for it to be drawn.
 */
export interface Wants {
  visible?: RasterRequest[];
  visiblePages?: number[];
  prefetch?: RasterRequest[];
  hold?: RasterRequest[];
}

interface Ready {
  raster: Raster;
  pageNumber: number;
  seq: number;
}

interface Running {
  key: string;
  pageNumber: number;
  cancelled: boolean;
  cancel: (() => void) | null;
}

const keyOf = (pageNumber: number, renderScale: number) =>
  `${pageNumber}@${renderScale.toFixed(4)}`;

function releaseCanvas(canvas: HTMLCanvasElement) {
  // Zeroing the size is what makes Safari give the backing store back now,
  // rather than at some later collection.
  canvas.width = 0;
  canvas.height = 0;
}

export const rasterizePage: Rasterize = (page, renderScale) => {
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({
    canvas,
    canvasContext: canvas.getContext("2d", { alpha: false }) ?? undefined,
    viewport,
  });
  return {
    promise: task.promise.then(
      () => ({ canvas, renderScale }),
      (error: unknown) => {
        releaseCanvas(canvas);
        throw error;
      },
    ),
    cancel: () => task.cancel(),
  };
};

const caches = new WeakMap<object, PdfRasterCache>();

/**
 * Rasters of one document's pages, shared by every viewer of it.
 *
 * pdf.js keeps a page's operator list and decoded images until
 * `page.cleanup()`. This is the only caller of it, and it calls it when a
 * page leaves every owner's keep set — never before a redraw, which is what
 * makes a zoom cheap.
 */
export class PdfRasterCache {
  private owners = new Map<string, Wants>();
  private ready = new Map<string, Ready>();
  private failed = new Map<string, unknown>();
  private prefetchFailed = new Set<string>();
  private pages = new Map<number, PDFPageProxy>();
  private running: Running | null = null;
  private listeners = new Set<() => void>();
  private scheduled = false;
  private seq = 0;
  private version = 0;

  constructor(
    private readonly pdf: Pick<PDFDocumentProxy, "getPage">,
    private readonly rasterize: Rasterize = rasterizePage,
  ) {}

  want(owner: string, wants: Wants) {
    this.owners.set(owner, wants);
    this.schedule();
  }

  release(owner: string) {
    this.owners.delete(owner);
    this.schedule();
  }

  get(pageNumber: number, renderScale: number): Raster | undefined {
    return this.ready.get(keyOf(pageNumber, renderScale))?.raster;
  }

  /** The most recently drawn raster of the page, at whatever scale. */
  best(pageNumber: number): Raster | undefined {
    let best: Ready | undefined;
    for (const entry of this.ready.values()) {
      if (entry.pageNumber === pageNumber && (!best || entry.seq > best.seq)) {
        best = entry;
      }
    }
    return best?.raster;
  }

  error(pageNumber: number, renderScale: number): unknown {
    return this.failed.get(keyOf(pageNumber, renderScale));
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  /**
   * Drops every raster and cleans every page up, and stays usable: React's
   * development double-invoke runs an effect's cleanup and then its setup
   * again, and the setup has to land in a working cache.
   */
  clear() {
    this.cancelRunning();
    this.running = null;
    for (const entry of this.ready.values()) releaseCanvas(entry.raster.canvas);
    this.ready.clear();
    for (const page of this.pages.values()) page.cleanup();
    this.pages.clear();
    this.owners.clear();
    this.failed.clear();
    this.prefetchFailed.clear();
    this.notify();
  }

  private notify() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /**
   * Deferred so that a canvas unmounting and its successor mounting in the
   * same commit — react-pdf remounts the renderer on every scale change —
   * never look like the page leaving.
   */
  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.sweep();
      this.pump();
    });
  }

  private collect() {
    const visible = new Set<string>();
    const prefetch = new Set<string>();
    const held = new Set<string>();
    const keptPages = new Set<number>();
    for (const wants of this.owners.values()) {
      for (const r of wants.visible ?? []) {
        visible.add(keyOf(r.pageNumber, r.renderScale));
        keptPages.add(r.pageNumber);
      }
      for (const n of wants.visiblePages ?? []) keptPages.add(n);
      for (const r of wants.prefetch ?? []) {
        prefetch.add(keyOf(r.pageNumber, r.renderScale));
        keptPages.add(r.pageNumber);
      }
      for (const r of wants.hold ?? []) {
        held.add(keyOf(r.pageNumber, r.renderScale));
        keptPages.add(r.pageNumber);
      }
    }
    return { visible, prefetch, held, keptPages };
  }

  private sweep() {
    const { visible, prefetch, held, keptPages } = this.collect();
    const wanted = (key: string) => visible.has(key) || prefetch.has(key);
    let changed = false;

    if (this.running && !wanted(this.running.key)) this.cancelRunning();

    for (const key of this.failed.keys()) {
      if (!visible.has(key)) this.failed.delete(key);
    }
    for (const key of this.prefetchFailed) {
      if (!prefetch.has(key)) this.prefetchFailed.delete(key);
    }

    for (const [key, entry] of this.ready) {
      if (wanted(key) || held.has(key)) continue;
      releaseCanvas(entry.raster.canvas);
      this.ready.delete(key);
      changed = true;
    }

    for (const [pageNumber, page] of this.pages) {
      if (keptPages.has(pageNumber)) continue;
      if (this.running?.pageNumber === pageNumber) continue;
      page.cleanup();
      this.pages.delete(pageNumber);
    }

    if (changed) this.notify();
  }

  private pump() {
    if (this.running) return;

    const owners = [...this.owners.values()];
    const visibleRequests = owners.flatMap((w) => w.visible ?? []);
    const nextVisible = visibleRequests.find((r) => {
      const key = keyOf(r.pageNumber, r.renderScale);
      return !this.ready.has(key) && !this.failed.has(key);
    });
    if (nextVisible) {
      this.start(nextVisible);
      return;
    }

    const onScreen = new Set([
      ...owners.flatMap((w) => w.visiblePages ?? []),
      ...visibleRequests.map((r) => r.pageNumber),
    ]);
    // Every visible request is drawn or failed by now, so a page on screen
    // is settled exactly when its canvas has asked for one.
    for (const pageNumber of onScreen) {
      if (!visibleRequests.some((r) => r.pageNumber === pageNumber)) return;
    }

    const nextPrefetch = owners
      .flatMap((w) => w.prefetch ?? [])
      .find((r) => {
        const key = keyOf(r.pageNumber, r.renderScale);
        return (
          !this.ready.has(key) &&
          !this.failed.has(key) &&
          !this.prefetchFailed.has(key)
        );
      });
    if (nextPrefetch) this.start(nextPrefetch);
  }

  private cancelRunning() {
    const running = this.running;
    if (!running || running.cancelled) return;
    running.cancelled = true;
    running.cancel?.();
  }

  private start({ pageNumber, renderScale }: RasterRequest) {
    const key = keyOf(pageNumber, renderScale);
    const running: Running = { key, pageNumber, cancelled: false, cancel: null };
    this.running = running;

    void (async () => {
      try {
        const page = await this.pdf.getPage(pageNumber);
        if (running.cancelled) return;
        this.pages.set(pageNumber, page);
        const task = this.rasterize(page, renderScale);
        running.cancel = task.cancel;
        const raster = await task.promise;
        if (running.cancelled) {
          releaseCanvas(raster.canvas);
          return;
        }
        this.ready.set(key, { raster, pageNumber, seq: ++this.seq });
      } catch (error) {
        if (running.cancelled) return;
        if (this.collect().visible.has(key)) this.failed.set(key, error);
        else this.prefetchFailed.add(key);
      } finally {
        if (this.running === running) {
          this.running = null;
          this.notify();
          this.schedule();
        }
      }
    })();
  }
}

/** One cache per loaded document, whichever viewer asks first. */
export function rasterCacheFor(pdf: PDFDocumentProxy): PdfRasterCache {
  let cache = caches.get(pdf);
  if (!cache) {
    cache = new PdfRasterCache(pdf);
    caches.set(pdf, cache);
  }
  return cache;
}
