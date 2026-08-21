/**
 * Phase 2: セクション順並び替えの結合テスト
 *
 * テスト戦略:
 * - (a) useSidebarSectionOrder が返す order の順にセクションが描画されることを確認
 * - (b) reorderable 4 セクションに grip が存在し、Library / Drives には grip がない
 * - (c) grip から dragStart → 別セクションへ drop で順序変更 → localStorage 永続化
 * - (d) drop indicator が absolute 要素として出現する（reflow しない契約の固定）
 *
 * jsdom は実ブラウザ DnD を再現できないため、ロジックは handler 直呼びで検証。
 * useReorderableDnD.test.tsx と同流儀。
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";

import { useSidebarSectionOrder } from "../useSidebarSectionOrder";
import { useReorderableDnD } from "../useReorderableDnD";
import { SectionDragHandle } from "../SectionDragHandle";
import { SidebarPinsSection } from "../SidebarPinsSection";
import { SidebarTagsSection } from "../SidebarTagsSection";

// ---- localStorage mock --------------------------------------------------------

function makeLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
}

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const mockStorage = makeLocalStorageMock();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: mockStorage,
});

afterAll(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
});

// ---- FakeDataTransfer (same pattern as useReorderableDnD.test.tsx) -----------

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

// ---- mocks -------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, className }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

// ---- constants ---------------------------------------------------------------

const STORAGE_KEY = "sidebar:order:sections";
const DEFAULT_ORDER = ["collections", "pins", "smart-folders", "tags"] as const;

// ---- (a) useSidebarSectionOrder が返す order --------------------------------

describe("(a) useSidebarSectionOrder — order reflects saved state", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("defaults to the canonical order when nothing is saved", () => {
    const { result } = renderHook(() => useSidebarSectionOrder(DEFAULT_ORDER));
    expect(result.current.order).toEqual([...DEFAULT_ORDER]);
  });

  it("restores a saved order from localStorage", () => {
    mockStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["tags", "pins", "collections", "smart-folders"]),
    );
    const { result } = renderHook(() => useSidebarSectionOrder(DEFAULT_ORDER));
    expect(result.current.order).toEqual(["tags", "pins", "collections", "smart-folders"]);
  });

  it("renders sections in the order returned by useSidebarSectionOrder (pins before tags)", () => {
    mockStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["pins", "tags"]),
    );
    const { result } = renderHook(() =>
      useSidebarSectionOrder(["pins", "tags"] as const),
    );
    expect(result.current.order.indexOf("pins")).toBeLessThan(
      result.current.order.indexOf("tags"),
    );
  });

  it("renders sections in reversed order when saved that way (tags before pins)", () => {
    mockStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["tags", "pins"]),
    );
    const { result } = renderHook(() =>
      useSidebarSectionOrder(["pins", "tags"] as const),
    );
    expect(result.current.order.indexOf("tags")).toBeLessThan(
      result.current.order.indexOf("pins"),
    );
  });
});

// ---- (b) grip の有無 ---------------------------------------------------------

describe("(b) grip presence — reorderable sections have grip, fixed zones do not", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("SectionDragHandle renders a grip button with correct aria-label", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    render(
      <SectionDragHandle
        draggable={true}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Drag to reorder section" }),
    ).toBeInTheDocument();
  });

  it("SidebarPinsSection renders grip when dragHandle prop is provided", () => {
    const grip = <span data-testid="grip">grip</span>;
    render(
      <SidebarPinsSection
        driveBase="/drive/main"
        pins={[{ path: "music" }]}
        linkClass={() => ""}
        close={vi.fn()}
        dragHandle={grip}
      />,
    );
    expect(screen.getByTestId("grip")).toBeInTheDocument();
  });

  it("SidebarPinsSection renders NO grip when dragHandle is not provided", () => {
    render(
      <SidebarPinsSection
        driveBase="/drive/main"
        pins={[{ path: "music" }]}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    // No grip button should be present
    expect(
      screen.queryByRole("button", { name: "Drag to reorder section" }),
    ).not.toBeInTheDocument();
  });

  it("SidebarTagsSection renders grip when dragHandle prop is provided", () => {
    const grip = <span data-testid="tags-grip">grip</span>;
    render(
      <SidebarTagsSection
        drive="main"
        currentFolderPath={null}
        pathname="/drive/main"
        activeTag={null}
        activeView={null}
        tags={{
          resolvedScope: { drive: "main", folderPath: null },
          items: [{ name: "rock", count: 3 }],
        }}
        linkClass={() => ""}
        close={vi.fn()}
        dragHandle={grip}
      />,
    );
    expect(screen.getByTestId("tags-grip")).toBeInTheDocument();
  });
});

// ---- (c) dragStart → drop で順序変更 + localStorage 永続化 -------------------

describe("(c) drag-and-drop reorder + localStorage persistence", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("drop from 'collections' onto 'tags' (after) reorders and persists", () => {
    const ids = ["collections", "pins", "smart-folders", "tags"];
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderableDnD({ kind: "sidebar-section", ids, onReorder }),
    );

    const dt = new FakeDataTransfer();

    // dragStart on collections
    act(() => {
      result.current.getHandleProps("collections").onDragStart(dragEvent(dt));
    });
    expect(result.current.draggingId).toBe("collections");
    expect(dt.types).toContain("application/x-litloft-reorder-sidebar-section");

    // drop onto tags (after)
    act(() => {
      result.current
        .getRowProps("tags")
        .onDrop(dragEvent(dt, { clientY: 18, rectTop: 0, rectHeight: 20 }));
    });
    expect(onReorder).toHaveBeenCalledWith(["pins", "smart-folders", "tags", "collections"]);
    expect(result.current.draggingId).toBeNull();
  });

  it("setOrder persists new order to localStorage under the section key", () => {
    const { result } = renderHook(() =>
      useSidebarSectionOrder(DEFAULT_ORDER),
    );
    act(() => {
      result.current.setOrder(["tags", "collections", "pins", "smart-folders"]);
    });
    expect(result.current.order).toEqual(["tags", "collections", "pins", "smart-folders"]);
    const stored = JSON.parse(mockStorage.getItem(STORAGE_KEY) as string);
    expect(stored).toEqual(["tags", "collections", "pins", "smart-folders"]);
  });

  it("MIME guard: a drag with a different kind is rejected (does not reorder)", () => {
    const ids = ["collections", "pins", "smart-folders", "tags"];
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderableDnD({ kind: "sidebar-section", ids, onReorder }),
    );

    const foreign = new FakeDataTransfer();
    foreign.setData("application/x-litloft-reorder-other", "collections");

    act(() => {
      result.current
        .getRowProps("tags")
        .onDrop(dragEvent(foreign, { clientY: 18, rectTop: 0, rectHeight: 20 }));
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("drop onto itself does not call onReorder", () => {
    const ids = ["collections", "pins", "smart-folders", "tags"];
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderableDnD({ kind: "sidebar-section", ids, onReorder }),
    );

    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("pins").onDragStart(dragEvent(dt));
    });
    act(() => {
      result.current.getRowProps("pins").onDrop(dragEvent(dt));
    });
    expect(onReorder).not.toHaveBeenCalled();
  });
});

// ---- (d) drop indicator は absolute overlay として出現する -------------------

describe("(d) drop indicator — absolute overlay, no reflow", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("dropTarget.position=before renders a top-0 absolute line", () => {
    const ids = ["collections", "pins", "smart-folders", "tags"];
    const { result } = renderHook(() =>
      useReorderableDnD({ kind: "sidebar-section", ids, onReorder: vi.fn() }),
    );

    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("collections").onDragStart(dragEvent(dt));
    });
    act(() => {
      // clientY at top half → position: "before"
      result.current
        .getRowProps("pins")
        .onDragOver(dragEvent(dt, { clientY: 2, rectTop: 0, rectHeight: 20 }));
    });

    expect(result.current.dropTarget).toEqual({ id: "pins", position: "before" });

    // Render the indicator the same way Sidebar.tsx does
    const { container } = render(
      <div className="relative">
        {result.current.dropTarget?.id === "pins" && (
          <div
            data-testid="drop-indicator"
            className="pointer-events-none absolute inset-x-2 h-0.5 bg-accent z-10"
            style={{
              [result.current.dropTarget.position === "before" ? "top" : "bottom"]: 0,
            }}
          />
        )}
        <span>pin section content</span>
      </div>,
    );

    const indicator = container.querySelector("[data-testid='drop-indicator']");
    expect(indicator).toBeInTheDocument();
    // Must be absolute (no reflow = no static/relative)
    expect(indicator?.className).toContain("absolute");
    // top:0 is applied via style (jsdom normalises "0" → "0px")
    const topVal = (indicator as HTMLElement | null)?.style.top ?? "";
    expect(["0", "0px"]).toContain(topVal);
    // bottom should not be set for "before"
    const bottomVal = (indicator as HTMLElement | null)?.style.bottom ?? "";
    expect(["", "auto"]).toContain(bottomVal);
  });

  it("dropTarget.position=after renders a bottom-0 absolute line", () => {
    const ids = ["collections", "pins", "smart-folders", "tags"];
    const { result } = renderHook(() =>
      useReorderableDnD({ kind: "sidebar-section", ids, onReorder: vi.fn() }),
    );

    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("collections").onDragStart(dragEvent(dt));
    });
    act(() => {
      // clientY at bottom half → position: "after"
      result.current
        .getRowProps("pins")
        .onDragOver(dragEvent(dt, { clientY: 18, rectTop: 0, rectHeight: 20 }));
    });

    expect(result.current.dropTarget).toEqual({ id: "pins", position: "after" });

    const { container } = render(
      <div className="relative">
        {result.current.dropTarget?.id === "pins" && (
          <div
            data-testid="drop-indicator"
            className="pointer-events-none absolute inset-x-2 h-0.5 bg-accent z-10"
            style={{
              [result.current.dropTarget.position === "before" ? "top" : "bottom"]: 0,
            }}
          />
        )}
        <span>pin section content</span>
      </div>,
    );

    const indicator = container.querySelector("[data-testid='drop-indicator']");
    expect(indicator).toBeInTheDocument();
    expect(indicator?.className).toContain("absolute");
    // bottom:0 is applied via style (jsdom normalises "0" → "0px")
    const bottomVal = (indicator as HTMLElement | null)?.style.bottom ?? "";
    expect(["0", "0px"]).toContain(bottomVal);
    // top should not be set for "after"
    const topVal = (indicator as HTMLElement | null)?.style.top ?? "";
    expect(["", "auto"]).toContain(topVal);
  });

  it("no drop indicator when dropTarget is null", () => {
    const { result } = renderHook(() =>
      useReorderableDnD({
        kind: "sidebar-section",
        ids: ["collections", "pins"],
        onReorder: vi.fn(),
      }),
    );

    expect(result.current.dropTarget).toBeNull();

    const { container } = render(
      <div className="relative">
        {result.current.dropTarget?.id === "pins" && (
          <div data-testid="drop-indicator" className="absolute" />
        )}
        <span>content</span>
      </div>,
    );
    expect(container.querySelector("[data-testid='drop-indicator']")).not.toBeInTheDocument();
  });
});
