import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { useDirty } from "../useDirty";
import { useIsDirty } from "../useIsDirty";

beforeEach(() => {
  dirtyRegistry.reset();
});

afterEach(() => {
  dirtyRegistry.reset();
});

describe("useDirty", () => {
  it("publishes dirty state and clears it on unmount", () => {
    const { rerender, unmount } = renderHook(
      ({ dirty }: { dirty: boolean }) =>
        useDirty({
          fileId: "file-1",
          source: "knowledge-editor",
          dirty,
        }),
      { initialProps: { dirty: false } },
    );
    expect(dirtyRegistry.isDirty("file-1")).toBe(false);

    rerender({ dirty: true });
    expect(dirtyRegistry.isDirty("file-1")).toBe(true);

    rerender({ dirty: false });
    expect(dirtyRegistry.isDirty("file-1")).toBe(false);

    rerender({ dirty: true });
    expect(dirtyRegistry.isDirty("file-1")).toBe(true);

    unmount();
    // Unmount must always release the lock, even if the caller forgot
    // to set dirty back to false (e.g. component crashed mid-edit).
    expect(dirtyRegistry.isDirty("file-1")).toBe(false);
  });

  it("a fileId change releases the previous file's lock", () => {
    const { rerender, unmount } = renderHook(
      ({ fileId }: { fileId: string }) =>
        useDirty({
          fileId,
          source: "knowledge-editor",
          dirty: true,
        }),
      { initialProps: { fileId: "file-1" } },
    );
    expect(dirtyRegistry.isDirty("file-1")).toBe(true);
    expect(dirtyRegistry.isDirty("file-2")).toBe(false);

    rerender({ fileId: "file-2" });
    expect(dirtyRegistry.isDirty("file-1")).toBe(false);
    expect(dirtyRegistry.isDirty("file-2")).toBe(true);

    unmount();
    expect(dirtyRegistry.isDirty()).toBe(false);
  });
});

describe("useIsDirty", () => {
  it("returns the current global dirty state and re-renders on change", () => {
    const { result } = renderHook(() => useIsDirty());
    expect(result.current).toBe(false);

    act(() => {
      dirtyRegistry.set("file-1", "knowledge-editor", true);
    });
    expect(result.current).toBe(true);

    act(() => {
      dirtyRegistry.set("file-1", "knowledge-editor", false);
    });
    expect(result.current).toBe(false);
  });

  it("filters by fileId when one is supplied", () => {
    const { result } = renderHook(() => useIsDirty("file-1"));

    act(() => {
      dirtyRegistry.set("file-2", "knowledge-editor", true);
    });
    // file-2 is dirty but we are watching file-1.
    expect(result.current).toBe(false);

    act(() => {
      dirtyRegistry.set("file-1", "comment", true);
    });
    expect(result.current).toBe(true);
  });
});
