import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfPreview } from "../PdfPreview";
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
  Page: ({ pageNumber }: { pageNumber: number }) => {
    pageRenders.push(pageNumber);
    return <div data-pdf-page={pageNumber}>Selectable page {pageNumber}</div>;
  },
}));

beforeEach(() => {
  pdfDoc.numPages = 8;
  pdfDoc.outline = null;
  pdfDoc.destinations = {};
  pdfDoc.getOutline = async () => pdfDoc.outline;
  pageRenders = [];
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
