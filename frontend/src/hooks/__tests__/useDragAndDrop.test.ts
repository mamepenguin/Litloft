import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDragAndDrop } from "../useDragAndDrop";

vi.mock("@/lib/api", () => ({
  moveFile: vi.fn().mockResolvedValue({}),
  moveFolder: vi.fn().mockResolvedValue({}),
  batchMove: vi.fn().mockResolvedValue({ moved: 2, errors: [] }),
}));

import { moveFile, moveFolder, batchMove } from "@/lib/api";

function createDragEvent(overrides: Partial<React.DragEvent> = {}): React.DragEvent {
  const dataStore = new Map<string, string>();
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      setData: (key: string, val: string) => dataStore.set(key, val),
      getData: (key: string) => dataStore.get(key) ?? "",
      effectAllowed: "uninitialized",
      dropEffect: "none",
    },
    ...overrides,
  } as unknown as React.DragEvent;
}

describe("useDragAndDrop", () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with no dragging state", () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );
    expect(result.current.dragState.isDragging).toBe(false);
    expect(result.current.dragState.draggedFileIds).toEqual([]);
    expect(result.current.dragState.dropTargetPath).toBeNull();
  });

  it("starts drag with single file when no selection", () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );
    const e = createDragEvent();

    act(() => {
      result.current.handleDragStart(e, "file-1");
    });

    expect(result.current.dragState.isDragging).toBe(true);
    expect(result.current.dragState.draggedFileIds).toEqual(["file-1"]);
    expect(e.dataTransfer.effectAllowed).toBe("copyMove");
  });

  it("drags all selected files when dragged file is in selection", () => {
    const selectedIds = new Set(["file-1", "file-2", "file-3"]);
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds, onComplete }),
    );
    const e = createDragEvent();

    act(() => {
      result.current.handleDragStart(e, "file-2");
    });

    expect(result.current.dragState.draggedFileIds).toHaveLength(3);
    expect(result.current.dragState.draggedFileIds).toContain("file-1");
    expect(result.current.dragState.draggedFileIds).toContain("file-2");
    expect(result.current.dragState.draggedFileIds).toContain("file-3");
  });

  it("drags single file when dragged file is not in selection", () => {
    const selectedIds = new Set(["file-1", "file-2"]);
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds, onComplete }),
    );
    const e = createDragEvent();

    act(() => {
      result.current.handleDragStart(e, "file-99");
    });

    expect(result.current.dragState.draggedFileIds).toEqual(["file-99"]);
  });

  it("ends drag and resets state", () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );
    const e = createDragEvent();

    act(() => {
      result.current.handleDragStart(e, "file-1");
    });
    expect(result.current.dragState.isDragging).toBe(true);

    act(() => {
      result.current.handleDragEnd();
    });
    expect(result.current.dragState.isDragging).toBe(false);
    expect(result.current.dragState.draggedFileIds).toEqual([]);
  });

  it("highlights drop target on enter and clears on leave", () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );
    const props = result.current.getDropTargetProps("photos");

    const enterEvent = createDragEvent();
    act(() => {
      props.onDragEnter(enterEvent);
    });
    expect(result.current.isDropTarget("photos")).toBe(true);
    expect(result.current.isDropTarget("other")).toBe(false);

    const leaveEvent = createDragEvent();
    act(() => {
      props.onDragLeave(leaveEvent);
    });
    expect(result.current.isDropTarget("photos")).toBe(false);
  });

  it("calls moveFile for single file drop", async () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );

    const startEvent = createDragEvent();
    act(() => {
      result.current.handleDragStart(startEvent, "file-1");
    });

    const dropEvent = createDragEvent();
    const props = result.current.getDropTargetProps("target-folder");
    await act(async () => {
      await props.onDrop(dropEvent);
    });

    expect(moveFile).toHaveBeenCalledWith("file-1", "target-folder");
    expect(onComplete).toHaveBeenCalled();
  });

  it("calls batchMove for multi-file drop", async () => {
    const selectedIds = new Set(["file-1", "file-2"]);
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds, onComplete }),
    );

    const startEvent = createDragEvent();
    act(() => {
      result.current.handleDragStart(startEvent, "file-1");
    });

    const dropEvent = createDragEvent();
    const props = result.current.getDropTargetProps("target-folder");
    await act(async () => {
      await props.onDrop(dropEvent);
    });

    expect(batchMove).toHaveBeenCalledWith(
      expect.arrayContaining(["file-1", "file-2"]),
      "target-folder",
    );
    expect(onComplete).toHaveBeenCalled();
  });

  it("ignores drop when no drag was started", async () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );

    const dropEvent = createDragEvent();
    const props = result.current.getDropTargetProps("target-folder");
    await act(async () => {
      await props.onDrop(dropEvent);
    });

    expect(moveFile).not.toHaveBeenCalled();
    expect(batchMove).not.toHaveBeenCalled();
  });

  describe("DataTransfer fallback (cross-pane drops)", () => {
    it("falls back to DataTransfer file ids when refs are empty", async () => {
      const { result } = renderHook(() =>
        useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
      );

      // No handleDragStart() — simulates the drop coming from a different
      // hook instance (e.g. the right pane). DataTransfer carries the ids.
      const dropEvent = createDragEvent();
      dropEvent.dataTransfer.setData(
        "application/x-file-ids",
        JSON.stringify(["x1"]),
      );
      const props = result.current.getDropTargetProps("target-folder");
      await act(async () => {
        await props.onDrop(dropEvent);
      });

      expect(moveFile).toHaveBeenCalledWith("x1", "target-folder");
      expect(onComplete).toHaveBeenCalled();
    });

    it("falls back to DataTransfer for batch file move", async () => {
      const { result } = renderHook(() =>
        useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
      );

      const dropEvent = createDragEvent();
      dropEvent.dataTransfer.setData(
        "application/x-file-ids",
        JSON.stringify(["a", "b", "c"]),
      );
      const props = result.current.getDropTargetProps("dst");
      await act(async () => {
        await props.onDrop(dropEvent);
      });

      expect(batchMove).toHaveBeenCalledWith(
        expect.arrayContaining(["a", "b", "c"]),
        "dst",
      );
    });

    it("falls back to DataTransfer for folder move", async () => {
      const { result } = renderHook(() =>
        useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
      );

      const dropEvent = createDragEvent();
      dropEvent.dataTransfer.setData(
        "application/x-folder-path",
        "src/folder",
      );
      const props = result.current.getDropTargetProps("dst-parent");
      await act(async () => {
        await props.onDrop(dropEvent);
      });

      expect(moveFolder).toHaveBeenCalledWith("main", "src/folder", "dst-parent");
    });

    it("ignores DataTransfer payload that fails to parse", async () => {
      const { result } = renderHook(() =>
        useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
      );

      const dropEvent = createDragEvent();
      dropEvent.dataTransfer.setData("application/x-file-ids", "not json");
      const props = result.current.getDropTargetProps("dst");
      await act(async () => {
        await props.onDrop(dropEvent);
      });

      expect(moveFile).not.toHaveBeenCalled();
      expect(batchMove).not.toHaveBeenCalled();
      expect(moveFolder).not.toHaveBeenCalled();
    });
  });
});

describe("useDragAndDrop — onDropTarget", () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the target path before the move request settles", async () => {
    // The collapse-back in useSpringLoadedExpand runs on dragend, which
    // the browser fires right after drop — long before an awaited move
    // resolves. A callback that waited for the move would always arrive
    // to find the branches already collapsed.
    let releaseMove: (() => void) | undefined;
    vi.mocked(moveFile).mockImplementationOnce(
      () => new Promise<never>((resolve) => {
        releaseMove = () => resolve(undefined as never);
      }) as ReturnType<typeof moveFile>,
    );

    const onDropTarget = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete, onDropTarget }),
    );

    act(() => {
      result.current.handleDragStart(createDragEvent(), "file-1");
    });

    const dropEvent = createDragEvent();
    act(() => {
      // Deliberately NOT awaited: this is the state of the world at the
      // instant the browser would fire dragend.
      void result.current.getDropTargetProps("dst/deep").onDrop(dropEvent);
    });

    expect(onDropTarget).toHaveBeenCalledWith("dst/deep");
    expect(moveFile).toHaveBeenCalled();

    await act(async () => {
      releaseMove?.();
    });
  });

  it("is not called when the drag is cancelled instead of dropped", () => {
    const onDropTarget = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete, onDropTarget }),
    );

    act(() => {
      result.current.handleDragStart(createDragEvent(), "file-1");
    });
    act(() => {
      result.current.getDropTargetProps("hovered").onDragEnter(createDragEvent());
    });
    act(() => {
      result.current.handleDragEnd();
    });

    expect(onDropTarget).not.toHaveBeenCalled();
  });

  it("reports the drive root as an empty path", async () => {
    const onDropTarget = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete, onDropTarget }),
    );

    act(() => {
      result.current.handleDragStart(createDragEvent(), "file-1");
    });
    await act(async () => {
      await result.current.getDropTargetProps("").onDrop(createDragEvent());
    });

    expect(onDropTarget).toHaveBeenCalledWith("");
  });
});

describe("useDragAndDrop — end-of-drag watchdog", () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ends the drag when a pointermove arrives", () => {
    // A drag source that unmounts mid-drag (virtualized row scrolled out
    // of the window) dispatches `dragend` only at the detached node, so
    // React's delegated handler never sees it. Native drag suppresses
    // mouse events for its whole duration, so the first pointermove is
    // proof the drag is over. Measured in Chromium, 2026-08-21.
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );

    act(() => {
      result.current.handleDragStart(createDragEvent(), "file-1");
    });
    expect(result.current.dragState.isDragging).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("pointermove"));
    });

    expect(result.current.dragState.isDragging).toBe(false);
    expect(result.current.dragState.draggedFileIds).toEqual([]);
    expect(result.current.dragState.dropTargetPath).toBeNull();
  });

  it("tells the other panes so their drop targets stand down too", () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );
    const seen: string[] = [];
    const listener = () => seen.push("end");
    window.addEventListener("loft-internal-drag-end", listener);

    act(() => {
      result.current.handleDragStart(createDragEvent(), "file-1");
    });
    act(() => {
      window.dispatchEvent(new Event("pointermove"));
    });
    window.removeEventListener("loft-internal-drag-end", listener);

    expect(seen).toEqual(["end"]);
  });

  it("also recovers a folder drag", () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );

    act(() => {
      result.current.handleFolderDragStart(createDragEvent(), "docs");
    });
    act(() => {
      window.dispatchEvent(new Event("pointermove"));
    });

    expect(result.current.dragState.isDragging).toBe(false);
    expect(result.current.dragState.draggedFolderPath).toBeNull();
  });

  it("ignores pointermove while no drag is in progress", () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );
    const seen: string[] = [];
    const listener = () => seen.push("end");
    window.addEventListener("loft-internal-drag-end", listener);

    act(() => {
      window.dispatchEvent(new Event("pointermove"));
    });
    window.removeEventListener("loft-internal-drag-end", listener);

    expect(result.current.dragState.isDragging).toBe(false);
    expect(seen).toEqual([]);
  });

  it("stops listening once the drag ends normally", () => {
    const { result } = renderHook(() =>
      useDragAndDrop({ drive: "main", selectedIds: new Set(), onComplete }),
    );
    act(() => {
      result.current.handleDragStart(createDragEvent(), "file-1");
    });
    act(() => {
      result.current.handleDragEnd();
    });

    const seen: string[] = [];
    const listener = () => seen.push("end");
    window.addEventListener("loft-internal-drag-end", listener);
    act(() => {
      window.dispatchEvent(new Event("pointermove"));
    });
    window.removeEventListener("loft-internal-drag-end", listener);

    expect(seen).toEqual([]);
  });
});
