import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TextPreview } from "../TextPreview";

describe("TextPreview document capture", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("publishes a selection through the shared document controller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("alpha\n beta", { status: 200 })),
    );
    const onDocumentCaptureController = vi.fn();
    render(
      <TextPreview
        fileId="text12345678"
        fileSize={12}
        onDocumentCaptureController={onDocumentCaptureController}
      />,
    );
    const content = await screen.findByText(/alpha/);
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event("selectionchange"));

    await waitFor(() => {
      const controller = onDocumentCaptureController.mock.calls.at(-1)?.[0];
      expect(controller?.getSnapshot()).toMatchObject({
        kind: "selection",
        quote: "alpha beta",
      });
    });
  });
});
