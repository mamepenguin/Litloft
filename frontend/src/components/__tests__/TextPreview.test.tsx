import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TextPreview, isTextPreviewable } from "../TextPreview";

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

describe("isTextPreviewable", () => {
  // The mime a ZIP entry carries is guessed from its name by the same
  // `classify` table the drive listing's type column reads, so it says
  // `application/octet-stream` for every language that column has no bucket
  // for. Widening that table would move every `.dart` file in every drive
  // into "document"; widening this function moves nothing but what this
  // viewer will render.
  const OPAQUE = "application/octet-stream";

  it("opens source and config files an archive names but no mime describes", () => {
    for (const name of [
      "main.dart",
      "src/main.rs",
      "Cargo.toml",
      "Makefile",
      "LICENSE",
      "app/build.gradle",
      ".gitignore",
      ".env",
      "schema.sql",
      "Component.vue",
    ]) {
      expect(isTextPreviewable(OPAQUE, name)).toBe(true);
    }
  });

  it("refuses binaries, whatever they are called", () => {
    for (const name of ["app.bin", "photo.raw", "a.out", "lib.so", "notes"]) {
      expect(isTextPreviewable(OPAQUE, name)).toBe(false);
    }
  });

  it("still answers on the mime alone, for the callers that pass no name", () => {
    // `FilePreview` passes one argument, and a real file's mime was set by
    // the same table on the way in, so it is worth trusting there.
    expect(isTextPreviewable("text/markdown")).toBe(true);
    expect(isTextPreviewable("application/json")).toBe(true);
    expect(isTextPreviewable(OPAQUE)).toBe(false);
    // The name is what the archive adds; without it the answer must not move.
    expect(isTextPreviewable(OPAQUE, undefined)).toBe(false);
  });

  it("reads the extension, not the path around it", () => {
    expect(isTextPreviewable(OPAQUE, "rs/notes")).toBe(false);
    expect(isTextPreviewable(OPAQUE, "deep/dir.rs/thing.bin")).toBe(false);
    expect(isTextPreviewable(OPAQUE, "MAIN.DART")).toBe(true);
  });
});
