import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useSyncExternalStore, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import { SPREAD_MODE_KEY } from "@/lib/spreadPreference";
import { installPointerEvent } from "@/test/pointerEvent";
import enMessages from "@/messages-core/en.json";

import { PdfFullscreenViewer } from "../PdfFullscreenViewer";

installPointerEvent();

const pageProps: { pageNumber: number; width: number; devicePixelRatio?: number }[] = [];

vi.mock("react-pdf", () => ({
  Page: (props: { pageNumber: number; width: number; devicePixelRatio?: number }) => {
    pageProps.push(props);
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
}: {
  documentCaptureController: DocumentCaptureController;
  fileId: string;
}) {
  const capture = useSyncExternalStore(
    documentCaptureController.subscribe,
    documentCaptureController.getSnapshot,
  );
  return <output data-testid="capture">{JSON.stringify({ fileId, capture })}</output>;
}

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id, props }: { id: string; props: Record<string, unknown> }) =>
    id === "document-viewer-actions" ? (
      <CaptureProbe
        documentCaptureController={props.documentCaptureController as DocumentCaptureController}
        fileId={props.fileId as string}
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
  { initialPage = 1, onClose = vi.fn() } = {},
) {
  const r = render(
    <Wrap>
      <PdfFullscreenViewer
        pdf={pdf}
        title="Paper"
        initialPage={initialPage}
        slotProps={{ fileId: "f1", drive: "d", filename: "p.pdf", fileType: "document" }}
        onClose={onClose}
      />
    </Wrap>,
  );
  // Let the page sizes arrive.
  await act(async () => {});
  return { ...r, onClose };
}

const shownPages = () =>
  [...document.querySelectorAll("[data-pdf-page]")].map((el) =>
    Number(el.getAttribute("data-pdf-page")),
  );
const faceKind = () => document.querySelector("[data-face]")!.getAttribute("data-face");

beforeEach(() => {
  pageProps.length = 0;
  vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
  localStorage.removeItem(SPREAD_MODE_KEY);
  localStorage.removeItem("image-viewer:reading-direction");
});

afterEach(() => {
  vi.unstubAllGlobals();
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
});
