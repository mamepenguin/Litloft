/**
 * The predicate three places used to write out for themselves.
 *
 * It decides whether a file brings its own page row. When one of the
 * three had a copy that disagreed — the fullscreen host, which had no
 * copy at all — the result was two breadcrumbs on one page and, on a
 * phone, two back controls.
 */
import { describe, it, expect } from "vitest";

import type { FileType } from "@/types";
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

  it("routes the kinds that were only ever a fallthrough as well", () => {
    // These used to keep the stacked layout, and the reason given was
    // that §7 named three viewers. That was a description of who had
    // been looked at, not a decision about these: an `.xlsx` had no
    // inspector and no way to open one, and neither did `text/plain`,
    // which was the biggest group left behind and does have a viewer.
    // The shell is the skeleton for opening a file, so the surface
    // decides and there is no list to be absent from.
    for (const mimeType of [
      "text/plain",
      "application/json",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/octet-stream",
    ]) {
      expect(canonical({ mimeType, fileType: "document" }), mimeType).toBe(true);
      expect(collection({ mimeType, fileType: "document" }), mimeType).toBe(
        false,
      );
    }
  });

  it("leaves no file_type off the shell", () => {
    // Enumerated over the union rather than over the kinds anyone
    // happened to think of, which is how `subtitle` and `other` came to
    // be on the old vertical stack without a decision being made about
    // either. One representative mime per kind, declared: a value
    // collected from the code under test could not catch a kind being
    // dropped, because it would leave both sides at once.
    const REPRESENTATIVE: { [K in FileType]: string } = {
      video: "video/mp4",
      image: "image/jpeg",
      audio: "audio/mpeg",
      document: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      archive: "application/zip",
      subtitle: "text/vtt",
      other: "application/octet-stream",
    };
    expect(Object.keys(REPRESENTATIVE)).toHaveLength(7);
    for (const [fileType, mimeType] of Object.entries(REPRESENTATIVE)) {
      expect(canonical({ mimeType, fileType }), fileType).toBe(true);
    }
  });

  it("answers by the surface, not by the kind", () => {
    // The property that replaced the list, stated so a future kind
    // cannot be silently left out of it: given a resolved file, the only
    // thing that changes the answer on the canonical surface is the
    // document form, which is `true` on both surfaces anyway.
    const kinds = [
      { mimeType: "video/mp4", fileType: "video" },
      { mimeType: "application/pdf", fileType: "document" },
      { mimeType: "image/heic", fileType: "image" },
      { mimeType: "application/zip", fileType: "archive" },
      { mimeType: "text/plain", fileType: "document" },
      { mimeType: "audio/mpeg", fileType: "audio" },
      { mimeType: "application/octet-stream", fileType: "other" },
      { mimeType: undefined, fileType: "other" },
    ];
    expect(kinds.map(canonical)).toEqual(kinds.map(() => true));
  });

  it("says no before the file has resolved, so the host keeps drawing the row", () => {
    // `fileType` is undefined exactly while the fetch is out. Answering
    // "yes" there takes the page row off the host for the whole of the
    // load and hands it back after, which is the jump the host draws its
    // row early to avoid — and it is why `ridesFileDetailShell` still
    // takes a `fileType` it otherwise has no use for.
    expect(canonical({})).toBe(false);
    expect(collection({})).toBe(false);
    expect(canonical({ mimeType: "application/pdf" })).toBe(false);
  });
});
