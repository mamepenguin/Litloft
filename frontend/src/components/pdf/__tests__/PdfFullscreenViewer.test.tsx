import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import { PdfRasterCache, type Wants } from "@/lib/pdfRasterCache";
import { SPREAD_MODE_KEY } from "@/lib/spreadPreference";
import { installPointerEvent } from "@/test/pointerEvent";
import enMessages from "@/messages-core/en.json";

import { PdfCanvas } from "../PdfCanvas";
import { PdfFullscreenViewer } from "../PdfFullscreenViewer";

installPointerEvent();

const pageProps: {
  pageNumber: number;
  width: number;
  devicePixelRatio?: number;
  renderMode?: string;
  customRenderer?: unknown;
}[] = [];

/** A page the browser refuses to raster. */
let failingPage: number | null = null;
/** Pages refused only when drawn denser than this, as a zoom asks. */
let failAboveRatio = Infinity;

vi.mock("react-pdf", () => ({
  Page: (props: {
    pageNumber: number;
    width: number;
    devicePixelRatio?: number;
    renderMode?: string;
    customRenderer?: unknown;
    onRenderError?: () => void;
    onRenderSuccess?: () => void;
  }) => {
    pageProps.push(props);
    useEffect(() => {
      if (
        props.pageNumber === failingPage ||
        (props.devicePixelRatio ?? 1) > failAboveRatio
      ) {
        props.onRenderError?.();
      } else {
        props.onRenderSuccess?.();
      }
    });
    return (
      <div>
        <span>Text of page {props.pageNumber}</span>
        <div className="annotationLayer">
          <a href="#dest">link on page {props.pageNumber}</a>
        </div>
      </div>
    );
  },
}));

/** Stands in for the addon: shows what the viewer offers it to quote. */
function CaptureProbe({
  documentCaptureController,
  fileId,
  tone,
}: {
  documentCaptureController: DocumentCaptureController;
  fileId: string;
  tone?: string;
}) {
  const capture = useSyncExternalStore(
    documentCaptureController.subscribe,
    documentCaptureController.getSnapshot,
  );
  return (
    <output data-testid="capture" data-tone={tone}>
      {JSON.stringify({ fileId, capture })}
    </output>
  );
}

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id, props }: { id: string; props: Record<string, unknown> }) =>
    id === "document-viewer-actions" ? (
      <CaptureProbe
        documentCaptureController={props.documentCaptureController as DocumentCaptureController}
        fileId={props.fileId as string}
        tone={props.tone as string | undefined}
      />
    ) : null,
}));

const PORTRAIT = { width: 595, height: 842 };
const LANDSCAPE = { width: 1190, height: 842 };

function fakePdf(
  numPages: number,
  box: (n: number) => { width: number; height: number } | null = () => PORTRAIT,
): PDFDocumentProxy {
  return {
    numPages,
    getPage: (n: number) => {
      const b = box(n);
      // A page that never answers stays unknown.
      if (!b) return new Promise(() => {});
      return Promise.resolve({ getViewport: () => b });
    },
  } as unknown as PDFDocumentProxy;
}

class ImmediateResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe() {
    this.cb(
      [{ contentRect: { width: 1000, height: 800 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShortcutsProvider>{children}</ShortcutsProvider>
    </NextIntlClientProvider>
  );
}

async function open(
  pdf: PDFDocumentProxy,
  {
    initialPage = 1,
    onClose = vi.fn(),
    onPageTurned = vi.fn(),
    declaredDirection = null as "ltr" | "rtl" | null,
  } = {},
) {
  const r = render(
    <Wrap>
      <PdfFullscreenViewer
        pdf={pdf}
        title="Paper"
        initialPage={initialPage}
        declaredDirection={declaredDirection}
        slotProps={{ fileId: "f1", drive: "d", filename: "p.pdf", fileType: "document" }}
        onClose={onClose}
        onPageTurned={onPageTurned}
      />
    </Wrap>,
  );
  // Let the page sizes arrive.
  await act(async () => {});
  return { ...r, onClose, onPageTurned };
}

const shownPages = () =>
  [...document.querySelectorAll("[data-pdf-page]")].map((el) =>
    Number(el.getAttribute("data-pdf-page")),
  );
const faceKind = () => document.querySelector("[data-face]")!.getAttribute("data-face");

beforeEach(() => {
  pageProps.length = 0;
  failingPage = null;
  failAboveRatio = Infinity;
  vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
  localStorage.removeItem(SPREAD_MODE_KEY);
  localStorage.removeItem("image-viewer:reading-direction");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.removeItem(SPREAD_MODE_KEY);
  localStorage.removeItem("image-viewer:reading-direction");
});

describe("PdfFullscreenViewer", () => {
  it("opens on the page it was given, over the whole page", async () => {
    await open(fakePdf(8), { initialPage: 3 });
    expect(shownPages()).toEqual([3]);
    expect(screen.getByRole("dialog").parentElement).toBe(document.body);
  });

  it("hands back the page it was on when it closes", async () => {
    const { onClose } = await open(fakePdf(8), { initialPage: 3 });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(shownPages()).toEqual([4]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith(4);
  });

  it("reports each page turned to, without closing", async () => {
    const { onPageTurned, onClose } = await open(fakePdf(8), { initialPage: 3 });
    expect(onPageTurned).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onPageTurned).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(onPageTurned).toHaveBeenLastCalledWith(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports the first page of a pair, as it hands back on close", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    localStorage.setItem("image-viewer:reading-direction", "rtl");
    const { onPageTurned, onClose } = await open(fakePdf(8), { initialPage: 2 });
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await act(async () => {});
    expect(shownPages()).toEqual([4, 5]);
    expect(onPageTurned).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith(4);
  });

  it("does not report a move made from outside, nor a pair forming", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    const goToPageRef: { current: ((page: number) => void) | null } = { current: null };
    const onPageTurned = vi.fn();
    render(
      <Wrap>
        <PdfFullscreenViewer
          pdf={fakePdf(8)}
          title="Paper"
          initialPage={1}
          goToPageRef={goToPageRef}
          slotProps={{ fileId: "f1", drive: "d", filename: "p.pdf", fileType: "document" }}
          onClose={vi.fn()}
          onPageTurned={onPageTurned}
        />
      </Wrap>,
    );
    await act(async () => {});
    act(() => goToPageRef.current!(5));
    await act(async () => {});
    expect(shownPages()).toEqual([4, 5]);
    expect(onPageTurned).not.toHaveBeenCalled();
  });

  it("reports a page typed into its box", async () => {
    const { onPageTurned } = await open(fakePdf(8), { initialPage: 1 });
    const box = screen.getByLabelText("Page number") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "6" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await act(async () => {});
    expect(onPageTurned).toHaveBeenLastCalledWith(6);
  });

  it("closes with f as well as the close button", async () => {
    const { onClose } = await open(fakePdf(8), { initialPage: 2 });
    fireEvent.keyDown(document, { key: "f" });
    expect(onClose).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("pairs two portrait pages with the cover alone", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    await open(fakePdf(8), { initialPage: 1 });
    expect(shownPages()).toEqual([1]);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    await act(async () => {});
    expect(faceKind()).toBe("pair");
    expect(shownPages()).toEqual([2, 3]);
  });

  it("does not pair a page whose size has not arrived", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    await open(fakePdf(8, (n) => (n === 3 ? null : PORTRAIT)), { initialPage: 2 });
    expect(faceKind()).toBe("single");
    expect(shownPages()).toEqual([2]);
  });

  it("splits a wide page and turns it a half at a time", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    await open(fakePdf(8, () => LANDSCAPE), { initialPage: 4 });
    expect(faceKind()).toBe("half");
    expect(screen.getByText(/^A$/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(shownPages()).toEqual([4]);
    expect(screen.getByText(/^B$/)).toBeInTheDocument();
  });

  it("puts the earlier page of a pair on the right when reading right to left", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    localStorage.setItem("image-viewer:reading-direction", "rtl");
    await open(fakePdf(8), { initialPage: 2 });
    const face = document.querySelector<HTMLElement>("[data-face]")!;
    expect(face.style.flexDirection).toBe("row-reverse");
    expect(shownPages()).toEqual([2, 3]);
  });

  it("offers the page in view to quote, without an anchor, and the selection's page once text is selected", async () => {
    await open(fakePdf(8), { initialPage: 5 });
    const read = () => JSON.parse(screen.getByTestId("capture").textContent!);
    expect(read()).toEqual({
      fileId: "f1",
      capture: { kind: "page", locator: { page: 5 } },
    });

    const text = screen.getByText("Text of page 5").firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    // Where a browser would put it, so there is an anchor to leave out.
    range.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 30, height: 12 }) as DOMRect;
    act(() => {
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    const selected = read().capture;
    expect(selected.kind).toBe("selection");
    expect(selected.quote).toBe("Text");
    expect(selected.locator.page).toBe(5);
    expect(selected.anchor).toBeUndefined();
  });

  it("does not turn the page on a swipe that starts on a link", async () => {
    await open(fakePdf(8), { initialPage: 3 });
    const link = screen.getByText("link on page 3");
    fireEvent.pointerDown(link, { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 400 });
    fireEvent.pointerUp(link, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 400 });
    expect(shownPages()).toEqual([3]);
    const page = screen.getByText("Text of page 3");
    fireEvent.pointerDown(page, { pointerId: 2, pointerType: "touch", clientX: 300, clientY: 400 });
    fireEvent.pointerUp(page, { pointerId: 2, pointerType: "touch", clientX: 100, clientY: 400 });
    expect(shownPages()).toEqual([2]);
  });

  it("draws a zoomed page with more pixels, not a larger box", async () => {
    await open(fakePdf(8), { initialPage: 1 });
    const before = pageProps[pageProps.length - 1];
    fireEvent.keyDown(document, { key: "=" });
    const after = pageProps[pageProps.length - 1];
    expect(after.width).toBe(before.width);
    expect(after.devicePixelRatio!).toBeCloseTo(before.devicePixelRatio! * 1.25);
  });

  it("leaves the mouse to select: a click at the edge does not turn the page", async () => {
    await open(fakePdf(8), { initialPage: 3 });
    const page = screen.getByText("Text of page 3");
    fireEvent.pointerDown(page, { pointerId: 1, pointerType: "mouse", clientX: 2, clientY: 400 });
    fireEvent.pointerUp(page, { pointerId: 1, pointerType: "mouse", clientX: 2, clientY: 400 });
    expect(shownPages()).toEqual([3]);
  });

  it("takes the page out of reach while it is open", async () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    try {
      await open(fakePdf(8));
      expect(outside.hasAttribute("inert")).toBe(true);
      expect(screen.getByRole("dialog").className).toContain("z-[60]");
    } finally {
      outside.remove();
    }
  });

  it("draws a split page at twice the frame and slides to its other half", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    await open(fakePdf(8, () => LANDSCAPE), { initialPage: 4 });
    const face = () => document.querySelector<HTMLElement>("[data-face]")!;
    expect(face().style.width).toBe("200%");
    expect(face().style.transform).toBe("");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(face().style.transform).toBe("translateX(-50%)");
  });

  it("keeps saying a page of a pair cannot be drawn when the other one draws after it", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    failingPage = 2;
    await open(fakePdf(8), { initialPage: 2 });
    expect(shownPages()).toEqual([2, 3]);
    expect(screen.getByText(/could not be drawn/)).toBeInTheDocument();
  });

  it("stops saying so once the page draws at a smaller zoom", async () => {
    failAboveRatio = 1.1;
    await open(fakePdf(8), { initialPage: 2 });
    fireEvent.keyDown(document, { key: "=" });
    expect(screen.getByText(/could not be drawn/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "0" });
    expect(screen.queryByText(/could not be drawn/)).toBeNull();
  });

  it("tells the quote button it sits on a dark bar", async () => {
    await open(fakePdf(8));
    expect(screen.getByTestId("capture").dataset.tone).toBe("on-dark");
  });

  it("leaves the bar hidden on a mouse click, so a double-click stays on the page", async () => {
    vi.useFakeTimers();
    try {
      await open(fakePdf(8), { initialPage: 3 });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
      const page = screen.getByText("Text of page 3");
      fireEvent.pointerDown(page, { pointerId: 1, pointerType: "mouse", clientX: 500, clientY: 400 });
      fireEvent.pointerUp(page, { pointerId: 1, pointerType: "mouse", clientX: 500, clientY: 400 });
      expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
      expect(shownPages()).toEqual([3]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not carry one page's failure to the next page", async () => {
    failingPage = 2;
    await open(fakePdf(8), { initialPage: 2 });
    expect(screen.getByText(/could not be drawn/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.queryByText(/could not be drawn/)).toBeNull();
  });

  it("enters a page typed into the box from its first half", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    await open(fakePdf(8, () => LANDSCAPE), { initialPage: 4 });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText(/^B$/)).toBeInTheDocument();
    const box = screen.getByLabelText("Page number");
    fireEvent.change(box, { target: { value: "6" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await act(async () => {});
    expect(shownPages()).toEqual([6]);
    expect(screen.getByText(/^A$/)).toBeInTheDocument();
  });

  it("enters a page from its right half when reading right to left", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    localStorage.setItem("image-viewer:reading-direction", "rtl");
    await open(fakePdf(8, () => LANDSCAPE), { initialPage: 4 });
    const face = () => document.querySelector<HTMLElement>("[data-face]")!;
    const box = screen.getByLabelText("Page number");
    fireEvent.change(box, { target: { value: "6" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await act(async () => {});
    expect(shownPages()).toEqual([6]);
    expect(face().style.transform).toBe("translateX(-50%)");
  });

  it("keeps the bar up while text is selected", async () => {
    vi.useFakeTimers();
    try {
      await open(fakePdf(8), { initialPage: 3 });
      const range = document.createRange();
      range.selectNodeContents(screen.getByText("Text of page 3"));
      act(() => {
        window.getSelection()!.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so when a page cannot be drawn", async () => {
    failingPage = 2;
    await open(fakePdf(8), { initialPage: 2 });
    expect(screen.getByText(/could not be drawn/)).toBeInTheDocument();
  });

  it("names a pair by its first page, to quote and to hand back", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    // No selection events: in a browser the page sizes arriving, which is
    // what turns page 3 into the pair 2–3, fires none, and the quote has to
    // follow the face on its own.
    const noEvents = { removeAllRanges: () => {} } as unknown as Selection;
    vi.spyOn(window, "getSelection").mockReturnValue(noEvents);
    const { onClose } = await open(fakePdf(8), { initialPage: 3 });
    expect(shownPages()).toEqual([2, 3]);
    expect(JSON.parse(screen.getByTestId("capture").textContent!).capture).toEqual({
      kind: "page",
      locator: { page: 2 },
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith(2);
  });

  it("clears a selection when the face turns, even to the other half of the same page", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    await open(fakePdf(8, () => LANDSCAPE), { initialPage: 4 });
    const range = document.createRange();
    range.selectNodeContents(screen.getByText("Text of page 4"));
    act(() => {
      window.getSelection()!.addRange(range);
    });
    expect(window.getSelection()!.toString()).toBe("Text of page 4");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(window.getSelection()!.toString()).toBe("");
  });

  it("draws the next page at fit after a zoom", async () => {
    await open(fakePdf(8), { initialPage: 3 });
    const base = pageProps[pageProps.length - 1].devicePixelRatio!;
    fireEvent.keyDown(document, { key: "=" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(pageProps[pageProps.length - 1].devicePixelRatio).toBeCloseTo(base);
  });

  it("keeps its keys when something below binds the same one after it opened", async () => {
    function LateArrows() {
      useShortcuts("late", "late", [{ key: "arrowright", label: "late", handler: () => {} }]);
      return null;
    }
    const pdf = fakePdf(8);
    const { rerender } = render(
      <Wrap>
        <PdfFullscreenViewer pdf={pdf} title="Paper" initialPage={3} onClose={vi.fn()} />
      </Wrap>,
    );
    await act(async () => {});
    rerender(
      <Wrap>
        <PdfFullscreenViewer pdf={pdf} title="Paper" initialPage={3} onClose={vi.fn()} />
        <LateArrows />
      </Wrap>,
    );
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(shownPages()).toEqual([4]);
  });

  it("goes to a page a link inside the document names", async () => {
    function WithRef({ onReady }: { onReady: (go: (n: number) => void) => void }) {
      const ref = useRef<((page: number) => void) | null>(null);
      useEffect(() => {
        if (ref.current) onReady(ref.current);
      });
      return (
        <PdfFullscreenViewer
          pdf={fakePdf(8)}
          title="Paper"
          initialPage={1}
          goToPageRef={ref}
          onClose={vi.fn()}
        />
      );
    }
    let go: ((n: number) => void) | null = null;
    render(
      <Wrap>
        <WithRef onReady={(g) => (go = g)} />
      </Wrap>,
    );
    await act(async () => {});
    act(() => go!(6));
    await act(async () => {});
    expect(shownPages()).toEqual([6]);
  });

  describe("a document that declares its reading direction", () => {
    const DIRECTION_KEY = "image-viewer:reading-direction";

    it("opens in that direction over the reader's stored one", async () => {
      localStorage.setItem(SPREAD_MODE_KEY, "true");
      localStorage.setItem(DIRECTION_KEY, "ltr");
      await open(fakePdf(8), { initialPage: 2, declaredDirection: "rtl" });
      const face = document.querySelector<HTMLElement>("[data-face]")!;
      expect(face.style.flexDirection).toBe("row-reverse");
    });

    it("keeps a switch made here to this document", async () => {
      localStorage.setItem(SPREAD_MODE_KEY, "true");
      localStorage.setItem(DIRECTION_KEY, "ltr");
      await open(fakePdf(8), { initialPage: 2, declaredDirection: "rtl" });
      expect(localStorage.getItem(DIRECTION_KEY)).toBe("ltr");
      fireEvent.click(screen.getByRole("button", { name: "Reading direction" }));
      expect(document.querySelector<HTMLElement>("[data-face]")!.style.flexDirection).toBe("row");
      expect(localStorage.getItem(DIRECTION_KEY)).toBe("ltr");
    });

    it("opens left to right when the document says so, over a stored right to left", async () => {
      localStorage.setItem(SPREAD_MODE_KEY, "true");
      localStorage.setItem(DIRECTION_KEY, "rtl");
      await open(fakePdf(8), { initialPage: 2, declaredDirection: "ltr" });
      expect(document.querySelector<HTMLElement>("[data-face]")!.style.flexDirection).toBe("row");
    });

    it("starts a split page on its right half when the document reads right to left", async () => {
      localStorage.setItem(SPREAD_MODE_KEY, "true");
      localStorage.setItem(DIRECTION_KEY, "ltr");
      await open(fakePdf(8, () => LANDSCAPE), { initialPage: 4, declaredDirection: "rtl" });
      expect(document.querySelector<HTMLElement>("[data-face]")!.style.transform).toBe(
        "translateX(-50%)",
      );
    });

    it("leaves the stored direction in charge of a document that declares none", async () => {
      localStorage.setItem(SPREAD_MODE_KEY, "true");
      localStorage.setItem(DIRECTION_KEY, "rtl");
      await open(fakePdf(8), { initialPage: 2 });
      expect(document.querySelector<HTMLElement>("[data-face]")!.style.flexDirection).toBe("row-reverse");
      fireEvent.click(screen.getByRole("button", { name: "Reading direction" }));
      expect(localStorage.getItem(DIRECTION_KEY)).toBe("ltr");
    });
  });

  it("keeps the page's own keys from firing while it is open", async () => {
    const search = vi.fn();
    function PageKeys() {
      useShortcuts("global", "global", [{ key: "ctrl+k", label: "search", handler: search }]);
      return null;
    }
    render(
      <Wrap>
        <PageKeys />
        <PdfFullscreenViewer pdf={fakePdf(8)} title="Paper" initialPage={1} onClose={vi.fn()} />
      </Wrap>,
    );
    await act(async () => {});
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(search).not.toHaveBeenCalled();
  });
});

describe("PdfFullscreenViewer raster cache", () => {
  function wantsOf(spy: ReturnType<typeof vi.spyOn>): Wants {
    const calls = spy.mock.calls.filter(([owner]) => owner === "fullscreen");
    return calls[calls.length - 1][1] as Wants;
  }
  beforeEach(() => {
    vi.stubGlobal("devicePixelRatio", 2);
  });

  it("draws its pages through the cache's renderer", async () => {
    await open(fakePdf(8), { initialPage: 3 });
    const last = pageProps[pageProps.length - 1];
    expect(last.renderMode).toBe("custom");
    expect(last.customRenderer).toBe(PdfCanvas);
  });

  /** The first draw of `page` at or after `since`. */
  const firstDrawn = (page: number, since: number) =>
    pageProps.slice(since).find((p) => p.pageNumber === page)!;
  const scaleOf = (
    p: (typeof pageProps)[number],
    box: { width: number } = PORTRAIT,
  ) => (p.width / box.width) * (p.devicePixelRatio ?? 1);

  it("keeps the face on screen and prefetches the next then the previous page at the size a turn draws them", async () => {
    const want = vi.spyOn(PdfRasterCache.prototype, "want");
    await open(fakePdf(8), { initialPage: 3 });
    const wants = wantsOf(want);
    expect(wants.visiblePages).toEqual([3]);
    expect(wants.prefetch!.map((r) => r.pageNumber)).toEqual([4, 2]);

    const since = pageProps.length;
    fireEvent.keyDown(document, { key: "ArrowRight" });
    await act(async () => {});
    const drawn = firstDrawn(4, since);
    expect(drawn.renderMode).toBe("custom");
    expect(wants.prefetch![0].renderScale).toBeCloseTo(scaleOf(drawn), 4);
  });

  it("prefetches both pages of the next pair", async () => {
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    const want = vi.spyOn(PdfRasterCache.prototype, "want");
    await open(fakePdf(8), { initialPage: 1 });
    const wants = wantsOf(want);
    expect(wants.visiblePages).toEqual([1]);
    expect(wants.prefetch!.map((r) => r.pageNumber)).toEqual([2, 3]);

    const since = pageProps.length;
    fireEvent.keyDown(document, { key: "ArrowRight" });
    await act(async () => {});
    for (const [n, request] of [
      [2, wants.prefetch![0]],
      [3, wants.prefetch![1]],
    ] as const) {
      expect(request.renderScale).toBeCloseTo(scaleOf(firstDrawn(n, since)), 4);
    }
  });

  it("prefetches a pair too large for the pixel budget at the budgeted size", async () => {
    vi.stubGlobal("devicePixelRatio", 8);
    localStorage.setItem(SPREAD_MODE_KEY, "true");
    const want = vi.spyOn(PdfRasterCache.prototype, "want");
    await open(fakePdf(8), { initialPage: 1 });
    const wants = wantsOf(want);

    const since = pageProps.length;
    fireEvent.keyDown(document, { key: "ArrowRight" });
    await act(async () => {});
    const drawn = firstDrawn(2, since);
    expect(drawn.devicePixelRatio).toBeLessThan(8);
    expect(wants.prefetch![0].renderScale).toBeCloseTo(scaleOf(drawn), 4);
  });

  it("prefetches a page of another size at that page's own size", async () => {
    const want = vi.spyOn(PdfRasterCache.prototype, "want");
    await open(
      fakePdf(8, (n) => (n === 4 ? LANDSCAPE : PORTRAIT)),
      { initialPage: 3 },
    );
    await act(async () => {});
    const wants = wantsOf(want);

    const since = pageProps.length;
    fireEvent.keyDown(document, { key: "ArrowRight" });
    await act(async () => {});
    expect(wants.prefetch![0].renderScale).toBeCloseTo(
      scaleOf(firstDrawn(4, since), LANDSCAPE),
      4,
    );
  });

  it("keeps prefetching at the fit size while the page on screen is zoomed", async () => {
    const want = vi.spyOn(PdfRasterCache.prototype, "want");
    await open(fakePdf(8), { initialPage: 3 });
    const before = wantsOf(want).prefetch;

    fireEvent.keyDown(document, { key: "=" });
    fireEvent.keyDown(document, { key: "=" });
    await act(async () => {});
    const zoomed = pageProps[pageProps.length - 1];
    expect(zoomed.devicePixelRatio).toBeGreaterThan(2);
    expect(wantsOf(want).prefetch).toEqual(before);
  });

  it("gives its pages up when it closes", async () => {
    const release = vi.spyOn(PdfRasterCache.prototype, "release");
    const { unmount } = await open(fakePdf(8), { initialPage: 3 });
    unmount();
    expect(release).toHaveBeenCalledWith("fullscreen");
  });
});
