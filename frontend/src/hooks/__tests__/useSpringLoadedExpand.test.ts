import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SPRING_LOAD_DELAY_MS,
  useSpringLoadedExpand,
} from "../useSpringLoadedExpand";

interface Harness {
  dropTargetPath: string | null;
  isDragging: boolean;
}

function setup(initial: Partial<Harness> = {}) {
  const expand = vi.fn();
  const collapseMany = vi.fn();
  // Every folder is a plausible spring-load target unless a test says
  // otherwise; the pane's real predicate also excludes already-expanded
  // folders and leaves.
  const isSpringLoadable = vi.fn().mockReturnValue(true);

  const props: Harness = {
    dropTargetPath: null,
    isDragging: false,
    ...initial,
  };

  const { result, rerender } = renderHook(
    (p: Harness) =>
      useSpringLoadedExpand({
        dropTargetPath: p.dropTargetPath,
        isDragging: p.isDragging,
        isSpringLoadable,
        expand,
        collapseMany,
      }),
    { initialProps: props },
  );

  return {
    expand,
    collapseMany,
    isSpringLoadable,
    notifyDrop: (path: string) => act(() => result.current.notifyDrop(path)),
    update: (next: Partial<Harness>) => {
      Object.assign(props, next);
      act(() => rerender({ ...props }));
    },
    tick: (ms: number) => act(() => void vi.advanceTimersByTime(ms)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSpringLoadedExpand — arming", () => {
  it("expands a hovered folder once the dwell completes", () => {
    const h = setup();
    h.update({ isDragging: true, dropTargetPath: "work" });

    h.tick(SPRING_LOAD_DELAY_MS);

    expect(h.expand).toHaveBeenCalledWith("work");
  });

  it("does not expand before the dwell completes", () => {
    const h = setup();
    h.update({ isDragging: true, dropTargetPath: "work" });

    h.tick(SPRING_LOAD_DELAY_MS - 1);

    expect(h.expand).not.toHaveBeenCalled();
  });

  it("expands nothing when a drag sweeps across several rows", () => {
    const h = setup();
    h.update({ isDragging: true, dropTargetPath: "a" });
    h.tick(200);
    h.update({ dropTargetPath: "b" });
    h.tick(200);
    h.update({ dropTargetPath: "c" });
    h.tick(200);

    expect(h.expand).not.toHaveBeenCalled();
  });

  it("never spring-loads the drive-root drop band", () => {
    const h = setup();
    h.update({ isDragging: true, dropTargetPath: "" });

    h.tick(SPRING_LOAD_DELAY_MS * 2);

    expect(h.expand).not.toHaveBeenCalled();
  });

  it("respects the pane's predicate", () => {
    const h = setup();
    h.isSpringLoadable.mockReturnValue(false);
    h.update({ isDragging: true, dropTargetPath: "already-open" });

    h.tick(SPRING_LOAD_DELAY_MS * 2);

    expect(h.expand).not.toHaveBeenCalled();
  });

  it("does nothing when no drag is in progress", () => {
    const h = setup();
    h.update({ isDragging: false, dropTargetPath: "work" });

    h.tick(SPRING_LOAD_DELAY_MS * 2);

    expect(h.expand).not.toHaveBeenCalled();
  });

  it("cancels a pending dwell when the drag ends", () => {
    const h = setup();
    h.update({ isDragging: true, dropTargetPath: "work" });
    h.tick(SPRING_LOAD_DELAY_MS - 100);
    h.update({ isDragging: false, dropTargetPath: null });
    h.tick(SPRING_LOAD_DELAY_MS);

    expect(h.expand).not.toHaveBeenCalled();
  });
});

describe("useSpringLoadedExpand — collapsing back", () => {
  function dragThrough(h: ReturnType<typeof setup>, paths: string[]) {
    h.update({ isDragging: true, dropTargetPath: paths[0] });
    h.tick(SPRING_LOAD_DELAY_MS);
    for (const path of paths.slice(1)) {
      h.update({ dropTargetPath: path });
      h.tick(SPRING_LOAD_DELAY_MS);
    }
  }

  it("collapses everything it opened when the drag is cancelled", () => {
    const h = setup();
    dragThrough(h, ["a", "a/b", "a/b/c"]);
    expect(h.expand).toHaveBeenCalledTimes(3);

    h.update({ isDragging: false, dropTargetPath: null });

    expect(h.collapseMany).toHaveBeenCalledTimes(1);
    expect([...h.collapseMany.mock.calls[0][0]].sort()).toEqual([
      "a",
      "a/b",
      "a/b/c",
    ]);
  });

  it("keeps the drop target and its ancestors expanded", () => {
    const h = setup();
    dragThrough(h, ["a", "a/b", "sibling"]);

    h.notifyDrop("a/b");
    h.update({ isDragging: false, dropTargetPath: null });

    expect([...h.collapseMany.mock.calls[0][0]]).toEqual(["sibling"]);
  });

  it("keeps the whole chain when the drop lands deeper than any auto-expansion", () => {
    const h = setup();
    dragThrough(h, ["a", "a/b"]);

    h.notifyDrop("a/b/c");
    h.update({ isDragging: false, dropTargetPath: null });

    expect([...h.collapseMany.mock.calls[0][0]]).toEqual([]);
  });

  it("does not mistake a sibling sharing a name prefix for an ancestor", () => {
    // "work" is a string prefix of "work-archive/sub" but not a folder
    // ancestor of it, so dropping into work-archive must not keep work
    // open. Only the "/" boundary separates the two readings.
    const h = setup();
    dragThrough(h, ["work", "work-archive"]);

    h.notifyDrop("work-archive/sub");
    h.update({ isDragging: false, dropTargetPath: null });

    expect([...h.collapseMany.mock.calls[0][0]]).toEqual(["work"]);
  });

  it("collapses everything when the drop lands on the drive root", () => {
    const h = setup();
    dragThrough(h, ["a", "a/b"]);

    h.notifyDrop("");
    h.update({ isDragging: false, dropTargetPath: null });

    expect([...h.collapseMany.mock.calls[0][0]].sort()).toEqual(["a", "a/b"]);
  });

  it("collapses the hovered row too when Escape cancels the drag over it", () => {
    // Escape leaves dropTargetPath still pointing at the row under the
    // pointer. Without a drop, that row was never chosen.
    const h = setup();
    dragThrough(h, ["a", "a/b"]);
    h.update({ isDragging: false });

    expect([...h.collapseMany.mock.calls[0][0]].sort()).toEqual(["a", "a/b"]);
  });

  it("does not collapse anything when the drag opened nothing", () => {
    const h = setup();
    h.update({ isDragging: true, dropTargetPath: "a" });
    h.tick(100);
    h.update({ isDragging: false, dropTargetPath: null });

    expect(h.collapseMany).not.toHaveBeenCalled();
  });

  it("forgets the previous drag's paths, so a later drag cannot re-collapse them", () => {
    const h = setup();
    dragThrough(h, ["a"]);
    h.update({ isDragging: false, dropTargetPath: null });
    h.collapseMany.mockClear();

    dragThrough(h, ["b"]);
    h.update({ isDragging: false, dropTargetPath: null });

    expect([...h.collapseMany.mock.calls[0][0]]).toEqual(["b"]);
  });

  it("forgets the previous drop target, so the next cancel collapses fully", () => {
    const h = setup();
    dragThrough(h, ["a"]);
    h.notifyDrop("a");
    h.update({ isDragging: false, dropTargetPath: null });
    h.collapseMany.mockClear();

    // Second drag re-opens the same branch and is cancelled, not dropped.
    dragThrough(h, ["a"]);
    h.update({ isDragging: false, dropTargetPath: null });

    expect([...h.collapseMany.mock.calls[0][0]]).toEqual(["a"]);
  });
});
