import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfRasterCache, type Raster, type Rasterize } from "@/lib/pdfRasterCache";

const documentContext: { current: Record<string, unknown> } = { current: {} };

vi.mock("react-pdf", async () => {
  const React = await import("react");
  const PageContext = React.createContext<unknown>(null);
  return {
    usePageContext: () => React.useContext(PageContext),
    useDocumentContext: () => documentContext.current,
    __PageContext: PageContext,
  };
});

let cache: PdfRasterCache;
vi.mock("@/lib/pdfRasterCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdfRasterCache")>()),
  rasterCacheFor: () => cache,
}));

import { PdfCanvas } from "@/components/pdf/PdfCanvas";
// @ts-expect-error provided by the mock above
import { __PageContext as PageContext } from "react-pdf";

interface Job {
  pageNumber: number;
  renderScale: number;
  canvas: HTMLCanvasElement;
  resolve: () => void;
  reject: (e: Error) => void;
}

interface FakePage {
  pageNumber: number;
  cleanup: ReturnType<typeof vi.fn>;
  getViewport: (o: { scale: number }) => { width: number; height: number };
}

function fakePage(pageNumber: number): FakePage {
  const page = {
    pageNumber,
    cleanup: vi.fn(() => true),
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
  };
  // react-pdf defines these on the shared proxy, getter only.
  Object.defineProperty(page, "width", { get: () => 600, configurable: true });
  Object.defineProperty(page, "height", { get: () => 800, configurable: true });
  return page;
}

let pages: Map<number, FakePage>;
let jobs: Job[];
let context2d: { drawImage: ReturnType<typeof vi.fn> } | null;

beforeEach(() => {
  jobs = [];
  pages = new Map([1, 2].map((n) => [n, fakePage(n)]));
  context2d = { drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context2d as unknown as CanvasRenderingContext2D,
  );
  const rasterize: Rasterize = (page, renderScale) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(600 * renderScale);
    canvas.height = Math.floor(800 * renderScale);
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<Raster>((res, rej) => {
      resolve = () => res({ canvas, renderScale });
      reject = rej;
    });
    jobs.push({
      pageNumber: (page as unknown as FakePage).pageNumber,
      renderScale,
      canvas,
      resolve,
      reject,
    });
    return { promise, cancel: () => reject(new Error("cancelled")) };
  };
  cache = new PdfRasterCache(
    { getPage: async (n: number) => pages.get(n) } as never,
    rasterize,
  );
  documentContext.current = { pdf: {} };
});

function pageContext(
  pageNumber: number,
  scale: number,
  extra: Record<string, unknown> = {},
) {
  return {
    _className: "react-pdf__Page",
    page: pages.get(pageNumber),
    pageNumber,
    rotate: 0,
    scale,
    devicePixelRatio: 2,
    ...extra,
  };
}

function OnPage({
  value,
  children,
}: {
  value: Record<string, unknown>;
  children: ReactNode;
}) {
  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
};

const canvasIn = (el: Element) => el.querySelector("canvas");

describe("PdfCanvas", () => {
  it("puts the cached raster itself on screen and reports success", async () => {
    const onRenderSuccess = vi.fn();
    const { container } = render(
      <OnPage value={pageContext(1, 1, { onRenderSuccess })}>
        <PdfCanvas />
      </OnPage>,
    );
    await flush();
    expect(onRenderSuccess).not.toHaveBeenCalled();

    jobs[0].resolve();
    await flush();
    expect(canvasIn(container)).toBe(jobs[0].canvas);
    expect(jobs[0].canvas.className).toBe("react-pdf__Page__canvas");
    expect(jobs[0].canvas.style.width).toBe("600px");
    expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    expect(context2d!.drawImage).not.toHaveBeenCalled();
  });

  it("reports a failed render", async () => {
    const onRenderError = vi.fn();
    render(
      <OnPage value={pageContext(1, 1, { onRenderError })}>
        <PdfCanvas />
      </OnPage>,
    );
    await flush();
    jobs[0].reject(new Error("too large"));
    await flush();
    expect(onRenderError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("keeps the previous picture on screen while the page is redrawn at a new scale", async () => {
    const { container, rerender } = render(
      <OnPage value={pageContext(1, 1)}>
        <PdfCanvas key="1" />
      </OnPage>,
    );
    await flush();
    jobs[0].resolve();
    await flush();

    // react-pdf remounts the renderer when the scale changes
    rerender(
      <OnPage value={pageContext(1, 2)}>
        <PdfCanvas key="2" />
      </OnPage>,
    );
    await flush();

    expect(jobs.map((j) => j.renderScale)).toEqual([2, 4]);
    expect(canvasIn(container)).toBe(jobs[0].canvas);
    expect(jobs[0].canvas.width).toBe(1200);
    expect(jobs[0].canvas.style.width).toBe("1200px");
    expect((container.firstChild as HTMLElement).style.visibility).not.toBe("hidden");
    expect(pages.get(1)!.cleanup).not.toHaveBeenCalled();

    jobs[1].resolve();
    await flush();
    expect(canvasIn(container)).toBe(jobs[1].canvas);
    expect(jobs[0].canvas.width).toBe(0);
  });

  it("hides the page while nothing of it has been drawn yet", async () => {
    const { container } = render(
      <OnPage value={pageContext(1, 1)}>
        <PdfCanvas />
      </OnPage>,
    );
    await flush();
    expect((container.firstChild as HTMLElement).style.visibility).toBe("hidden");
  });

  it("draws both pages of a pair", async () => {
    const { container } = render(
      <>
        <OnPage value={pageContext(1, 1)}>
          <section data-page="1">
            <PdfCanvas />
          </section>
        </OnPage>
        <OnPage value={pageContext(2, 1)}>
          <section data-page="2">
            <PdfCanvas />
          </section>
        </OnPage>
      </>,
    );
    await flush();
    jobs[0].resolve();
    await flush();
    jobs[1].resolve();
    await flush();

    expect(jobs.map((j) => j.pageNumber).sort()).toEqual([1, 2]);
    for (const n of [1, 2]) {
      const section = container.querySelector(`[data-page="${n}"]`)!;
      expect(canvasIn(section)).toBe(jobs.find((j) => j.pageNumber === n)!.canvas);
    }
  });

  it("draws a raster already on show elsewhere into a canvas of its own", async () => {
    const { container } = render(
      <>
        <OnPage value={pageContext(1, 1)}>
          <section data-view="inline">
            <PdfCanvas />
          </section>
        </OnPage>
        <OnPage value={pageContext(1, 1)}>
          <section data-view="fullscreen">
            <PdfCanvas />
          </section>
        </OnPage>
      </>,
    );
    await flush();
    jobs[0].resolve();
    await flush();

    const inline = canvasIn(container.querySelector('[data-view="inline"]')!);
    const fullscreen = canvasIn(container.querySelector('[data-view="fullscreen"]')!);
    expect(jobs).toHaveLength(1);
    expect([inline, fullscreen]).toContain(jobs[0].canvas);
    expect(inline).not.toBe(fullscreen);
    expect(context2d!.drawImage).toHaveBeenCalledWith(jobs[0].canvas, 0, 0);
  });

  it("reports a failure when the browser refuses the canvas the page needs", async () => {
    const onRenderSuccess = vi.fn();
    const onRenderError = vi.fn();
    render(
      <>
        <OnPage value={pageContext(1, 1)}>
          <PdfCanvas />
        </OnPage>
        <OnPage value={pageContext(1, 1, { onRenderSuccess, onRenderError })}>
          <section data-view="second">
            <PdfCanvas />
          </section>
        </OnPage>
      </>,
    );
    context2d = null;
    await flush();
    jobs[0].resolve();
    await flush();

    expect(onRenderError).toHaveBeenCalledWith(expect.any(Error));
    expect(onRenderSuccess).not.toHaveBeenCalled();
  });

  it("gives the page up when it unmounts, and releases a canvas of its own", async () => {
    const created: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = create(tag);
      if (tag === "canvas") created.push(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement);

    const { unmount } = render(
      <>
        <OnPage value={pageContext(1, 1)}>
          <PdfCanvas />
        </OnPage>
        <OnPage value={pageContext(1, 1)}>
          <PdfCanvas />
        </OnPage>
      </>,
    );
    await flush();
    jobs[0].resolve();
    await flush();
    const copy = created.find((c) => c !== jobs[0].canvas && c.width > 0)!;
    expect(copy).toBeDefined();

    unmount();
    await flush();
    expect(pages.get(1)!.cleanup).toHaveBeenCalledTimes(1);
    expect(copy.width).toBe(0);
    expect(jobs[0].canvas.isConnected).toBe(false);
  });
});
