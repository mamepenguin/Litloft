import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dirtyRegistry } from "../dirtyRegistry";

beforeEach(() => {
  dirtyRegistry.reset();
});

afterEach(() => {
  dirtyRegistry.reset();
});

describe("dirtyRegistry", () => {
  it("is empty by default", () => {
    expect(dirtyRegistry.isDirty()).toBe(false);
    expect(dirtyRegistry.isDirty("any-file")).toBe(false);
    expect(dirtyRegistry.list()).toEqual([]);
  });

  it("tracks dirty per (fileId, source) pair", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    expect(dirtyRegistry.isDirty()).toBe(true);
    expect(dirtyRegistry.isDirty("file-1")).toBe(true);
    expect(dirtyRegistry.isDirty("file-2")).toBe(false);
  });

  it("clearing one source leaves other sources for the same file dirty", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    dirtyRegistry.set("file-1", "comment", true);

    dirtyRegistry.set("file-1", "comment", false);
    expect(dirtyRegistry.isDirty("file-1")).toBe(true);

    dirtyRegistry.set("file-1", "knowledge-editor", false);
    expect(dirtyRegistry.isDirty("file-1")).toBe(false);
  });

  it("isDirty() (no fileId) returns true if any file/source is dirty", () => {
    dirtyRegistry.set("file-x", "tag-chips", true);
    expect(dirtyRegistry.isDirty()).toBe(true);
    dirtyRegistry.set("file-x", "tag-chips", false);
    expect(dirtyRegistry.isDirty()).toBe(false);
  });

  it("list() returns every (fileId, source) currently dirty", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    dirtyRegistry.set("file-2", "comment", true);
    dirtyRegistry.set("file-1", "tag-chips", true);

    const entries = dirtyRegistry
      .list()
      .map((e) => `${e.fileId}:${e.source}`)
      .sort();
    expect(entries).toEqual([
      "file-1:knowledge-editor",
      "file-1:tag-chips",
      "file-2:comment",
    ]);
  });

  it("notifies subscribers on set / clear", () => {
    const listener = vi.fn();
    const unsubscribe = dirtyRegistry.subscribe(listener);

    dirtyRegistry.set("file-1", "knowledge-editor", true);
    dirtyRegistry.set("file-1", "knowledge-editor", false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("setting the same value twice is a no-op (no extra notifications)", () => {
    const listener = vi.fn();
    dirtyRegistry.subscribe(listener);

    dirtyRegistry.set("file-1", "knowledge-editor", true);
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setting dirty=false on an unknown (fileId, source) is a no-op", () => {
    const listener = vi.fn();
    dirtyRegistry.subscribe(listener);
    dirtyRegistry.set("never-dirty", "knowledge-editor", false);
    expect(listener).not.toHaveBeenCalled();
    expect(dirtyRegistry.isDirty()).toBe(false);
  });

  it("reset() clears state and notifies", () => {
    const listener = vi.fn();
    dirtyRegistry.subscribe(listener);
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    listener.mockClear();
    dirtyRegistry.reset();
    expect(dirtyRegistry.isDirty()).toBe(false);
    expect(listener).not.toHaveBeenCalled(); // reset itself is silent (test helper)
  });
});
