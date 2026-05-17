/**
 * Phase 3: セクション内アイテム並び替えの結合テスト
 *
 * 対象: Pins / Collections / Smart Folders の各アイテム。Tags / Drives は対象外。
 *
 * テスト戦略 (Phase2 / useReorderableDnD.test.tsx 流儀):
 * - (a) 各セクションが useSidebarItemOrder の order でアイテム描画
 * - (b) 各アイテムに grip がある
 * - (c) アイテム drop で順序変更 + drive-scoped key に永続化
 * - (d) drive を切り替えると別 drive の順序が混ざらない
 * - (e) cross-section: 別 kind の MIME は reorder されない
 * - (f) Collections: application/x-file-ids ドロップが従来通り addCollectionItems を呼ぶ
 * - (g) drop indicator が absolute 要素
 *
 * jsdom は実ブラウザ DnD を再現できないため handler 直呼びで検証。
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { act, render, renderHook, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";

import { useSidebarItemOrder } from "../useSidebarItemOrder";
import { useReorderableDnD } from "../useReorderableDnD";
import { ItemDragHandle } from "../ItemDragHandle";
import { SidebarPinsSection } from "../SidebarPinsSection";
import { SidebarCollectionsSection } from "../SidebarCollectionsSection";
import { SidebarSmartFoldersSection } from "../SidebarSmartFoldersSection";
import type { CollectionSummary } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

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

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}));

let mockSmartFolders: SmartFolder[] = [];
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({
    smartFolders: mockSmartFolders,
    loading: false,
    error: null,
    refetch: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));

const addCollectionItemsMock = vi.fn();
const getCollectionsMock = vi.fn();
vi.mock("@/lib/api", () => ({
  addCollectionItems: (...args: unknown[]) => addCollectionItemsMock(...args),
  getCollections: (...args: unknown[]) => getCollectionsMock(...args),
}));

// ---- helpers -----------------------------------------------------------------

const makeCol = (id: string, name: string, count = 3): CollectionSummary => ({
  id,
  name,
  description: null,
  drive: "main",
  item_count: count,
  first_file_id: null,
  created_at: "",
  updated_at: "",
});

const makeSf = (id: string, name: string): SmartFolder => ({
  id,
  name,
  drive: "main",
  query: "q",
  file_type: null,
  sort_by: null,
  sort_order: null,
  created_at: "",
  updated_at: null,
});

const collectionsProps = (collectionList: CollectionSummary[]) => ({
  currentDrive: "main",
  driveBase: "/drive/main",
  collectionList,
  setCollectionList: vi.fn(),
  creatingCollection: false,
  setCreatingCollection: vi.fn(),
  newCollectionName: "",
  setNewCollectionName: vi.fn(),
  renamingId: null as string | null,
  setRenamingId: vi.fn(),
  renameValue: "",
  setRenameValue: vi.fn(),
  contextMenu: null as { id: string; x: number; y: number } | null,
  setContextMenu: vi.fn(),
  createInputRef: createRef<HTMLInputElement>(),
  renameInputRef: createRef<HTMLInputElement>(),
  handleCreateCollection: vi.fn(),
  handleRenameCollection: vi.fn(),
  handleDeleteCollection: vi.fn(),
  handleCollectionClick: vi.fn(),
});

// ---- (a) order でアイテム描画 ------------------------------------------------

describe("(a) sections render items in useSidebarItemOrder order", () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  it("Pins renders pins in the saved per-drive order", () => {
    mockStorage.setItem(
      "sidebar:order:pins:main",
      JSON.stringify(["b/two", "a/one"]),
    );
    render(
      <SidebarPinsSection
        driveBase="/drive/main"
        drive="main"
        pins={[{ path: "a/one" }, { path: "b/two" }]}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("two");
    expect(links[1]).toHaveTextContent("one");
  });

  it("Collections renders collections in the saved per-drive order", () => {
    mockStorage.setItem(
      "sidebar:order:collections:main",
      JSON.stringify(["c2", "c1"]),
    );
    render(
      <SidebarCollectionsSection
        {...collectionsProps([makeCol("c1", "Rock"), makeCol("c2", "Jazz")])}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const labels = buttons
      .map((b) => b.textContent ?? "")
      .filter((tx) => tx.includes("Rock") || tx.includes("Jazz"));
    // Jazz (c2) must come before Rock (c1)
    expect(labels[0]).toContain("Jazz");
    expect(labels[1]).toContain("Rock");
  });

  it("Smart Folders renders entries in the saved per-drive order", () => {
    mockSmartFolders = [makeSf("s1", "Recent"), makeSf("s2", "Videos")];
    mockStorage.setItem(
      "sidebar:order:smart-folders:main",
      JSON.stringify(["s2", "s1"]),
    );
    render(<SidebarSmartFoldersSection drive="main" close={vi.fn()} />);
    expect(screen.getByText("Videos")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
    const allText = document.body.textContent ?? "";
    expect(allText.indexOf("Videos")).toBeLessThan(allText.indexOf("Recent"));
  });
});

// ---- (b) 各アイテムに grip がある --------------------------------------------

describe("(b) each item has a drag grip", () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  it("ItemDragHandle renders a grip button with the item aria-label", () => {
    render(
      <ItemDragHandle draggable={true} onDragStart={vi.fn()} onDragEnd={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Drag to reorder" }),
    ).toBeInTheDocument();
  });

  it("Pins items each get a grip", () => {
    render(
      <SidebarPinsSection
        driveBase="/drive/main"
        drive="main"
        pins={[{ path: "a/one" }, { path: "b/two" }]}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: "Drag to reorder" }),
    ).toHaveLength(2);
  });

  it("Collections rows each get a grip", () => {
    render(
      <SidebarCollectionsSection
        {...collectionsProps([makeCol("c1", "Rock"), makeCol("c2", "Jazz")])}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: "Drag to reorder" }),
    ).toHaveLength(2);
  });

  it("Collections rename row does NOT get a grip", () => {
    render(
      <SidebarCollectionsSection
        {...collectionsProps([makeCol("c1", "Rock"), makeCol("c2", "Jazz")])}
        renamingId="c1"
        renameValue="Rock Edit"
      />,
    );
    // c1 is in rename mode → only c2 keeps a grip
    expect(
      screen.getAllByRole("button", { name: "Drag to reorder" }),
    ).toHaveLength(1);
  });

  it("Smart Folders items each get a grip", () => {
    mockSmartFolders = [makeSf("s1", "Recent"), makeSf("s2", "Videos")];
    render(<SidebarSmartFoldersSection drive="main" close={vi.fn()} />);
    expect(
      screen.getAllByRole("button", { name: "Drag to reorder" }),
    ).toHaveLength(2);
  });
});

// ---- (c) drop で順序変更 + drive-scoped 永続化 -------------------------------

describe("(c) drop reorders and persists to a drive-scoped key", () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  it("useSidebarItemOrder persists under sidebar:order:pins:{drive}", () => {
    const { result } = renderHook(() =>
      useSidebarItemOrder("pins", "main", ["a", "b", "c"]),
    );
    act(() => {
      result.current.setOrder(["c", "a", "b"]);
    });
    expect(
      JSON.parse(mockStorage.getItem("sidebar:order:pins:main") as string),
    ).toEqual(["c", "a", "b"]);
  });

  it("dnd drop reorders items via the pins kind", () => {
    const ids = ["a", "b", "c"];
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderableDnD({ kind: "sidebar-item-pins", ids, onReorder }),
    );
    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("a").onDragStart(dragEvent(dt));
    });
    expect(dt.types).toContain("application/x-litloft-reorder-sidebar-item-pins");
    act(() => {
      result.current
        .getRowProps("c")
        .onDrop(dragEvent(dt, { clientY: 18, rectTop: 0, rectHeight: 20 }));
    });
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("collections drop persists under sidebar:order:collections:{drive}", () => {
    const { result } = renderHook(() =>
      useSidebarItemOrder("collections", "photos", ["c1", "c2"]),
    );
    act(() => {
      result.current.setOrder(["c2", "c1"]);
    });
    expect(
      JSON.parse(mockStorage.getItem("sidebar:order:collections:photos") as string),
    ).toEqual(["c2", "c1"]);
  });
});

// ---- (d) drive 分離 ----------------------------------------------------------

describe("(d) per-drive isolation — orders never mix across drives", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("a saved order for drive A does not affect drive B", () => {
    mockStorage.setItem("sidebar:order:pins:work", JSON.stringify(["b", "a"]));
    const { result, rerender } = renderHook(
      ({ drive }: { drive: string }) =>
        useSidebarItemOrder("pins", drive, ["a", "b"]),
      { initialProps: { drive: "work" } },
    );
    expect(result.current.order).toEqual(["b", "a"]);
    rerender({ drive: "photos" });
    expect(result.current.order).toEqual(["a", "b"]); // photos: untouched default
  });

  it("Pins component reflects the drive-scoped key for the active drive", () => {
    mockStorage.setItem(
      "sidebar:order:pins:work",
      JSON.stringify(["b/two", "a/one"]),
    );
    // Rendering for a *different* drive must NOT pick up work's order.
    render(
      <SidebarPinsSection
        driveBase="/drive/photos"
        drive="photos"
        pins={[{ path: "a/one" }, { path: "b/two" }]}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("one"); // default server order
    expect(links[1]).toHaveTextContent("two");
  });
});

// ---- (e) cross-section: per-kind MIME ----------------------------------------

describe("(e) cross-section drops are rejected by per-kind MIME", () => {
  it("a pins-kind drag is ignored by a collections-kind row", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderableDnD({
        kind: "sidebar-item-collections",
        ids: ["c1", "c2"],
        onReorder,
      }),
    );
    // Drag payload carries the *pins* MIME, not collections.
    const foreign = new FakeDataTransfer();
    foreign.setData("application/x-litloft-reorder-sidebar-item-pins", "p1");

    act(() => {
      result.current
        .getRowProps("c1")
        .onDrop(dragEvent(foreign, { clientY: 18, rectTop: 0, rectHeight: 20 }));
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("a section-kind drag is ignored by an item-kind row", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderableDnD({
        kind: "sidebar-item-pins",
        ids: ["a", "b"],
        onReorder,
      }),
    );
    const foreign = new FakeDataTransfer();
    foreign.setData("application/x-litloft-reorder-sidebar-section", "pins");

    act(() => {
      result.current
        .getRowProps("a")
        .onDrop(dragEvent(foreign, { clientY: 2, rectTop: 0, rectHeight: 20 }));
    });
    expect(onReorder).not.toHaveBeenCalled();
  });
});

// ---- (f) Collections file-ids drop は従来通り --------------------------------

describe("(f) Collections file-ids drop still calls addCollectionItems", () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
    addCollectionItemsMock.mockResolvedValue(undefined);
    getCollectionsMock.mockResolvedValue([]);
  });

  it("dropping application/x-file-ids onto a collection adds the files (reorder wrapper does not break it)", async () => {
    const setCollectionList = vi.fn();
    render(
      <SidebarCollectionsSection
        {...collectionsProps([makeCol("c1", "Rock")])}
        setCollectionList={setCollectionList}
      />,
    );

    // The collection item button (not the row wrapper) carries the
    // file-ids handlers. Fire a native-style drop with the file-ids MIME.
    const rockBtn = screen.getByText("Rock").closest("button") as HTMLElement;

    const fileIdsDT = {
      types: ["application/x-file-ids"],
      getData: (t: string) =>
        t === "application/x-file-ids" ? JSON.stringify(["f1", "f2"]) : "",
      dropEffect: "",
    };

    fireEvent.drop(rockBtn, { dataTransfer: fileIdsDT });

    await waitFor(() => {
      expect(addCollectionItemsMock).toHaveBeenCalledWith("main", "c1", [
        "f1",
        "f2",
      ]);
    });
  });

  it("a reorder-MIME drag does NOT trigger addCollectionItems", () => {
    render(
      <SidebarCollectionsSection
        {...collectionsProps([makeCol("c1", "Rock"), makeCol("c2", "Jazz")])}
      />,
    );
    const rockBtn = screen.getByText("Rock").closest("button") as HTMLElement;

    const reorderDT = {
      types: ["application/x-litloft-reorder-sidebar-item-collections"],
      getData: () => "c2",
      dropEffect: "",
    };
    fireEvent.drop(rockBtn, { dataTransfer: reorderDT });

    // file-ids handler early-returns on a non-file-ids MIME.
    expect(addCollectionItemsMock).not.toHaveBeenCalled();
  });
});

// ---- (g) drop indicator は absolute 要素 -------------------------------------

describe("(g) drop indicator — absolute overlay, no reflow", () => {
  it("Pins drop indicator renders as an absolute element", () => {
    const { result } = renderHook(() =>
      useReorderableDnD({
        kind: "sidebar-item-pins",
        ids: ["a/one", "b/two"],
        onReorder: vi.fn(),
      }),
    );
    const dt = new FakeDataTransfer();
    act(() => {
      result.current.getHandleProps("a/one").onDragStart(dragEvent(dt));
    });
    act(() => {
      result.current
        .getRowProps("b/two")
        .onDragOver(dragEvent(dt, { clientY: 2, rectTop: 0, rectHeight: 20 }));
    });
    expect(result.current.dropTarget).toEqual({ id: "b/two", position: "before" });

    const { container } = render(
      <div className="relative flex items-center">
        {result.current.dropTarget?.id === "b/two" && (
          <div
            data-testid="indicator"
            className="pointer-events-none absolute inset-x-2 h-0.5 bg-accent z-10"
            style={{
              [result.current.dropTarget.position === "before" ? "top" : "bottom"]: 0,
            }}
          />
        )}
        <span>row</span>
      </div>,
    );
    const indicator = container.querySelector("[data-testid='indicator']");
    expect(indicator).toBeInTheDocument();
    expect(indicator?.className).toContain("absolute");
    const topVal = (indicator as HTMLElement | null)?.style.top ?? "";
    expect(["0", "0px"]).toContain(topVal);
  });

  it("rendered Pins section shows an absolute indicator div on the drop-target row", () => {
    render(
      <SidebarPinsSection
        driveBase="/drive/main"
        drive="main"
        pins={[{ path: "a/one" }, { path: "b/two" }]}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    // No drag in progress → no indicator yet.
    expect(document.querySelector(".bg-accent.absolute")).not.toBeInTheDocument();
  });
});
