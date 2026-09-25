import { beforeEach, describe, expect, it } from "vitest";
import {
  addRecentlyPlayed,
  getRecentFileIds,
  getSavedPlayback,
  saveProgress,
} from "../recentlyPlayed";

beforeEach(() => {
  localStorage.clear();
});

describe("addRecentlyPlayed", () => {
  it("keeps the saved position when the file is opened again", () => {
    addRecentlyPlayed("file-aaaaaaa");
    saveProgress("file-aaaaaaa", 42, 600);

    addRecentlyPlayed("file-aaaaaaa");

    expect(getSavedPlayback("file-aaaaaaa")).toEqual({ position: 42, duration: 600 });
  });

  it("moves the file to the front", () => {
    addRecentlyPlayed("file-aaaaaaa");
    addRecentlyPlayed("file-bbbbbbb");

    addRecentlyPlayed("file-aaaaaaa");

    expect(getRecentFileIds()).toEqual(["file-aaaaaaa", "file-bbbbbbb"]);
  });

  it("starts a file never opened with no position", () => {
    addRecentlyPlayed("file-aaaaaaa");

    expect(getSavedPlayback("file-aaaaaaa")).toEqual({ position: 0, duration: 0 });
  });

  it("leaves other files' positions alone", () => {
    addRecentlyPlayed("file-bbbbbbb");
    saveProgress("file-bbbbbbb", 7, 20);

    addRecentlyPlayed("file-aaaaaaa");

    expect(getSavedPlayback("file-bbbbbbb")).toEqual({ position: 7, duration: 20 });
  });
});
