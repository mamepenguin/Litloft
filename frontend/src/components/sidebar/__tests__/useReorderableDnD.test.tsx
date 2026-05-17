import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useReorderableDnD } from "../useReorderableDnD";

class FakeDataTransfer {
  private data = new Map<string, string>();
  effectAllowed = "";
  dropEffect = "";
  setData(type: string, value: string) {
    this.data.set(type, value);
  }
  getData(type: string) {
    return this.data.get(type) ?? "";
  }
  get types() {
    return Array.from(this.data.keys());
  }
}

function dragEvent(
  dataTransfer: FakeDataTransfer,
  opts: { clientY?: number; rectTop?: number; rectHeight?: number } = {},
) {
  const { clientY = 0, rectTop = 0, rectHeight = 20 } = opts;
  return {
    dataTransfer,
    preventDefault: vi.fn(),
    clientY,
    currentTarget: {
      getBoundingClientRect: () => ({
        top: rectTop,
        height: rectHeight,
        bottom: rectTop + rectHeight,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: rectTop,
      }),
    },
  } as unknown as React.DragEvent;
}

function setup(ids: string[], onReorder = vi.fn()) {
  const { result } = renderHook(() =>
    useReorderableDnD({ kind: "test", ids, onReorder }),
  );
  return { result, onReorder };
}

describe("useReorderableDnD", () => {
  it("dragStart marks the dragging id and writes the kind MIME", () => {
    const { result } = setup(["a", "b", "c"]);
    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("a").onDragStart(dragEvent(dt));
    });
    expect(result.current.draggingId).toBe("a");
    expect(dt.types).toContain("application/x-litloft-reorder-test");
    expect(dt.getData("application/x-litloft-reorder-test")).toBe("a");
  });

  it("dragOver over another row sets a drop target (before/after by pointer)", () => {
    const { result } = setup(["a", "b", "c"]);
    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("a").onDragStart(dragEvent(dt));
    });
    act(() => {
      result.current
        .getRowProps("c")
        .onDragOver(dragEvent(dt, { clientY: 2, rectTop: 0, rectHeight: 20 }));
    });
    expect(result.current.dropTarget).toEqual({ id: "c", position: "before" });

    act(() => {
      result.current
        .getRowProps("c")
        .onDragOver(dragEvent(dt, { clientY: 18, rectTop: 0, rectHeight: 20 }));
    });
    expect(result.current.dropTarget).toEqual({ id: "c", position: "after" });
  });

  it("ignores a drag from a different kind (MIME guard)", () => {
    const { result } = setup(["a", "b", "c"]);
    const foreign = new FakeDataTransfer();
    foreign.setData("application/x-litloft-reorder-other", "z");
    const ev = dragEvent(foreign);
    act(() => {
      result.current.getRowProps("b").onDragOver(ev);
    });
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(result.current.dropTarget).toBeNull();
  });

  it("drop reorders immutably and clears state", () => {
    const onReorder = vi.fn();
    const { result } = setup(["a", "b", "c"], onReorder);
    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("a").onDragStart(dragEvent(dt));
    });
    act(() => {
      result.current
        .getRowProps("c")
        .onDrop(dragEvent(dt, { clientY: 18, rectTop: 0, rectHeight: 20 }));
    });
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
    expect(result.current.draggingId).toBeNull();
    expect(result.current.dropTarget).toBeNull();
  });

  it("drop onto itself does not call onReorder", () => {
    const onReorder = vi.fn();
    const { result } = setup(["a", "b", "c"], onReorder);
    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("a").onDragStart(dragEvent(dt));
    });
    act(() => {
      result.current.getRowProps("a").onDrop(dragEvent(dt));
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("dragEnd clears state", () => {
    const { result } = setup(["a", "b"]);
    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("a").onDragStart(dragEvent(dt));
    });
    act(() => {
      result.current.getHandleProps("a").onDragEnd();
    });
    expect(result.current.draggingId).toBeNull();
  });
});
