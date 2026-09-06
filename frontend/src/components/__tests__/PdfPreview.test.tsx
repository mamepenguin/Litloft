import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfPreview } from "../PdfPreview";
import { MAX_RASTER_PIXELS, rasterPixelRatio } from "@/lib/pdfZoomMode";
import { ShortcutsProvider } from "../ShortcutsProvider";

/**
 * What the mocked document says it holds. Set per test before rendering.
 *
 * `getOutline` is part of the contract this component reads, so the fake has
 * to answer it: a fake that omits it exercises only the branch where the call
 * throws, and the outline path would then be untested while looking covered.
 */
const pdfDoc = {
  numPages: 8,
  outline: null as unknown,
  getOutline: async () => pdfDoc.outline,
  getDestination: async (name: string) => pdfDoc.destinations[name] ?? null,
  getPageIndex: async (ref: unknown) => (ref as { index: number }).index,
  destinations: {} as Record<string, unknown>,
};

/** How many times a `<Page>` was drawn, across every render of the document. */
let pageRenders: number[] = [];

/** The `width` each of those renders was handed, newest last. */
let pageWidths: number[] = [];

/** The `devicePixelRatio` each render was handed. */
let pageRatios: number[] = [];

/** The page size the mocked document reports, in PDF points. */
let mockPageBox = { width: 595, height: 842 };

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children: ReactNode;
    onLoadSuccess: (pdf: unknown) => void;
  }) => {
    useEffect(() => {
      onLoadSuccess(pdfDoc);
    }, [onLoadSuccess]);
    return <div>{children}</div>;
  },
  Page: ({
    pageNumber,
    width,
    devicePixelRatio,
    onLoadSuccess,
  }: {
    pageNumber: number;
    width: number;
    devicePixelRatio?: number;
    onLoadSuccess?: (page: {
      getViewport: (o: { scale: number }) => { width: number; height: number };
    }) => void;
  }) => {
    pageRenders.push(pageNumber);
    pageWidths.push(width);
    pageRatios.push(devicePixelRatio ?? 1);
    useEffect(() => {
      onLoadSuccess?.({
        getViewport: () => ({ ...mockPageBox }),
      });
      // Reporting the page's own size does not depend on how wide it was
      // asked to draw, so the effect must not re-run when that changes —
      // it would set the same value back and loop.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageNumber]);
    return <div data-pdf-page={pageNumber}>Selectable page {pageNumber}</div>;
  },
}));

/**
 * jsdom ships no `ResizeObserver`, so both of the viewer's measurement
 * effects returned early and `availableWidth` / `availableHeight` were
 * frozen at their defaults. That is why deleting the whole height
 * observer left the suite green, and why the fit-page arithmetic — a
 * double padding subtraction — was invisible here.
 */
let resizeCallbacks: ResizeObserverCallback[] = [];
class DrivableResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    resizeCallbacks.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
/** Feed the nth observer a content-box size. 0 = width (root), 1 = height (box). */
function reportSize(index: number, rect: { width?: number; height?: number }) {
  const cb = resizeCallbacks[index];
  if (!cb) throw new Error(`no ResizeObserver at ${index}`);
  act(() => {
    cb(
      [{ contentRect: { width: 0, height: 0, ...rect } }] as unknown as ResizeObserverEntry[],
      {} as ResizeObserver,
    );
  });
}

beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal("ResizeObserver", DrivableResizeObserver);
  pdfDoc.numPages = 8;
  pdfDoc.outline = null;
  pdfDoc.destinations = {};
  pdfDoc.getOutline = async () => pdfDoc.outline;
  pageRenders = [];
  pageWidths = [];
  pageRatios = [];
  mockPageBox = { width: 595, height: 842 };
  window.localStorage.clear();
});

describe("PdfPreview", () => {
  it("publishes the current page as the non-OCR fallback", async () => {
    const onDocumentCaptureController = vi.fn();
    render(
      <PdfPreview
        fileId="pdf123456789"
        title="Paper"
        initialPage={3}
        onDocumentCaptureController={onDocumentCaptureController}
      />,
    );

    await screen.findByText("Selectable page 3");
    const controller = onDocumentCaptureController.mock.calls.at(-1)?.[0];
    expect(controller?.getSnapshot()).toEqual({
      kind: "page",
      locator: { page: 3 },
    });

    fireEvent.click(screen.getByRole("button", { name: /pdfNextPage|Next page/ }));
    await screen.findByText("Selectable page 4");
    expect(controller?.getSnapshot()).toEqual({
      kind: "page",
      locator: { page: 4 },
    });
  });

  it("publishes selected PDF text with the visible page", async () => {
    const onDocumentCaptureController = vi.fn();
    render(
      <PdfPreview
        fileId="pdf123456789"
        title="Paper"
        onDocumentCaptureController={onDocumentCaptureController}
      />,
    );
    const page = await screen.findByText("Selectable page 1");
    const range = document.createRange();
    range.selectNodeContents(page);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event("selectionchange"));

    await waitFor(() => {
      const controller = onDocumentCaptureController.mock.calls.at(-1)?.[0];
      expect(controller?.getSnapshot()).toMatchObject({
        kind: "selection",
        quote: "Selectable page 1",
        locator: { page: 1 },
      });
    });
  });

  it("follows a citation jump when initialPage changes on the same file", async () => {
    const onDocumentCaptureController = vi.fn();
    const { rerender } = render(
      <PdfPreview
        fileId="pdf123456789"
        title="Paper"
        initialPage={2}
        onDocumentCaptureController={onDocumentCaptureController}
      />,
    );
    await screen.findByText("Selectable page 2");

    rerender(
      <PdfPreview
        fileId="pdf123456789"
        title="Paper"
        initialPage={5}
        onDocumentCaptureController={onDocumentCaptureController}
      />,
    );

    await screen.findByText("Selectable page 5");
    const controller = onDocumentCaptureController.mock.calls.at(-1)?.[0];
    expect(controller?.getSnapshot()).toEqual({
      kind: "page",
      locator: { page: 5 },
    });
  });
});

describe("PdfPreview page navigation", () => {
  const pageBox = () => screen.getByLabelText("Page number") as HTMLInputElement;

  function renderViewer(props: Partial<React.ComponentProps<typeof PdfPreview>> = {}) {
    return render(
      <ShortcutsProvider>
        <PdfPreview fileId="pdf123456789" title="Paper" {...props} />
      </ShortcutsProvider>,
    );
  }

  it("goes to a page typed into the box and confirmed with Enter", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.change(pageBox(), { target: { value: "5" } });
    fireEvent.keyDown(pageBox(), { key: "Enter" });

    expect(await screen.findByText("Selectable page 5")).toBeInTheDocument();
    expect(pageBox().value).toBe("5");
  });

  it("goes to a page confirmed by leaving the box", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.change(pageBox(), { target: { value: "4" } });
    fireEvent.blur(pageBox());

    expect(await screen.findByText("Selectable page 4")).toBeInTheDocument();
  });

  it("puts the box back rather than moving to an edge", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    for (const bad of ["0", "9", "abc", ""]) {
      fireEvent.change(pageBox(), { target: { value: bad } });
      fireEvent.blur(pageBox());
      expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
      expect(pageBox().value).toBe("1");
    }
  });

  it("does not redraw the page while the number is being typed", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");
    const before = pageRenders.length;

    // Three keystrokes towards "225" in a document that has 8 pages: each one
    // re-renders the toolbar, and none of them may re-render the page. This
    // is what makes the draft state load-bearing rather than decorative.
    fireEvent.change(pageBox(), { target: { value: "2" } });
    fireEvent.change(pageBox(), { target: { value: "22" } });
    fireEvent.change(pageBox(), { target: { value: "225" } });

    expect(pageRenders.length).toBe(before);
  });

  it("turns pages with PageUp and PageDown", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.keyDown(document, { key: "PageDown" });
    expect(await screen.findByText("Selectable page 2")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "PageUp" });
    expect(await screen.findByText("Selectable page 1")).toBeInTheDocument();
  });

  it("leaves the arrows to the folder's previous and next file", async () => {
    // `useFileNav` binds them whenever `playerKind` is null, which a PDF is,
    // and `keyboard-shortcuts.md` has published that meaning. Taking them for
    // one file kind makes the arrows mean two things.
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "ArrowLeft" });

    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
  });

  it("does not turn the page while the number box has focus", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    pageBox().focus();
    fireEvent.keyDown(pageBox(), { key: "PageDown" });

    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
  });

  it("sizes the box by the page count's digits", async () => {
    pdfDoc.numPages = 225;
    renderViewer();
    await screen.findByText("Selectable page 1");
    expect(pageBox().style.width).toBe("5ch");
  });

  it("publishes the document's outline, with a page per entry", async () => {
    pdfDoc.numPages = 225;
    pdfDoc.destinations = { intro: [{ index: 2 }] };
    pdfDoc.outline = [
      { title: "Introduction", dest: "intro", items: [] },
      { title: "Nowhere", dest: "missing", items: [] },
    ];
    const onPdfController = vi.fn();
    renderViewer({ onPdfController });

    await screen.findByText("Selectable page 1");
    const controller = onPdfController.mock.calls.at(-1)?.[0];
    await waitFor(() => {
      expect(controller.getState().outline).toEqual([
        { depth: 0, title: "Introduction", page: 3 },
        { depth: 0, title: "Nowhere", page: null },
      ]);
    });
    expect(controller.getState().numPages).toBe(225);
  });

  it("publishes an empty outline, not a missing one, for a PDF without one", async () => {
    const onPdfController = vi.fn();
    renderViewer({ onPdfController });
    await screen.findByText("Selectable page 1");

    const controller = onPdfController.mock.calls.at(-1)?.[0];
    // `null` means "not asked yet" and decides whether the tab can exist;
    // `[]` means the document answered and has none.
    await waitFor(() => expect(controller.getState().outline).toEqual([]));
  });

  it("answers even when the document cannot be asked", async () => {
    // `null` is "not asked yet" and it is what the shell reads to decide
    // whether the page-list tab can exist. A document whose outline call
    // fails has to leave that state, or a consumer waits forever.
    pdfDoc.getOutline = async () => {
      throw new Error("broken");
    };
    const onPdfController = vi.fn();
    renderViewer({ onPdfController });
    await screen.findByText("Selectable page 1");

    const controller = onPdfController.mock.calls.at(-1)?.[0];
    await waitFor(() => expect(controller.getState().outline).toEqual([]));
  });

  it("moves the page when the controller is asked to", async () => {
    const onPdfController = vi.fn();
    renderViewer({ onPdfController });
    await screen.findByText("Selectable page 1");

    const controller = onPdfController.mock.calls.at(-1)?.[0];
    act(() => controller.goToPage(6));
    expect(await screen.findByText("Selectable page 6")).toBeInTheDocument();

    // And refuses one the document does not have.
    act(() => controller.goToPage(99));
    expect(screen.getByText("Selectable page 6")).toBeInTheDocument();
  });
});

describe("PdfPreview, the page box under pressure", () => {
  const pageBox = () => screen.getByLabelText("Page number") as HTMLInputElement;

  function renderViewer(props: Partial<React.ComponentProps<typeof PdfPreview>> = {}) {
    return render(
      <ShortcutsProvider>
        <PdfPreview fileId="pdf123456789" title="Paper" {...props} />
      </ShortcutsProvider>,
    );
  }

  it("abandons the draft on Escape rather than committing it", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    pageBox().focus();
    fireEvent.change(pageBox(), { target: { value: "5" } });
    fireEvent.keyDown(pageBox(), { key: "Escape" });

    // `blur()` re-enters React's `onBlur` synchronously, and the handler
    // there closes over the draft from before the state update — so Escape
    // used to commit the number it was meant to throw away.
    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
    expect(pageBox().value).toBe("1");
  });

  it("leaves an IME's confirming Enter to the IME", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    pageBox().focus();
    fireEvent.change(pageBox(), { target: { value: "5" } });
    // Mid-conversion.
    fireEvent.keyDown(pageBox(), { key: "Enter", isComposing: true });
    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();

    // And the keystroke that *ends* the conversion, which arrives afterwards
    // looking exactly like a bare press — `lib/ime.ts` records the
    // measurement, and `InlineNameEditor` guards the same way.
    fireEvent.compositionEnd(pageBox());
    fireEvent.keyDown(pageBox(), { key: "Enter" });
    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("still takes a deliberate Enter after a conversion has ended", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.change(pageBox(), { target: { value: "5" } });
    fireEvent.compositionEnd(pageBox());
    // Past the grace window: someone who chose a candidate with the mouse and
    // then reached for the keyboard takes far longer than this.
    vi.advanceTimersByTime(200);
    fireEvent.keyDown(pageBox(), { key: "Enter" });
    vi.useRealTimers();

    expect(await screen.findByText("Selectable page 5")).toBeInTheDocument();
  });

  it("does not leave a draft standing over a page that moved underneath it", async () => {
    const onPdfController = vi.fn();
    renderViewer({ onPdfController });
    await screen.findByText("Selectable page 1");

    fireEvent.change(pageBox(), { target: { value: "9" } });
    const controller = onPdfController.mock.calls.at(-1)?.[0];
    act(() => controller.goToPage(3));

    // A box reading "9" while the canvas is on 3 is a counter that lies about
    // where the reader is, with nothing to make it stop.
    expect(await screen.findByText("Selectable page 3")).toBeInTheDocument();
    expect(pageBox().value).toBe("3");
  });

  it("stops describing the previous document when the file changes", async () => {
    pdfDoc.numPages = 225;
    pdfDoc.outline = [{ title: "Part I", dest: "a", items: [] }];
    pdfDoc.destinations = { a: [{ index: 0 }] };
    const onPdfController = vi.fn();
    const { rerender } = render(
      <ShortcutsProvider>
        <PdfPreview fileId="pdfaaaaaaaaa" title="A" onPdfController={onPdfController} />
      </ShortcutsProvider>,
    );
    await screen.findByText("Selectable page 1");
    const controller = onPdfController.mock.calls.at(-1)?.[0];
    await waitFor(() => expect(controller.getState().numPages).toBe(225));

    // The mount is reused across files — the `[fileId]` resets exist for
    // that reason. Left alone, the page list draws A's table of contents over
    // B, and a jump validated against A's length sets page 121 on a 3-page
    // document.
    rerender(
      <ShortcutsProvider>
        <PdfPreview fileId="pdfbbbbbbbbb" title="B" onPdfController={onPdfController} />
      </ShortcutsProvider>,
    );
    expect(controller.getState().numPages).toBe(0);
    expect(controller.getState().outline).toBeNull();
    controller.goToPage(121);
    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
  });
});

describe("PdfPreview, the page keys' scope", () => {
  function renderViewer() {
    return render(
      <ShortcutsProvider>
        <div>
          <PdfPreview fileId="pdf123456789" title="Paper" />
          <button type="button">Elsewhere on the page</button>
        </div>
      </ShortcutsProvider>,
    );
  }

  it("turns pages while nothing else is focused", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");
    fireEvent.keyDown(document, { key: "PageDown" });
    expect(await screen.findByText("Selectable page 2")).toBeInTheDocument();
  });

  it("leaves the key alone once focus is somewhere else", async () => {
    // `ShortcutsProvider` calls `preventDefault` on every match, so an
    // unscoped binding stops `PageDown` scrolling the inspector — whose panel
    // is `tabIndex={0}` so a keyboard reader can scroll it — and stops it
    // scrolling a page zoomed past the canvas box.
    renderViewer();
    await screen.findByText("Selectable page 1");

    // In `act`, because focusing schedules the state change that pops the
    // shortcut context, and the provider's listener reads a ref that the
    // effect updates. Outside `act` the keydown can beat the pop.
    act(() => {
      screen.getByRole("button", { name: "Elsewhere on the page" }).focus();
    });
    fireEvent.keyDown(document, { key: "PageDown" });

    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
  });

  it("takes the key back when focus returns to the viewer", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");
    act(() => {
      screen.getByRole("button", { name: "Elsewhere on the page" }).focus();
    });
    act(() => {
      (screen.getByLabelText("Next page") as HTMLElement).focus();
    });

    fireEvent.keyDown(document, { key: "PageDown" });
    expect(await screen.findByText("Selectable page 2")).toBeInTheDocument();
  });

  it("resolves a destination that names its page outright", async () => {
    // pdf.js hands back a page *reference* for most documents and a 0-based
    // page *index* for some; `getPageIndex` throws on the second, which made
    // every row of such a document's contents dead.
    pdfDoc.numPages = 30;
    pdfDoc.destinations = { intro: [4] };
    pdfDoc.outline = [{ title: "Introduction", dest: "intro", items: [] }];
    const onPdfController = vi.fn();
    render(
      <ShortcutsProvider>
        <PdfPreview fileId="pdf123456789" title="Paper" onPdfController={onPdfController} />
      </ShortcutsProvider>,
    );
    await screen.findByText("Selectable page 1");

    const controller = onPdfController.mock.calls.at(-1)?.[0];
    await waitFor(() =>
      expect(controller.getState().outline).toEqual([
        { depth: 0, title: "Introduction", page: 5 },
      ]),
    );
  });
});

describe("PdfPreview zoom modes", () => {
  function renderViewer() {
    return render(
      <ShortcutsProvider>
        <PdfPreview fileId="pdf123456789" title="Paper" />
      </ShortcutsProvider>,
    );
  }

  const menu = () => screen.getByRole("button", { name: /Zoom mode/ });
  const modeRow = (name: string) =>
    screen.getByRole("menuitemradio", { name: new RegExp(name, "i") });
  const lastWidth = () => pageWidths[pageWidths.length - 1];

  it("offers exactly three modes, with fit width on", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(menu());
    const rows = screen
      .getAllByRole("menuitemradio")
      .map((row) => row.textContent?.trim());
    expect(rows).toEqual(["Fit width", "Whole page", "Actual size"]);
    expect(modeRow("Fit width")).toHaveAttribute("aria-checked", "true");
  });

  it("names the mode that is on, on the control itself", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");
    expect(menu()).toHaveTextContent("Fit width");

    fireEvent.click(menu());
    fireEvent.click(modeRow("Actual size"));
    expect(menu()).toHaveTextContent("Actual size");
  });

  it("draws actual size at 96 pixels to the inch", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(menu());
    fireEvent.click(modeRow("Actual size"));
    // A4: 595pt x 96/72.
    expect(lastWidth()).toBeCloseTo(595 * (96 / 72), 5);
  });

  it("puts the zoom back to 100% when the mode changes", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeInTheDocument();

    fireEvent.click(menu());
    fireEvent.click(modeRow("Whole page"));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("leaves the mode alone when the zoom changes", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(menu());
    fireEvent.click(modeRow("Actual size"));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(menu()).toHaveTextContent("Actual size");
    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(lastWidth()).toBeCloseTo(595 * (96 / 72) * 1.25, 5);
  });

  it("remembers the mode across a remount", async () => {
    const first = renderViewer();
    await screen.findByText("Selectable page 1");
    fireEvent.click(menu());
    fireEvent.click(modeRow("Whole page"));
    first.unmount();

    renderViewer();
    await screen.findByText("Selectable page 1");
    expect(menu()).toHaveTextContent("Whole page");
  });

  it("centres the page only while it fits", async () => {
    // A flex container centres an overflowing child by pushing half the
    // overflow past its *start* edge, where there is nothing to scroll
    // to. Measured on an A0 page at actual size: 1176px of a 3178px page
    // was unreachable. `safe center` falls back to `start` exactly when
    // the child does not fit — which is the case where centring has
    // nothing to centre anyway. jsdom lays nothing out, so the rule is
    // pinned as the declaration; the reachability is a browser
    // measurement.
    renderViewer();
    await screen.findByText("Selectable page 1");
    const box = document.querySelector(".overflow-auto")!;
    expect(box.className).toContain("[justify-content:safe_center]");
    // And not alongside plain `justify-center`, which would win or lose
    // on stylesheet order rather than on intent.
    expect(box.className).not.toMatch(/(^|\s)justify-center(\s|$)/);
  });

  it("hands <Page> the width the fit function computed", async () => {
    // `<= 900` was true of the 800px default whether or not the cap
    // existed, so it passed with `MAX_FITTED_WIDTH` deleted. The exact
    // number is what pins the path from the measured width to `<Page>`;
    // the cap itself is exercised against a 2000px canvas in
    // `lib/__tests__/pdfZoomMode.test.ts`, which is where it belongs.
    renderViewer();
    await screen.findByText("Selectable page 1");
    expect(pageWidths.length).toBeGreaterThan(0);
    expect(lastWidth()).toBe(800);

    reportSize(0, { width: 2032 });
    expect(lastWidth()).toBe(900);

    reportSize(0, { width: 532 });
    expect(lastWidth()).toBe(500);
  });

  it("budgets the raster rather than the layout on a very large page", async () => {
    // A0. At actual size the page is 3178px wide, and at 200% the canvas
    // behind it would be 12715 x 17973 device pixels on a DPR-2 screen —
    // an allocation Safari refuses, after which the page paints blank
    // with nothing thrown. The size the mode promises is unchanged; only
    // the ratio drops.
    Object.defineProperty(window, "devicePixelRatio", {
      value: 2,
      configurable: true,
    });
    mockPageBox = { width: 2384, height: 3370 };
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(menu());
    fireEvent.click(modeRow("Actual size"));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    const w = lastWidth();
    const ratio = pageRatios[pageRatios.length - 1];
    // Still 2384pt x 96/72 x 1.5 — the layout kept its promise.
    expect(w).toBeCloseTo(2384 * (96 / 72) * 1.5, 3);
    expect(ratio).toBeLessThan(2);
    const h = w * (3370 / 2384);
    expect(w * ratio * (h * ratio)).toBeLessThanOrEqual(MAX_RASTER_PIXELS + 1);
  });

  it("renders an ordinary page at the display's own ratio", () => {
    // The budget must not quietly coarsen every page.
    expect(
      rasterPixelRatio({ cssWidth: 794, cssHeight: 1123, devicePixelRatio: 2 }),
    ).toBe(2);
  });

  it("sizes a whole page from the box it is in, padding already excluded", async () => {
    // `contentRect` is the content box and this observer watches the
    // padded box itself, so subtracting `p-4` again drew every whole-page
    // render ~5.6% short with a band of dead grey under it. This is the
    // assertion that sees it.
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(menu());
    fireEvent.click(modeRow("Whole page"));
    reportSize(1, { height: 574 });

    // A4: the width at which 574px of height is exactly filled.
    expect(lastWidth()).toBeCloseTo(574 * (595 / 842), 3);
  });
});
