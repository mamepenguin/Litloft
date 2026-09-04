/**
 * The predicate three places used to write out for themselves.
 *
 * It decides whether a file brings its own page row. When one of the
 * three had a copy that disagreed — the fullscreen host, which had no
 * copy at all — the result was two breadcrumbs on one page and, on a
 * phone, two back controls.
 */
import { describe, it, expect } from "vitest";

import { usesDocumentShell } from "../fileDetailShell";

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
