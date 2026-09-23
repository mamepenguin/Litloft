import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfPreview } from "../PdfPreview";
import { MAX_RASTER_PIXELS, rasterPixelRatio } from "@/lib/pdfZoomMode";
import { ShortcutsProvider } from "../ShortcutsProvider";

const pdfDoc = {
  numPages: 8,
  outline: null as unknown,
  getOutline: async () => pdfDoc.outline,
  getDestination: async (name: string) => pdfDoc.destinations[name] ?? null,
  getPageIndex: async (ref: unknown) => (ref as { index: number }).index,
  destinations: {} as Record<string, unknown>,
};

let pageRenders: number[] = [];

let pageWidths: number[] = [];

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

let resizeCallbacks: ResizeObserverCallback[] = [];
let resizeTargets: Element[] = [];
class DrivableResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
    resizeCallbacks.push(cb);
  }
  observe(target: Element) {
    resizeTargets.push(target);
  }
  unobserve() {}
  disconnect() {
    // A torn-down observer leaves the list: the viewer's `ToolbarMenu`
    // observes while it is open, and an append-only list would count that
    // forever.
    const at = resizeCallbacks.indexOf(this.cb);
    if (at !== -1) resizeCallbacks.splice(at, 1);
  }
}
/**
 * `height` is the usable height — the border box less `p-4` — because
 * that is what the viewer derives and what the fit arithmetic is written
 * against. `contentHeight` is the content box, which a horizontal
 * scrollbar shrinks *without* moving the border box; pass it to stage
 * that state and nothing else.
 */
function reportSize(rect: {
  width?: number;
  height?: number;
  contentHeight?: number;
  /** Stage a browser whose entries predate `borderBoxSize`. */
  omitBorderBox?: boolean;
}) {
  const cb = resizeCallbacks[0];
  if (!cb) throw new Error("the viewer registered no ResizeObserver");
  if (resizeCallbacks.length !== 1) {
    throw new Error(`expected one observer, found ${resizeCallbacks.length}`);
  }
  const usableHeight = rect.height ?? 0;
  act(() => {
    cb(
      [
        {
          contentRect: {
            width: rect.width ?? 0,
            height: rect.contentHeight ?? usableHeight,
          },
          borderBoxSize: rect.omitBorderBox
            ? undefined
            : [
                {
                  inlineSize: (rect.width ?? 0) + 32,
                  blockSize: usableHeight + 32,
                },
              ],
        },
      ] as unknown as ResizeObserverEntry[],
      {} as ResizeObserver,
    );
  });
}

beforeEach(() => {
  resizeCallbacks = [];
  resizeTargets = [];
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

    fireEvent.click(
      screen.getByRole("button", { name: /pdfNextPage|Next page/ }),
    );
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
  const pageBox = () =>
    screen.getByLabelText("Page number") as HTMLInputElement;

  function renderViewer(
    props: Partial<React.ComponentProps<typeof PdfPreview>> = {},
  ) {
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
    // `useFileNav` binds them whenever `playerKind` is null, which a PDF is.
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

    act(() => controller.goToPage(99));
    expect(screen.getByText("Selectable page 6")).toBeInTheDocument();
  });
});

describe("PdfPreview, the page box under pressure", () => {
  const pageBox = () =>
    screen.getByLabelText("Page number") as HTMLInputElement;

  function renderViewer(
    props: Partial<React.ComponentProps<typeof PdfPreview>> = {},
  ) {
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
    // there closes over the draft from before the state update.
    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();
    expect(pageBox().value).toBe("1");
  });

  it("leaves an IME's confirming Enter to the IME", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");

    pageBox().focus();
    fireEvent.change(pageBox(), { target: { value: "5" } });
    fireEvent.keyDown(pageBox(), { key: "Enter", isComposing: true });
    expect(screen.getByText("Selectable page 1")).toBeInTheDocument();

    // The keystroke that *ends* the conversion arrives afterwards looking
    // exactly like a bare press.
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
        <PdfPreview
          fileId="pdfaaaaaaaaa"
          title="A"
          onPdfController={onPdfController}
        />
      </ShortcutsProvider>,
    );
    await screen.findByText("Selectable page 1");
    const controller = onPdfController.mock.calls.at(-1)?.[0];
    await waitFor(() => expect(controller.getState().numPages).toBe(225));

    // The mount is reused across files — the `[fileId]` resets exist for
    // that reason.
    rerender(
      <ShortcutsProvider>
        <PdfPreview
          fileId="pdfbbbbbbbbb"
          title="B"
          onPdfController={onPdfController}
        />
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
    // unscoped binding stops `PageDown` scrolling anything else.
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
    // page *index* for some; `getPageIndex` throws on the second.
    pdfDoc.numPages = 30;
    pdfDoc.destinations = { intro: [4] };
    pdfDoc.outline = [{ title: "Introduction", dest: "intro", items: [] }];
    const onPdfController = vi.fn();
    render(
      <ShortcutsProvider>
        <PdfPreview
          fileId="pdf123456789"
          title="Paper"
          onPdfController={onPdfController}
        />
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

  it("opens the mode menu outside the player box on a phone", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(max-width: 639.98px)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const { container } = renderViewer();
      await screen.findByText("Selectable page 1");
      fireEvent.click(menu());
      const panel = screen.getByRole("menu");
      expect(panel.parentElement).toBe(document.body);
      expect(container.contains(panel)).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

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
    // to. `safe center` falls back to `start` exactly when the child does
    // not fit.
    renderViewer();
    await screen.findByText("Selectable page 1");
    const box = document.querySelector(".overflow-auto")!;
    expect(box.className).toContain("[justify-content:safe_center]");
    // And not alongside plain `justify-center`, which would win or lose
    // on stylesheet order rather than on intent.
    expect(box.className).not.toMatch(/(^|\s)justify-center(\s|$)/);
  });

  it("hands <Page> the width the fit function computed", async () => {
    renderViewer();
    await screen.findByText("Selectable page 1");
    expect(pageWidths.length).toBeGreaterThan(0);
    expect(lastWidth()).toBe(800);

    // `contentRect` is the content box already — no hand subtraction.
    reportSize({ width: 2032, height: 574 });
    expect(lastWidth()).toBe(900);

    reportSize({ width: 532, height: 574 });
    expect(lastWidth()).toBe(532);
  });

  it("budgets the raster rather than the layout on a very large page", async () => {
    // A0 at 200% on a DPR-2 screen is a canvas allocation Safari refuses,
    // after which the page paints blank with nothing thrown.
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
    expect(
      rasterPixelRatio({ cssWidth: 794, cssHeight: 1123, devicePixelRatio: 2 }),
    ).toBe(2);
  });

  it("sizes a whole page from the box it is in, padding already excluded", async () => {
    // `contentRect` is the content box and this observer watches the
    // padded box itself, so `p-4` is not subtracted again.
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(menu());
    fireEvent.click(modeRow("Whole page"));
    reportSize({ width: 900, height: 574 });

    // A4: the width at which 574px of height is exactly filled.
    expect(lastWidth()).toBeCloseTo(574 * (595 / 842), 3);
  });

  it("measures the scroll box itself, not the root that contains it", async () => {
    // The root has no padding of its own and does not narrow when the
    // box's scrollbar appears.
    renderViewer();
    await screen.findByText("Selectable page 1");

    expect(resizeTargets).toHaveLength(1);
    expect(resizeTargets[0]).toBe(document.querySelector(".overflow-auto"));
  });

  it("reserves the scrollbar's gutter on both edges of the scroll box", async () => {
    // Without a reservation a classic vertical scrollbar takes its width
    // out of `contentRect.width` as it appears, and `fit-width` oscillates.
    // `both-edges` rather than plain `stable`: "whole page" draws no
    // vertical scrollbar, so a one-sided reservation would centre it off true.
    renderViewer();
    await screen.findByText("Selectable page 1");

    const box = document.querySelector(".overflow-auto")!;
    expect(box.className).toMatch(/\[scrollbar-gutter:stable_both-edges\]/);
  });

  it("keeps the box's padding class in step with the fallback that names it", async () => {
    // The padding is read off the element, except where nothing computes
    // styles, where a `32` stands in for `p-4`.
    renderViewer();
    await screen.findByText("Selectable page 1");

    const box = document.querySelector(".overflow-auto")!;
    expect(box.className).toMatch(/(^|\s)p-4(\s|$)/);
  });

  it("takes the padding from the element, not from a constant", async () => {
    // `p-4` is `1rem`, so a reader whose browser default font size is
    // 20px has 40px of padding, not 32.
    renderViewer();
    await screen.findByText("Selectable page 1");

    const box = document.querySelector(".overflow-auto") as HTMLElement;
    box.style.paddingTop = "20px";
    box.style.paddingBottom = "20px";

    fireEvent.click(menu());
    fireEvent.click(modeRow("Whole page"));
    // The fake's border box is `height + 32`; the usable height is that
    // less the 40px actually on the element.
    reportSize({ width: 900, height: 574 });

    expect(lastWidth()).toBeCloseTo((606 - 40) * (595 / 842), 3);
  });

  it("falls back to the content box where entries carry no border box", async () => {
    // `borderBoxSize` postdates `ResizeObserver`, so the `typeof
    // ResizeObserver` guard does not cover it.
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(menu());
    fireEvent.click(modeRow("Whole page"));
    reportSize({ width: 900, contentHeight: 574, omitBorderBox: true });

    expect(lastWidth()).toBeCloseTo(574 * (595 / 842), 3);
  });

  it("keeps a whole page the same size when a horizontal scrollbar appears", async () => {
    // The height comes from the border box for this reason. A horizontal
    // scrollbar takes its thickness out of the *content* box only, and
    // `fit-page` turns height into width: were the height read from
    // there, a narrower page would retire the scrollbar, the height would
    // grow back, and the page would flicker between two widths forever.
    renderViewer();
    await screen.findByText("Selectable page 1");

    fireEvent.click(menu());
    fireEvent.click(modeRow("Whole page"));
    reportSize({ width: 900, height: 574 });
    const settled = lastWidth();

    // Same element, same 80vh: only the content box shrank.
    reportSize({ width: 900, height: 574, contentHeight: 559 });
    expect(lastWidth()).toBe(settled);
  });
});
