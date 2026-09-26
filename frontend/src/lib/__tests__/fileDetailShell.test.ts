import { describe, it, expect } from "vitest";

import type { FileType } from "@/types";
import {
  ridesFileDetailShell,
  usesDocumentShell,
  viewerTakesCanvasFloor,
} from "../fileDetailShell";

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
    for (const on of [canonical, collection]) {
      expect(on({ mimeType: "text/markdown", fileType: "document" })).toBe(true);
      expect(on({ mimeType: "text/html", fileType: "document" })).toBe(true);
    }
  });

  it("routes the other viewers through the shell as well", () => {
    expect(canonical({ mimeType: "application/pdf", fileType: "document" })).toBe(
      true,
    );
    expect(canonical({ mimeType: "application/zip", fileType: "archive" })).toBe(
      true,
    );
    expect(canonical({ mimeType: "image/jpeg", fileType: "image" })).toBe(true);
  });

  it("goes by the kind, not by one mime per kind", () => {
    // The backend classifies more than one mime into a kind, so keying on
    // one mime would route one archive through the shell and not the next.
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
    // The shell is the skeleton for opening a file, so the surface decides
    // and there is no list of kinds to be absent from.
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
    // `tsc`, not this test, enforces the enumeration: the mapped type makes
    // an added or removed `FileType` a compile error. The `toHaveLength`
    // only counts the literal table.
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
    expect(kinds.map(canonical)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("says no before the file has resolved, so the host keeps drawing the row", () => {
    // `fileType` is undefined exactly while the fetch is out, which is why
    // `ridesFileDetailShell` still takes a `fileType` it otherwise has no
    // use for.
    expect(canonical({})).toBe(false);
    expect(collection({})).toBe(false);
    expect(canonical({ mimeType: "application/pdf" })).toBe(false);
  });
});

describe("viewerTakesCanvasFloor", () => {
  it.each([
    ["document", "application/pdf", true],
    ["document", "application/epub+zip", true],
    ["archive", "application/zip", true],
    ["document", "text/plain", false],
    ["document", "text/html", false],
    ["image", "image/png", false],
  ])("%s %s → %s", (fileType, mimeType, expected) => {
    expect(viewerTakesCanvasFloor(fileType, mimeType)).toBe(expected);
  });
});
