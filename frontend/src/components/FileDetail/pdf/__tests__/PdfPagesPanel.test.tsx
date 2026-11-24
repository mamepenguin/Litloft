import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { InspectorActiveTabContext } from "@/components/FileDetail/inspector/activeTab";
import { PdfDocumentStore } from "@/lib/pdfController";
import { PdfPagesPanel, PdfPagesTab } from "../PdfPagesPanel";

/* ------------------------------------------------------------------ *
 * react-pdf, faked along its public contract: `Document` hands its
 * `onLoadSuccess` a proxy whose `getPage(1)` yields a viewport, and `Page`
 * reports load and render through its callbacks and draws its own
 * `loading` / `error` props (react-pdf's defaults when none are given).
 * ------------------------------------------------------------------ */

type FirstPage = "resolve" | "reject" | "pending";

const pdfMock = {
  numPages: 225,
  firstPage: "resolve" as FirstPage,
  releaseFirstPage: null as null | (() => void),
  loadFails: false,
  paint: true,
  failing: new Set<number>(),
  pageMounts: new Map<number, number>(),
  pageWidths: new Map<number, unknown>(),
  pageSizes: new Map<number, [number, number]>(),
  documentMounts: 0,
  documentUnmounts: 0,
};

function pageProxy(pageNumber: number) {
  const [width, height] = pdfMock.pageSizes.get(pageNumber) ?? [612, 792];
  return {
    pageNumber,
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    rotate: 0,
    view: [0, 0, width, height],
    getViewport: ({ scale = 1 }: { scale?: number; rotation?: number } = {}) => ({
      width: width * scale,
      height: height * scale,
      scale,
      rotation: 0,
    }),
  };
}

function pdfProxy() {
  return {
    numPages: pdfMock.numPages,
    getPage: (n: number) => {
      if (n !== 1) return Promise.resolve(pageProxy(n));
      if (pdfMock.firstPage === "reject") {
        return Promise.reject(new Error("no first page"));
      }
      if (pdfMock.firstPage === "pending") {
        return new Promise((resolve) => {
          pdfMock.releaseFirstPage = () => resolve(pageProxy(1));
        });
      }
      return Promise.resolve(pageProxy(1));
    },
  };
}

const FakeDocumentContext = createContext<{ pdf: unknown } | null>(null);

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  useDocumentContext: () => useContext(FakeDocumentContext),
  Document: ({
    children,
    file,
    error = "Failed to load PDF file.",
    onLoadSuccess,
    onLoadError,
  }: {
    children?: ReactNode;
    file?: unknown;
    error?: ReactNode;
    onLoadSuccess?: (pdf: unknown) => void;
    onLoadError?: (error: Error) => void;
  }) => {
    const pdf = pdfProxy();
    useEffect(() => {
      pdfMock.documentMounts += 1;
      return () => {
        pdfMock.documentUnmounts += 1;
      };
    }, []);
    useEffect(() => {
      if (pdfMock.loadFails) onLoadError?.(new Error("bad pdf"));
      else onLoadSuccess?.(pdf);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);
    if (pdfMock.loadFails) return <div>{error}</div>;
    return (
      <FakeDocumentContext.Provider value={{ pdf }}>
        <div>{children}</div>
      </FakeDocumentContext.Provider>
    );
  },
  Page: ({
    pageNumber,
    width,
    loading = "Loading page…",
    error = "Failed to load the page.",
    onLoadSuccess,
    onLoadError,
    onRenderSuccess,
    onRenderError,
  }: {
    pageNumber: number;
    width?: number;
    loading?: ReactNode;
    error?: ReactNode;
    onLoadSuccess?: (page: unknown) => void;
    onLoadError?: (error: Error) => void;
    onRenderSuccess?: (page: unknown) => void;
    onRenderError?: (error: Error) => void;
  }) => {
    pdfMock.pageWidths.set(pageNumber, width);
    const failing = pdfMock.failing.has(pageNumber);
    useEffect(() => {
      pdfMock.pageMounts.set(pageNumber, (pdfMock.pageMounts.get(pageNumber) ?? 0) + 1);
    }, [pageNumber]);
    useEffect(() => {
      if (failing) {
        onLoadError?.(new Error("bad page"));
        onRenderError?.(new Error("bad page"));
        return;
      }
      const page = pageProxy(pageNumber);
      onLoadSuccess?.(page);
      if (pdfMock.paint) onRenderSuccess?.(page);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageNumber, failing]);
    return <div>{failing ? error : pdfMock.paint ? null : loading}</div>;
  },
}));

/* ------------------------------------------------------------------ *
 * IntersectionObserver: every observer and every element it watches is
 * kept, so a test can bring one page's cell, or the whole tab, into view.
 * ------------------------------------------------------------------ */

interface FakeObserver {
  cb: IntersectionObserverCallback;
  self: IntersectionObserver;
  els: Set<Element>;
}

let observers: FakeObserver[] = [];

class FakeIntersectionObserver {
  private entry: FakeObserver;
  constructor(cb: IntersectionObserverCallback) {
    this.entry = { cb, self: this as unknown as IntersectionObserver, els: new Set() };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.els.add(el);
  }
  unobserve(el: Element) {
    this.entry.els.delete(el);
  }
  disconnect() {
    this.entry.els.clear();
  }
  takeRecords() {
    return [];
  }
}

function deliver(target: Element, isIntersecting: boolean, observer: FakeObserver) {
  observer.cb(
    [
      {
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: 0,
      } as IntersectionObserverEntry,
    ],
    observer.self,
  );
}

/** Every watched element enters (or leaves) view: the tab appearing. */
function intersectAll(isIntersecting: boolean) {
  act(() => {
    for (const observer of [...observers]) {
      for (const el of [...observer.els]) deliver(el, isIntersecting, observer);
    }
  });
}

/** One page's cell enters (or leaves) the drawing margin. */
function intersectPage(page: number, isIntersecting: boolean) {
  const target = cell(page);
  const ownsOnly = (el: Element) =>
    target.contains(el) ||
    (el.contains(target) && el.querySelectorAll("[data-page-state]").length === 1);
  let delivered = 0;
  act(() => {
    for (const observer of [...observers]) {
      for (const el of [...observer.els]) {
        if (!ownsOnly(el)) continue;
        deliver(el, isIntersecting, observer);
        delivered += 1;
      }
    }
  });
  // A cell may stop being observed once drawn or failed; only bringing a
  // placeholder in needs an observer.
  if (delivered === 0 && isIntersecting && stateOf(page) === "placeholder") {
    throw new Error(`nothing observes the cell of page ${page}`);
  }
}

/**
 * Many pages' cells enter the margin in one observer callback, as a browser
 * reports a scroll that brings several cells in at once.
 */
function intersectPages(pages: number[]) {
  const targets = pages.map(cell);
  act(() => {
    for (const observer of [...observers]) {
      const entries = [...observer.els]
        .filter((el) => targets.some((target) => target === el || target.contains(el)))
        .map(
          (target) =>
            ({
              target,
              isIntersecting: true,
              intersectionRatio: 1,
              boundingClientRect: target.getBoundingClientRect(),
              intersectionRect: target.getBoundingClientRect(),
              rootBounds: null,
              time: 0,
            }) as IntersectionObserverEntry,
        );
      if (entries.length > 0) observer.cb(entries, observer.self);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Scroll writes: every scrollTop assignment and scroll call, by element.
 * ------------------------------------------------------------------ */

let scrollWrites: Element[] = [];
let restoreScroll: () => void = () => {};

function recordScrollWrites() {
  scrollWrites = [];
  const proto = Element.prototype as unknown as Record<string, unknown>;
  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
  const methods = ["scrollTo", "scroll", "scrollBy", "scrollIntoView"] as const;
  const saved = methods.map((name) => [name, proto[name]] as const);
  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get() {
      return scrollTop.get!.call(this);
    },
    set(value: number) {
      scrollWrites.push(this);
      scrollTop.set!.call(this, value);
    },
  });
  for (const name of methods) {
    proto[name] = function (this: Element) {
      scrollWrites.push(this);
    };
  }
  restoreScroll = () => {
    Object.defineProperty(Element.prototype, "scrollTop", scrollTop);
    for (const [name, fn] of saved) proto[name] = fn;
  };
}

/* ------------------------------------------------------------------ */

function storeWith(state: Parameters<PdfDocumentStore["set"]>[0]) {
  const store = new PdfDocumentStore();
  store.set({ src: "/a.pdf", ...state });
  if (state.numPages) pdfMock.numPages = state.numPages;
  return store;
}

const rail = () => screen.getByRole("list", { name: "Page thumbnails" });
const cells = () => [...rail().querySelectorAll<HTMLElement>("[data-page-state]")];
const cellButton = (el: Element) =>
  (el.matches("button") ? el : el.querySelector("button"))!;
const pageOf = (el: Element) =>
  Number(cellButton(el).getAttribute("aria-label")!.replace(/\D+/g, ""));
const cell = (page: number) =>
  screen
    .getByRole("button", { name: `Go to page ${page}` })
    .closest<HTMLElement>("[data-page-state]")!;
const stateOf = (page: number) => cell(page).getAttribute("data-page-state");
const notPlaceholder = () =>
  cells()
    .filter((el) => el.getAttribute("data-page-state") !== "placeholder")
    .map(pageOf);
const drawnCount = () =>
  cells().filter((el) => el.getAttribute("data-page-state") === "drawn").length;
const currentPages = () =>
  within(rail())
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-current") === "true")
    .map((b) => Number(b.getAttribute("aria-label")!.replace(/\D+/g, "")));
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function ready(numPages: number) {
  await waitFor(() => expect(cells().length).toBe(numPages));
  // The rail starts observing its cells in an effect after they mount; a test
  // that reports a cell in view before then reports it to nobody.
  if (globalThis.IntersectionObserver === (FakeIntersectionObserver as unknown)) {
    await waitFor(() =>
      expect(
        observers.some((o) => [...o.els].some((el) => el.closest("[data-page-state]"))),
      ).toBe(true),
    );
  }
}

beforeEach(() => {
  Object.assign(pdfMock, {
    numPages: 225,
    firstPage: "resolve",
    releaseFirstPage: null,
    loadFails: false,
    paint: true,
    failing: new Set<number>(),
    pageMounts: new Map<number, number>(),
    pageWidths: new Map<number, unknown>(),
    pageSizes: new Map<number, [number, number]>(),
    documentMounts: 0,
    documentUnmounts: 0,
  });
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  restoreScroll();
  restoreScroll = () => {};
  vi.unstubAllGlobals();
});

describe("PdfPagesPanel", () => {
  it("moves the viewer when a thumbnail is pressed", async () => {
    const store = storeWith({ numPages: 225, page: 1 });
    const go = vi.fn();
    store.onGoToPage = go;
    render(<PdfPagesPanel controller={store} />);

    fireEvent.click(await screen.findByRole("button", { name: "Go to page 4" }));
    expect(go).toHaveBeenCalledWith(4);
  });

  it("SPEC-CORE-174 I4 I6: marks the page the viewer is on, and follows it", async () => {
    const store = storeWith({ numPages: 225, page: 1 });
    render(<PdfPagesPanel controller={store} />);
    await ready(225);
    expect(currentPages()).toEqual([1]);

    act(() => store.set({ page: 150 }));
    expect(currentPages()).toEqual([150]);
    expect(
      screen.getByRole("button", { name: "Go to page 1" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("draws the outline when the document has one, indented by its nesting", () => {
    const store = storeWith({
      numPages: 225,
      page: 3,
      outline: [
        { depth: 0, title: "Part I", page: 1 },
        { depth: 1, title: "Chapter 1", page: 3 },
        { depth: 0, title: "Nowhere", page: null },
      ],
    });
    const go = vi.fn();
    store.onGoToPage = go;
    render(<PdfPagesPanel controller={store} />);

    const nav = screen.getByRole("navigation", { name: "Contents" });
    const rows = within(nav).getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Part I1",
      "Chapter 13",
      "Nowhere",
    ]);
    expect(rows[1].style.paddingLeft).toBe("20px");

    fireEvent.click(rows[0]);
    expect(go).toHaveBeenCalledWith(1);
  });

  it("gives an unresolvable outline row no jump", () => {
    const store = storeWith({
      numPages: 10,
      page: 1,
      outline: [{ depth: 0, title: "Nowhere", page: null }],
    });
    const go = vi.fn();
    store.onGoToPage = go;
    render(<PdfPagesPanel controller={store} />);

    const row = within(screen.getByRole("navigation", { name: "Contents" })).getByRole(
      "button",
    );
    // `aria-disabled`, not `disabled`: a `disabled` button leaves the tab
    // order, so a keyboard reader would find the contents shorter than shown.
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row).not.toBeDisabled();
    fireEvent.click(row);
    expect(go).not.toHaveBeenCalled();
  });

  it("draws no outline section for a document without one", async () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 10, page: 1, outline: [] })} />);
    expect(await screen.findByTestId("pdf-thumbnails")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("marks the outline entry the reader is inside, not only its first page", () => {
    const store = storeWith({
      numPages: 225,
      page: 7,
      outline: [
        { depth: 0, title: "Part I", page: 1 },
        { depth: 0, title: "Chapter 1", page: 3 },
        { depth: 0, title: "Chapter 2", page: 40 },
      ],
    });
    render(<PdfPagesPanel controller={store} />);

    const rows = within(
      screen.getByRole("navigation", { name: "Contents" }),
    ).getAllByRole("button");
    expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([
      null,
      "true",
      null,
    ]);
  });

  it("names the thumbnail rail", async () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 3, page: 1 })} />);
    expect(
      await screen.findByRole("list", { name: "Page thumbnails" }),
    ).toBeInTheDocument();
  });
});

describe("SPEC-CORE-174 I2: every page has a cell", () => {
  it("lists every page in order, wherever the viewer is, with one current page", async () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 100 })} />);
    await ready(225);

    expect(cells().map(pageOf)).toEqual(range(1, 225));
    expect(currentPages()).toEqual([100]);
  });

  it("lists the single page of a one-page document", async () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 1, page: 1 })} />);
    await ready(1);
    expect(cells().map(pageOf)).toEqual([1]);
    expect(currentPages()).toEqual([1]);
  });
});

describe("SPEC-CORE-174 I3: a cell leaves placeholder only on entering the margin", () => {
  it("keeps every cell a placeholder until it is reported in view", async () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    await ready(225);
    expect(notPlaceholder()).toEqual([]);

    intersectPage(50, true);
    expect(notPlaceholder()).toEqual([50]);
    expect(stateOf(50)).toBe("drawn");
  });

  it("holds a cell in drawing until its page has rendered, and shows no text there", async () => {
    pdfMock.paint = false;
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    await ready(225);

    intersectPage(7, true);
    expect(stateOf(7)).toBe("drawing");
    expect(cell(7).textContent).toBe("7");
  });

  it("rasterises each page at a fixed 128px width", async () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    await ready(225);
    intersectPage(1, true);
    intersectPage(30, true);
    expect(pdfMock.pageWidths.get(1)).toBe(128);
    expect(pdfMock.pageWidths.get(30)).toBe(128);
  });

  it("keeps a drawn page drawn when it leaves the margin", async () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    await ready(225);

    intersectPage(12, true);
    intersectPage(12, false);
    expect(stateOf(12)).toBe("drawn");
    expect(pdfMock.pageMounts.get(12)).toBe(1);
  });

  it("never holds more than 120 drawn pages", async () => {
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    await ready(225);

    intersectPages(range(1, 125));
    expect(drawnCount()).toBe(120);
  });

  it("keeps an off-proportion page's own box when the cap returns it to placeholder", async () => {
    pdfMock.pageSizes.set(2, [612, 850]);
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    await ready(225);
    const picture = () =>
      cellButton(cell(2)).firstElementChild as HTMLElement;

    intersectPage(2, true);
    const drawnBox = picture().style.aspectRatio;
    expect(drawnBox).toBe(`1 / ${850 / 612}`);

    intersectPages(range(1, 125));
    expect(stateOf(2)).toBe("placeholder");
    expect(picture().style.aspectRatio).toBe(drawnBox);
  });
});

describe("SPEC-CORE-174 I3: without IntersectionObserver, the followed pages and three either side", () => {
  const cases: Array<{ numPages: number; pages: number[]; expected: number[] }> = [
    { numPages: 225, pages: [100], expected: range(97, 103) },
    { numPages: 225, pages: [1], expected: range(1, 4) },
    { numPages: 225, pages: [225], expected: range(222, 225) },
    { numPages: 1, pages: [1], expected: [1] },
    { numPages: 225, pages: [100, 5], expected: [...range(2, 8), ...range(97, 103)] },
    { numPages: 225, pages: [100, 101], expected: range(97, 104) },
  ];

  for (const { numPages, pages, expected } of cases) {
    it(`${numPages} pages, following ${pages.join(" then ")}`, async () => {
      delete (globalThis as unknown as Record<string, unknown>).IntersectionObserver;
      delete (window as unknown as Record<string, unknown>).IntersectionObserver;
      expect("IntersectionObserver" in window).toBe(false);
      const store = storeWith({ numPages, page: pages[0] });
      render(<PdfPagesPanel controller={store} />);
      await ready(numPages);
      for (const page of pages.slice(1)) act(() => store.set({ page }));

      await waitFor(() => expect(notPlaceholder()).toEqual(expected));
    });
  }
});

describe("SPEC-CORE-174 I5: the rail moves the viewer only when a cell is pressed", () => {
  it("calls goToPage once with the pressed page, and never on its own", async () => {
    const store = storeWith({ numPages: 225, page: 1 });
    const go = vi.fn();
    store.onGoToPage = go;
    const { rerender } = render(
      <InspectorActiveTabContext.Provider value="pages">
        <PdfPagesPanel controller={store} />
      </InspectorActiveTabContext.Provider>,
    );
    await ready(225);

    intersectPage(3, true);
    intersectPage(60, true);
    intersectPage(60, false);
    act(() => store.set({ page: 100 }));
    rerender(
      <InspectorActiveTabContext.Provider value="info">
        <PdfPagesPanel controller={store} />
      </InspectorActiveTabContext.Provider>,
    );
    rerender(
      <InspectorActiveTabContext.Provider value="pages">
        <PdfPagesPanel controller={store} />
      </InspectorActiveTabContext.Provider>,
    );
    act(() => store.set({ src: "/b.pdf", numPages: 225, page: 100 }));
    await ready(225);
    expect(go).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Go to page 7" }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(7);
  });
});

describe("SPEC-CORE-174 I6 I10: the rail's own scroll", () => {
  it("scrolls no cell into view when the viewer's page changes", async () => {
    const store = storeWith({ numPages: 225, page: 1 });
    render(<PdfPagesPanel controller={store} />);
    await ready(225);
    recordScrollWrites();

    act(() => store.set({ page: 100 }));
    act(() => store.set({ page: 2 }));
    await waitFor(() => expect(currentPages()).toEqual([2]));
    expect(scrollWrites.filter((el) => rail().contains(el))).toEqual([]);
  });

  it("writes no scroll while the Pages tab is not shown", async () => {
    const store = storeWith({ numPages: 225, page: 1 });
    const { rerender } = render(
      <InspectorActiveTabContext.Provider value="pages">
        <PdfPagesPanel controller={store} />
      </InspectorActiveTabContext.Provider>,
    );
    await ready(225);
    rerender(
      <InspectorActiveTabContext.Provider value="info">
        <PdfPagesPanel controller={store} />
      </InspectorActiveTabContext.Provider>,
    );
    recordScrollWrites();

    act(() => store.set({ page: 100 }));
    act(() => store.set({ page: 180 }));
    expect(currentPages()).toEqual([180]);
    expect(scrollWrites).toEqual([]);
  });
});

describe("SPEC-CORE-173 I8: no cell before the first page's proportion is known", () => {
  it("shows the loading text, and no cell, until getPage(1) answers", async () => {
    pdfMock.firstPage = "pending";
    render(
      <PdfPagesPanel
        controller={storeWith({
          numPages: 225,
          page: 1,
          outline: [{ depth: 0, title: "Part I", page: 1 }],
        })}
      />,
    );
    await waitFor(() => expect(pdfMock.releaseFirstPage).not.toBeNull());

    expect(screen.getByText("Loading PDF...")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Contents" })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-page-state]").length).toBe(0);

    await act(async () => pdfMock.releaseFirstPage!());
    await ready(225);
    expect(screen.queryByText("Loading PDF...")).toBeNull();
  });

  it("draws the grid when the first page's size cannot be read", async () => {
    pdfMock.firstPage = "reject";
    render(<PdfPagesPanel controller={storeWith({ numPages: 225, page: 1 })} />);
    await ready(225);
    expect(screen.queryByText("Loading PDF...")).toBeNull();
  });
});

describe("SPEC-CORE-174 I11: a change of document starts over", () => {
  it("drops every drawn page of the old document", async () => {
    const store = storeWith({ numPages: 225, page: 1, src: "/a.pdf" });
    render(<PdfPagesPanel controller={store} />);
    await ready(225);
    for (const page of [1, 2, 3, 40]) intersectPage(page, true);
    expect(notPlaceholder()).toEqual([1, 2, 3, 40]);

    pdfMock.numPages = 30;
    act(() => store.set({ src: "/b.pdf", numPages: 30, page: 1 }));
    await ready(30);
    expect(notPlaceholder()).toEqual([]);
  });
});

describe("SPEC-CORE-173 I12: a page that fails to render", () => {
  it("keeps its number and no text, stays pressable, and is not retried", async () => {
    pdfMock.failing = new Set([5]);
    const store = storeWith({ numPages: 225, page: 1 });
    const go = vi.fn();
    store.onGoToPage = go;
    render(<PdfPagesPanel controller={store} />);
    await ready(225);

    intersectPage(5, true);
    expect(stateOf(5)).toBe("failed");
    expect(cell(5).textContent).toBe("5");

    intersectPage(5, false);
    intersectPage(5, true);
    expect(stateOf(5)).toBe("failed");
    expect(pdfMock.pageMounts.get(5)).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Go to page 5" }));
    expect(go).toHaveBeenCalledWith(5);
  });
});

describe("PdfPagesTab", () => {
  it("SPEC-CORE-174 I11: opens no document until the tab has been on screen", async () => {
    // `InspectorShell` mounts every panel and hides the unselected ones, so an
    // eager `<Document>` would parse and rasterise behind `display: none`.
    render(<PdfPagesTab controller={storeWith({ numPages: 225, page: 1, src: "/a.pdf" })} />);
    expect(pdfMock.documentMounts).toBe(0);
    expect(document.querySelectorAll("[data-page-state]").length).toBe(0);

    intersectAll(true);
    expect(pdfMock.documentMounts).toBe(1);
    await ready(225);
  });

  it("SPEC-CORE-174 I11: keeps the document, and its drawn pages, once the reader has left the tab", async () => {
    render(<PdfPagesTab controller={storeWith({ numPages: 225, page: 1, src: "/a.pdf" })} />);
    intersectAll(true);
    await ready(225);
    intersectPage(2, true);
    expect(stateOf(2)).toBe("drawn");

    intersectAll(false);
    expect(pdfMock.documentUnmounts).toBe(0);
    expect(cells().length).toBe(225);
    expect(stateOf(2)).toBe("drawn");
    expect(pdfMock.pageMounts.get(2)).toBe(1);
  });
});
