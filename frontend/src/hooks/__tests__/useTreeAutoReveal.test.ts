import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FlatTreeRow } from "@/components/folder/FolderTreeRow";

import { useTreeAutoReveal } from "../useTreeAutoReveal";

const ROW_HEIGHT = 32;

function folderRow(path: string, depth = 0): FlatTreeRow {
  return {
    node: {
      kind: "folder",
      name: path.split("/").pop() ?? path,
      path,
      file_count: 0,
      has_children: false,
    },
    depth,
    isExpanded: false,
    isLoading: false,
  };
}

function fileRow(fileId: string, path: string, depth = 0): FlatTreeRow {
  return {
    node: {
      kind: "file",
      name: path.split("/").pop() ?? path,
      path,
      file_id: fileId,
      file_type: "video",
      mime_type: "video/mp4",
    },
    depth,
    isExpanded: false,
    isLoading: false,
  };
}

function makeScrollElement({
  scrollTop = 0,
  clientHeight = 320,
}: {
  scrollTop?: number;
  clientHeight?: number;
} = {}): HTMLDivElement {
  return {
    scrollTop,
    clientHeight,
  } as unknown as HTMLDivElement;
}

describe("useTreeAutoReveal", () => {
  let scrollToIndex: ReturnType<typeof vi.fn>;
  let virtualizer: { scrollToIndex: typeof scrollToIndex };

  beforeEach(() => {
    scrollToIndex = vi.fn();
    virtualizer = { scrollToIndex };
  });

  it("scrolls to the matching folder row when it is fully below the viewport", () => {
    const flatList = Array.from({ length: 50 }, (_, i) => folderRow(`f${i}`));
    // Viewport shows rows 0..9 (320px / 32px = 10 rows). Target is row 30.
    renderHook(() =>
      useTreeAutoReveal({
        flatList,
        virtualizer,
        scrollElement: makeScrollElement({ scrollTop: 0, clientHeight: 320 }),
        selectedPath: "f30",
        selectedFileId: null,
        rowHeight: ROW_HEIGHT,
      }),
    );
    expect(scrollToIndex).toHaveBeenCalledWith(30, {
      align: "center",
      behavior: "smooth",
    });
  });

  it("scrolls when the matching row is fully above the viewport", () => {
    const flatList = Array.from({ length: 50 }, (_, i) => folderRow(`f${i}`));
    // scrollTop = 30 * 32 = 960; viewport shows rows 30..39. Target row 5.
    renderHook(() =>
      useTreeAutoReveal({
        flatList,
        virtualizer,
        scrollElement: makeScrollElement({ scrollTop: 960, clientHeight: 320 }),
        selectedPath: "f5",
        selectedFileId: null,
        rowHeight: ROW_HEIGHT,
      }),
    );
    expect(scrollToIndex).toHaveBeenCalledWith(5, {
      align: "center",
      behavior: "smooth",
    });
  });

  it("does NOT scroll when the row is already in view", () => {
    const flatList = Array.from({ length: 50 }, (_, i) => folderRow(`f${i}`));
    // Viewport shows rows 0..9. Target row 5 is in view.
    renderHook(() =>
      useTreeAutoReveal({
        flatList,
        virtualizer,
        scrollElement: makeScrollElement({ scrollTop: 0, clientHeight: 320 }),
        selectedPath: "f5",
        selectedFileId: null,
        rowHeight: ROW_HEIGHT,
      }),
    );
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it("does NOT scroll when the row is partially visible", () => {
    const flatList = Array.from({ length: 50 }, (_, i) => folderRow(`f${i}`));
    // Viewport: scrollTop = 16, clientHeight = 320. Visible band 16..336.
    // Row 0 (0..32) overlaps the top half-row, row 10 (320..352) overlaps
    // the bottom half-row. Both are partially visible — must not scroll.
    renderHook(() =>
      useTreeAutoReveal({
        flatList,
        virtualizer,
        scrollElement: makeScrollElement({ scrollTop: 16, clientHeight: 320 }),
        selectedPath: "f10",
        selectedFileId: null,
        rowHeight: ROW_HEIGHT,
      }),
    );
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it("does NOT scroll when the target row is not in the flat list (ancestor collapsed)", () => {
    const flatList = [folderRow("a"), folderRow("b"), folderRow("c")];
    renderHook(() =>
      useTreeAutoReveal({
        flatList,
        virtualizer,
        scrollElement: makeScrollElement({ scrollTop: 0, clientHeight: 320 }),
        selectedPath: "deep/nested/path",
        selectedFileId: null,
        rowHeight: ROW_HEIGHT,
      }),
    );
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it("scrolls to a file row by file_id when selectedFileId is set", () => {
    const flatList = [
      folderRow("a"),
      folderRow("b"),
      ...Array.from({ length: 30 }, (_, i) => folderRow(`pad${i}`)),
      fileRow("target-id", "x/y/target.mp4", 2),
    ];
    renderHook(() =>
      useTreeAutoReveal({
        flatList,
        virtualizer,
        scrollElement: makeScrollElement({ scrollTop: 0, clientHeight: 320 }),
        selectedPath: null,
        selectedFileId: "target-id",
        rowHeight: ROW_HEIGHT,
      }),
    );
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    expect(scrollToIndex).toHaveBeenCalledWith(32, {
      align: "center",
      behavior: "smooth",
    });
  });

  it("prefers selectedFileId over selectedPath when both are set", () => {
    const flatList = [
      folderRow("a"),
      ...Array.from({ length: 30 }, (_, i) => folderRow(`pad${i}`)),
      fileRow("f1", "a/file.mp4", 1),
    ];
    renderHook(() =>
      useTreeAutoReveal({
        flatList,
        virtualizer,
        scrollElement: makeScrollElement({ scrollTop: 0, clientHeight: 320 }),
        selectedPath: "a",
        selectedFileId: "f1",
        rowHeight: ROW_HEIGHT,
      }),
    );
    expect(scrollToIndex).toHaveBeenCalledWith(31, {
      align: "center",
      behavior: "smooth",
    });
  });

  it("does not re-scroll when the same selection is reapplied across renders", () => {
    const flatList = Array.from({ length: 50 }, (_, i) => folderRow(`f${i}`));
    const { rerender } = renderHook(
      ({ scrollTop }: { scrollTop: number }) =>
        useTreeAutoReveal({
          flatList,
          virtualizer,
          scrollElement: makeScrollElement({ scrollTop, clientHeight: 320 }),
          selectedPath: "f30",
          selectedFileId: null,
          rowHeight: ROW_HEIGHT,
        }),
      { initialProps: { scrollTop: 0 } },
    );
    expect(scrollToIndex).toHaveBeenCalledTimes(1);

    // User scrolled away after the auto-reveal; re-running with the same
    // selection key should not pull them back.
    rerender({ scrollTop: 0 });
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it("re-fires once the target row finally appears in flatList", () => {
    const partial = [folderRow("a"), folderRow("b")];
    const full = [
      folderRow("a"),
      folderRow("b"),
      ...Array.from({ length: 30 }, (_, i) => folderRow(`pad${i}`)),
      folderRow("deep/nested"),
    ];
    const { rerender } = renderHook(
      ({ flat }: { flat: FlatTreeRow[] }) =>
        useTreeAutoReveal({
          flatList: flat,
          virtualizer,
          scrollElement: makeScrollElement({ scrollTop: 0, clientHeight: 320 }),
          selectedPath: "deep/nested",
          selectedFileId: null,
          rowHeight: ROW_HEIGHT,
        }),
      { initialProps: { flat: partial } },
    );
    expect(scrollToIndex).not.toHaveBeenCalled();

    rerender({ flat: full });
    expect(scrollToIndex).toHaveBeenCalledWith(32, {
      align: "center",
      behavior: "smooth",
    });
  });

  it("ignores selection changes when no scroll element is mounted yet", () => {
    const flatList = Array.from({ length: 50 }, (_, i) => folderRow(`f${i}`));
    renderHook(() =>
      useTreeAutoReveal({
        flatList,
        virtualizer,
        scrollElement: null,
        selectedPath: "f30",
        selectedFileId: null,
        rowHeight: ROW_HEIGHT,
      }),
    );
    expect(scrollToIndex).not.toHaveBeenCalled();
  });
});
