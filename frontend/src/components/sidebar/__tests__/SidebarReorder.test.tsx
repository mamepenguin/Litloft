import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";

import { useSidebarSectionOrder } from "../useSidebarSectionOrder";
import { useReorderableDnD } from "../useReorderableDnD";
import { SectionDragHandle } from "../SectionDragHandle";
import { SidebarPinsSection } from "../SidebarPinsSection";
import { SidebarTagsSection } from "../SidebarTagsSection";

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

const STORAGE_KEY = "sidebar:order:sections";
const DEFAULT_ORDER = ["collections", "pins", "smart-folders", "tags"] as const;

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

    act(() => {
      result.current.getHandleProps("collections").onDragStart(dragEvent(dt));
    });
    expect(result.current.draggingId).toBe("collections");
    expect(dt.types).toContain("application/x-litloft-reorder-sidebar-section");

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
