/**
 * Phase 4: Tags ソートモード切替の結合テスト
 *
 * Tags はアイテム手動 D&D せず name/count ソート切替 (hako c3CcYY_a8nRwD5lG-zeOi)。
 * セクション grip (Phase2) は維持されることも固定する。
 *
 * テスト戦略 (Phase2/3 / useReorderableDnD.test.tsx 流儀):
 * - (1) default で count 降順に描画
 * - (2) トグルクリックで name 昇順 + sidebar:sort:tags:{drive} に永続化
 * - (3) 別 drive で独立
 * - (4) セクション grip (dragHandle) は依然描画される = Phase2 非破壊
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SidebarTagsSection } from "../SidebarTagsSection";
import type { ScopedTags } from "../useSidebarData";
import type { Tag as TagType } from "@/types";

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

// ---- helpers -----------------------------------------------------------------

const tagItems: TagType[] = [
  { name: "alpha", count: 1 },
  { name: "beta", count: 9 },
  { name: "gamma", count: 5 },
];

/** Tags whose resolved scope matches the drive/folder they render under. */
function inScope(drive: string, items: TagType[] = tagItems): ScopedTags {
  return { resolvedScope: { drive, folderPath: null }, items };
}

function tagOrderInDom(): string[] {
  return screen
    .getAllByRole("link")
    .map((a) => a.textContent ?? "")
    .map((tx) => tx.replace(/[0-9]/g, ""))
    .map((tx) => tx.trim());
}

const SORT_KEY = "sidebar:sort:tags:main";

// ---- tests -------------------------------------------------------------------

describe("SidebarTagsSection — sort mode toggle", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("(1) defaults to count (descending) order", () => {
    render(
      <SidebarTagsSection
        drive="main"
        currentFolderPath={null}
        pathname="/drive/main"
        activeTag={null}
        activeView={null}
        tags={inScope("main")}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    // count desc: beta(9), gamma(5), alpha(1)
    expect(tagOrderInDom()).toEqual(["beta", "gamma", "alpha"]);
  });

  it("(2) clicking the toggle switches to name order and persists", () => {
    render(
      <SidebarTagsSection
        drive="main"
        currentFolderPath={null}
        pathname="/drive/main"
        activeTag={null}
        activeView={null}
        tags={inScope("main")}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Toggle tag sort order" });
    fireEvent.click(toggle);

    // name asc: alpha, beta, gamma
    expect(tagOrderInDom()).toEqual(["alpha", "beta", "gamma"]);
    expect(mockStorage.getItem(SORT_KEY)).toBe("name");
  });

  it("(2b) toggling back to count removes the persisted key (default = count)", () => {
    mockStorage.setItem(SORT_KEY, "name");
    render(
      <SidebarTagsSection
        drive="main"
        currentFolderPath={null}
        pathname="/drive/main"
        activeTag={null}
        activeView={null}
        tags={inScope("main")}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    // starts in name mode (persisted)
    expect(tagOrderInDom()).toEqual(["alpha", "beta", "gamma"]);

    const toggle = screen.getByRole("button", { name: "Toggle tag sort order" });
    fireEvent.click(toggle);

    // back to count desc, key removed (default mode is not persisted)
    expect(tagOrderInDom()).toEqual(["beta", "gamma", "alpha"]);
    expect(mockStorage.getItem(SORT_KEY)).toBeNull();
  });

  it("(3) sort mode is isolated per drive", () => {
    mockStorage.setItem("sidebar:sort:tags:work", "name");
    // Rendering for drive 'photos' must NOT pick up work's name mode.
    render(
      <SidebarTagsSection
        drive="photos"
        currentFolderPath={null}
        pathname="/drive/photos"
        activeTag={null}
        activeView={null}
        tags={inScope("photos")}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    // photos has no saved mode → default count desc
    expect(tagOrderInDom()).toEqual(["beta", "gamma", "alpha"]);
  });

  it("(4) the section drag handle (Phase 2) is still rendered", () => {
    render(
      <SidebarTagsSection
        drive="main"
        currentFolderPath={null}
        pathname="/drive/main"
        activeTag={null}
        activeView={null}
        tags={inScope("main")}
        linkClass={() => ""}
        close={vi.fn()}
        dragHandle={<span data-testid="section-grip">grip</span>}
      />,
    );
    expect(screen.getByTestId("section-grip")).toBeInTheDocument();
  });

  it("(4b) tag items themselves have NO grip (no manual reorder)", () => {
    render(
      <SidebarTagsSection
        drive="main"
        currentFolderPath={null}
        pathname="/drive/main"
        activeTag={null}
        activeView={null}
        tags={inScope("main")}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    // The only reorder-related affordance is the sort toggle, never an
    // item-level "Drag to reorder" grip.
    expect(
      screen.queryByRole("button", { name: "Drag to reorder" }),
    ).not.toBeInTheDocument();
  });

  // Was pinned to the drive root by hako review finding H1 (2026-08-02),
  // because the file-listing API could not combine a folder path with a
  // tag subtree match. `recursive` lifted that constraint (spec
  // 2026-08-21-folder-scoped-tag-filter); with no folder in the resolved
  // scope the drive root is still the right target. Folder scoping is
  // covered in SidebarTagsScope.test.tsx.
  it("targets the drive root when the resolved scope carries no folder", () => {
    render(
      <SidebarTagsSection
        drive="main"
        currentFolderPath={null}
        pathname="/drive/main"
        activeTag={null}
        activeView={null}
        tags={inScope("main")}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/drive\/main\?tag=/);
    }
  });

  it("does not mutate the input tags array (sortTags is immutable)", () => {
    const input: TagType[] = [
      { name: "z", count: 1 },
      { name: "a", count: 2 },
    ];
    const snapshot = [...input];
    render(
      <SidebarTagsSection
        drive="main"
        currentFolderPath={null}
        pathname="/drive/main"
        activeTag={null}
        activeView={null}
        tags={inScope("main", input)}
        linkClass={() => ""}
        close={vi.fn()}
      />,
    );
    expect(input).toEqual(snapshot);
  });
});
