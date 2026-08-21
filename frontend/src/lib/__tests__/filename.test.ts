import { describe, expect, it } from "vitest";
import { selectStem, splitFilename } from "../filename";

function inputWith(value: string): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "text";
  el.value = value;
  document.body.appendChild(el);
  return el;
}

describe("splitFilename", () => {
  it.each([
    ["video.mp4", "video", ".mp4"],
    ["archive.tar.gz", "archive.tar", ".gz"],
    ["README", "README", ""],
    ["My Folder", "My Folder", ""],
    [".gitignore", ".gitignore", ""],
    ["noext.", "noext", "."],
    ["", "", ""],
  ])("splits %j into %j + %j", (input, stem, ext) => {
    expect(splitFilename(input)).toEqual({ stem, ext });
  });
});

describe("selectStem", () => {
  it("focuses the element", () => {
    const el = inputWith("video.mp4");
    selectStem(el);
    expect(document.activeElement).toBe(el);
  });

  it("selects the stem and leaves the extension untouched", () => {
    const el = inputWith("video.mp4");
    selectStem(el);
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe("video".length);
  });

  it("treats only the last dot as the extension boundary", () => {
    // Mirrors Path("archive.tar.gz").stem == "archive.tar" on the backend.
    const el = inputWith("archive.tar.gz");
    selectStem(el);
    expect(el.selectionEnd).toBe("archive.tar".length);
  });

  it("selects everything when there is no extension", () => {
    const el = inputWith("README");
    selectStem(el);
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe("README".length);
  });

  it("selects everything for a folder name containing spaces", () => {
    const el = inputWith("My Folder");
    selectStem(el);
    expect(el.selectionEnd).toBe("My Folder".length);
  });

  it("does not treat a leading dot as an extension boundary", () => {
    // The backend rejects hidden files outright, so a dotfile must not
    // degrade into an empty selection the user cannot see.
    const el = inputWith(".gitignore");
    selectStem(el);
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(".gitignore".length);
  });

  it("handles a trailing dot without selecting nothing", () => {
    const el = inputWith("noext.");
    selectStem(el);
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe("noext".length);
  });

  it("is a no-op selection on an empty value", () => {
    const el = inputWith("");
    selectStem(el);
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(0);
  });
});
