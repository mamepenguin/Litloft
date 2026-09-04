/**
 * The predicate three places used to write out for themselves.
 *
 * It decides whether a file brings its own page row. When one of the
 * three had a copy that disagreed — the fullscreen host, which had no
 * copy at all — the result was two breadcrumbs on one page and, on a
 * phone, two back controls.
 */
import { describe, it, expect } from "vitest";

import { ridesFileDetailShell, usesDocumentShell } from "../fileDetailShell";

describe("usesDocumentShell", () => {
  it("sends Markdown to the shell when the drive allows the editor", () => {
    expect(usesDocumentShell("text/markdown", true)).toBe(true);
  });

  it("keeps Markdown out of it on a drive that turned the editor off", () => {
    expect(usesDocumentShell("text/markdown", false)).toBe(false);
  });

  it("sends HTML there whatever the editor policy says", () => {
    // The HTML preview rides the shell for the single-scroll layout and
    // never mounts the editor slot, so the editor policy is not its
    // business either way.
    expect(usesDocumentShell("text/html", true)).toBe(true);
    expect(usesDocumentShell("text/html", false)).toBe(true);
  });

  it("leaves every other type to its host", () => {
    for (const mime of [
      "video/mp4",
      "audio/mpeg",
      "image/jpeg",
      "application/pdf",
      "application/zip",
      "text/plain",
    ]) {
      expect(usesDocumentShell(mime, true)).toBe(false);
    }
  });

  it("says no before the file has resolved", () => {
    // Both hosts ask this while `file` is still null. Answering "yes"
    // there would suppress the row for the whole of the fetch and then
    // add it, which is the jump the row is drawn early to avoid.
    expect(usesDocumentShell(undefined, true)).toBe(false);
  });
});

describe("ridesFileDetailShell", () => {
  const canonical = (file: { mimeType?: string; fileType?: string }) =>
    ridesFileDetailShell({
      surface: "canonical",
      mimeType: file.mimeType,
      fileType: file.fileType,
      knowledgeEditorEnabled: true,
    });
  const collection = (file: { mimeType?: string; fileType?: string }) =>
    ridesFileDetailShell({
      surface: "collection",
      mimeType: file.mimeType,
      fileType: file.fileType,
      knowledgeEditorEnabled: true,
    });

  it("routes media through the shell on the canonical surface", () => {
    expect(canonical({ mimeType: "video/mp4", fileType: "video" })).toBe(true);
    expect(canonical({ mimeType: "audio/mpeg", fileType: "audio" })).toBe(true);
  });

  it("routes a .loft there too, whatever its file_type says", () => {
    // Classification reports `.loft` as video so search filters include
    // it; the shell decision follows the player, not the classification.
    expect(
      canonical({
        mimeType: "application/vnd.litloft.loft+json",
        fileType: "document",
      }),
    ).toBe(true);
  });

  it("leaves media on the collection route alone", () => {
    // `/files/{id}` keeps the legacy stack: the canonical URL is a
    // file's address, so a second inspector there would be work to
    // throw away.
    expect(collection({ mimeType: "video/mp4", fileType: "video" })).toBe(false);
    expect(collection({ mimeType: "audio/mpeg", fileType: "audio" })).toBe(
      false,
    );
  });

  it("keeps documents on the shell on both surfaces", () => {
    // A note has drawn its own page row on both for far longer than any
    // of this. Taking it away on one of them would be a regression, not
    // a scoping decision.
    for (const on of [canonical, collection]) {
      expect(on({ mimeType: "text/markdown", fileType: "document" })).toBe(true);
      expect(on({ mimeType: "text/html", fileType: "document" })).toBe(true);
    }
  });

  it("routes the other viewers through the shell as well", () => {
    // The three §7 named. Each had one column with the viewer on top and
    // everything else under it, so the viewer's height came out of what
    // was left — a 190-page archive got 100px of it and 440px of
    // metadata. The shell makes the viewer the canvas.
    expect(canonical({ mimeType: "application/pdf", fileType: "document" })).toBe(
      true,
    );
    expect(canonical({ mimeType: "application/zip", fileType: "archive" })).toBe(
      true,
    );
    expect(canonical({ mimeType: "image/jpeg", fileType: "image" })).toBe(true);
  });

  it("goes by the kind, not by one mime per kind", () => {
    // An archive is a `file_type`, and the backend classifies two mimes
    // into it (`application/zip` and `application/x-zip-compressed`,
    // `backend/app/services/filetype.py`). Keying on one of them would
    // route one archive through the shell and leave the next on the old
    // layout. Images are worse: `mimetypes` resolves a whole family.
    expect(
      canonical({ mimeType: "application/x-zip-compressed", fileType: "archive" }),
    ).toBe(true);
    expect(canonical({ mimeType: "image/heic", fileType: "image" })).toBe(true);
  });

  it("leaves the other viewers on the collection route alone", () => {
    for (const file of [
      { mimeType: "application/pdf", fileType: "document" },
      { mimeType: "application/zip", fileType: "archive" },
      { mimeType: "image/jpeg", fileType: "image" },
    ]) {
      expect(collection(file)).toBe(false);
    }
  });

  it("still leaves the kinds nobody has moved to their host", () => {
    // Plain text and the office formats keep the stacked layout: §7
    // named three viewers, and a text file has no viewer whose height is
    // being squeezed. They are Phase 4's.
    expect(canonical({ mimeType: "text/plain", fileType: "document" })).toBe(
      false,
    );
    expect(
      canonical({
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileType: "document",
      }),
    ).toBe(false);
  });

  it("says no before the file has resolved", () => {
    expect(canonical({})).toBe(false);
    expect(collection({})).toBe(false);
  });
});
