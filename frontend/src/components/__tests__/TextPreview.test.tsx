import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TextPreview, isTextPreviewable } from "../TextPreview";

describe("TextPreview document capture", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("publishes a selection through the shared document controller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("alpha\nbeta", { status: 200 })),
    );
    const onDocumentCaptureController = vi.fn();
    const { container } = render(
      <TextPreview
        fileId="text12345678"
        fileSize={12}
        onDocumentCaptureController={onDocumentCaptureController}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector("pre")?.textContent).toContain("beta"),
    );
    const range = document.createRange();
    range.selectNodeContents(container.querySelector("pre")!);
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

describe("TextPreview rendering", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function show(content: string, filename?: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(content, { status: 200 })),
    );
    const { container } = render(
      <TextPreview fileId="f1" fileSize={content.length} filename={filename} />,
    );
    await waitFor(() => expect(container.querySelector("pre")).not.toBeNull());
    return container.querySelector("pre")!;
  }

  it("colours a file whose name names a language", async () => {
    const pre = await show("fn main() {}\n", "main.rs");
    expect(pre.querySelector(".hljs-keyword")).not.toBeNull();
  });

  it("draws one element per line, with the break inside it", async () => {
    const pre = await show("a\nb\nc\n", "notes.unknownext");
    expect(pre.querySelectorAll(".code-line")).toHaveLength(3);
    expect(pre.textContent).toBe("a\nb\nc\n");
  });

  it.each([
    ["a\nb\nc\n", 3],
    ["a\nb\nc", 3],
    ["a\n\nc\n", 3],
    ["one line", 1],
  ])("draws %j as %i lines", async (content, count) => {
    const pre = await show(content, "notes.unknownext");
    expect(pre.querySelectorAll(".code-line")).toHaveLength(count);
  });

  it.each([
    ["fn main() {}\nlet x = 1;\n", "main.rs"],
    ["fn main() {}\nlet x = 1;", "main.rs"],
    ["a\nb\n", "notes.unknownext"],
    ["a\nb", "notes.unknownext"],
  ])("keeps every character of %j", async (content, filename) => {
    const pre = await show(content, filename);
    expect(pre.textContent).toBe(content);
  });

  it("does not read an uncoloured file's content as markup", async () => {
    const pre = await show("<script>alert(1)</script>\n", "notes.unknownext");
    expect(pre.querySelector("script")).toBeNull();
    expect(pre.textContent).toBe("<script>alert(1)</script>\n");
  });

  it("does not read an undecorated file's content as markup either", async () => {
    const content = `<script>alert(1)</script>\n${"x\n".repeat(6000)}`;
    const pre = await show(content, "notes.unknownext");
    expect(pre.querySelector("script")).toBeNull();
    expect(pre.textContent).toBe(content);
  });

  it("says why a file too large to decorate has no line numbers", async () => {
    const content = "x\n".repeat(6000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(content, { status: 200 })),
    );
    const { container } = render(
      <TextPreview fileId="f1" fileSize={content.length} filename="big.rs" />,
    );
    await waitFor(() => expect(container.querySelector("pre")).not.toBeNull());
    expect(container.querySelector(".code-line")).toBeNull();
    expect(container.querySelector("pre")!.textContent).toBe(content);
    expect(screen.getByText(/line numbers/i)).toBeInTheDocument();
  });

  it("leaves a single enormous line undecorated too", async () => {
    // One line, so the line limit says nothing about it.
    const pre = await show(`${"x".repeat(600_000)}\n`, "bundle.js");
    expect(pre.querySelector(".code-line")).toBeNull();
    expect(pre.textContent).toHaveLength(600_001);
  });

  it("breaks a CR-only file into the same lines however it is drawn", async () => {
    // The coloured path goes through an HTML parse, which folds CR to LF on
    // its own. Nothing folds it on the uncoloured path.
    const coloured = await show("let a = 1;\rlet b = 2;\r", "old.js");
    const plain = await show("let a = 1;\rlet b = 2;\r", "old.unknownext");
    expect(coloured.querySelectorAll(".code-line")).toHaveLength(2);
    expect(plain.querySelectorAll(".code-line")).toHaveLength(2);
    expect(plain.textContent).toBe("let a = 1;\nlet b = 2;\n");
    expect(coloured.textContent).toBe("let a = 1;\nlet b = 2;\n");
  });

  it("leaves a file with one enormous line undecorated", async () => {
    // Several grammars are quadratic in an unbroken alphanumeric run, so a
    // file well under the size limit can still take minutes to colour.
    const pre = await show(`x = "${"A".repeat(6000)}"\n`, "keys.ini");
    expect(pre.querySelector(".code-line")).toBeNull();
    expect(pre.textContent).toHaveLength(6007);
  });

  it("renders an empty file as no lines and no error", async () => {
    const pre = await show("", "empty.rs");
    expect(pre.querySelectorAll(".code-line")).toHaveLength(0);
    expect(pre.textContent).toBe("");
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
      // The image `backend/Dockerfile` builds carries no `/etc/mime.types`,
      // so these three come back `application/octet-stream` there.
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
    // with no extension; matching those against the *extension* list would
    // render ELF binaries into a `<pre>`.
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
