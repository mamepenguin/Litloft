import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDragAndDrop } from "../useDragAndDrop";

vi.mock("@/lib/api", () => ({
  moveFile: vi.fn().mockResolvedValue({}),
  batchMove: vi.fn().mockResolvedValue({ moved: 2, errors: [] }),
}));

import { moveFile, batchMove } from "@/lib/api";

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
});
