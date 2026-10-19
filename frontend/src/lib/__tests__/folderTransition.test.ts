import { describe, expect, it } from "vitest";

import { folderTransitionKind } from "../folderTransition";

describe("folderTransitionKind", () => {
  it("goes down into a child", () => {
    expect(folderTransitionKind("/drive/main", "/drive/main/movies")).toBe(
      "folder-down",
    );
  });

  it("goes down more than one level at once", () => {
    expect(
      folderTransitionKind("/drive/main", "/drive/main/movies/2026"),
    ).toBe("folder-down");
  });

  it("goes up to an ancestor", () => {
    expect(
      folderTransitionKind("/drive/main/movies/2026", "/drive/main/movies"),
    ).toBe("folder-up");
  });

  it("goes up to the drive root", () => {
    expect(folderTransitionKind("/drive/main/movies", "/drive/main")).toBe(
      "folder-up",
    );
  });

  it("is flat between two folders side by side", () => {
    expect(
      folderTransitionKind("/drive/main/movies", "/drive/main/photos"),
    ).toBe("folder-flat");
  });

  it("is flat between two drives, even at matching depths", () => {
    expect(folderTransitionKind("/drive/a/movies", "/drive/b/movies")).toBe(
      "folder-flat",
    );
  });

  it("is flat when nothing moved", () => {
    expect(
      folderTransitionKind("/drive/main/movies", "/drive/main/movies"),
    ).toBe("folder-flat");
  });

  it("reads a trailing slash as the same folder", () => {
    expect(
      folderTransitionKind("/drive/main/movies/", "/drive/main/movies"),
    ).toBe("folder-flat");
  });

  it("is flat across drives even when one path is deeper than the other", () => {
    expect(
      folderTransitionKind("/drive/a/movies", "/drive/b/movies/2026"),
    ).toBe("folder-flat");
  });

  it("does not mistake a longer name for a child of a shorter one", () => {
    expect(
      folderTransitionKind("/drive/main/mov", "/drive/main/movies"),
    ).toBe("folder-flat");
  });
});
