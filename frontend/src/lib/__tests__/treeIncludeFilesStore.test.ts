import { describe, it, expect, beforeEach } from "vitest";

import { treeIncludeFilesStore } from "@/lib/treeIncludeFilesStore";
import { treeEnabledStore } from "@/lib/treeEnabledStore";

describe("treeIncludeFilesStore", () => {
  beforeEach(() => {
    localStorage.clear();
    treeIncludeFilesStore.reset();
    treeEnabledStore.reset();
  });

  it("is off until the user asks for it", () => {
    expect(treeIncludeFilesStore.get("work")).toBe(false);
  });

  it("remembers the answer per drive", () => {
    treeIncludeFilesStore.set("notes", true);
    expect(treeIncludeFilesStore.get("notes")).toBe(true);
    // A drive of notes and a drive of video want different answers.
    expect(treeIncludeFilesStore.get("video")).toBe(false);
  });

  it("writes a key of its own", () => {
    treeIncludeFilesStore.set("notes", true);
    expect(localStorage.getItem("tree:includeFiles:notes")).toBe("true");
  });

  /**
   * The two flags share an implementation, so this is the assertion that
   * they do not share a value: one factory, two prefixes, two caches.
   */
  it("does not move when the tree-visibility flag moves", () => {
    treeEnabledStore.set("notes", true);
    expect(treeIncludeFilesStore.get("notes")).toBe(false);
    expect(localStorage.getItem("tree:includeFiles:notes")).toBeNull();

    treeIncludeFilesStore.set("notes", true);
    treeEnabledStore.set("notes", false);
    expect(treeIncludeFilesStore.get("notes")).toBe(true);
  });

  it("tells its subscribers when the answer changes", () => {
    let calls = 0;
    const stop = treeIncludeFilesStore.subscribe(() => {
      calls += 1;
    });
    treeIncludeFilesStore.set("notes", true);
    expect(calls).toBe(1);
    // Setting the same value again is not a change.
    treeIncludeFilesStore.set("notes", true);
    expect(calls).toBe(1);
    stop();
    treeIncludeFilesStore.set("notes", false);
    expect(calls).toBe(1);
  });
});
