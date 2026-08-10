import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { PdfPreview } from "../PdfPreview";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children: ReactNode;
    onLoadSuccess: (pdf: { numPages: number }) => void;
  }) => {
    useEffect(() => onLoadSuccess({ numPages: 8 }), [onLoadSuccess]);
    return <div>{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <div data-pdf-page={pageNumber}>Selectable page {pageNumber}</div>
  ),
}));

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
