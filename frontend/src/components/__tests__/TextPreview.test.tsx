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
      // Measured inside the image `backend/Dockerfile` builds: it carries no
      // `/etc/mime.types`, so Python's own table answers, and these three
      // come back `application/octet-stream` there. The name is the only
      // thing left that knows what they are.
      "server.ts",
      "docker-compose.yml",
      "config.yaml",
    ]) {
      expect(isTextPreviewable(OPAQUE, name)).toBe(true);
    }
  });

  it("refuses binaries, whatever they are called", () => {
    for (const name of ["app.bin", "photo.raw", "a.out", "lib.so", "notes"]) {
      expect(isTextPreviewable(OPAQUE, name)).toBe(false);
    }
  });

  it("refuses an executable named after the language it compiles", () => {
    // A `bin/` tree inside a ZIP is where an extension allowlist meets names
    // with no extension. Matching those against the *extension* list opened
    // ELF binaries and rendered them into a `<pre>` — and, being openable,
    // they lost the download too. `usr/bin/env` is in a large share of
    // tarball-shaped archives.
    for (const name of [
      "usr/bin/env",
      "bin/go",
      "bin/java",
      "bin/swift",
      "bin/patch",
      "bin/diff",
      "bin/c",
      "bin/r",
    ]) {
      expect(isTextPreviewable(OPAQUE, name)).toBe(false);
    }
  });

  it("reads a dotfile by its leading segment, not its trailing one", () => {
    expect(isTextPreviewable(OPAQUE, ".gitignore")).toBe(true);
    expect(isTextPreviewable(OPAQUE, ".gitattributes")).toBe(true);
    expect(isTextPreviewable(OPAQUE, ".env")).toBe(true);
    // `.env.local` is an env file. Reading the last segment would ask
    // whether `local` is a language, and answer no.
    expect(isTextPreviewable(OPAQUE, ".env.local")).toBe(true);
    expect(isTextPreviewable(OPAQUE, ".DS_Store")).toBe(false);
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
