import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFolderTree = vi.fn();
// Spies (not plain functions) because the inline-rename tests assert on
// their arguments; reset in beforeEach like mockGetFolderTree.
const mockRenameFolder = vi.fn();
const mockRenameFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
  // Pin and mutation surfaces consumed by the new context menus on the
  // tree rows. afterEach calls vi.restoreAllMocks() which would erase
  // mockResolvedValue from a `vi.fn()`, so we use plain functions for
  // anything that *must* return a promise.
  getPins: () => Promise.resolve([]),
  addPin: () => Promise.resolve(undefined),
  removePin: () => Promise.resolve(undefined),
  createTextFile: () => Promise.resolve({}),
  createFolder: () => Promise.resolve({}),
  renameFolder: (...args: unknown[]) => mockRenameFolder(...args),
  moveFolder: () => Promise.resolve({}),
  deleteFolder: () => Promise.resolve(undefined),
  renameFile: (...args: unknown[]) => mockRenameFile(...args),
  moveFile: () => Promise.resolve({}),
  deleteFile: () => Promise.resolve(undefined),
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

// jsdom doesn't compute layout, so @tanstack/react-virtual never marks
// any items as visible. Replace it with a non-virtual implementation
// that yields every item so DOM assertions can run.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: (i: number) => number }) => {
    const rows = Array.from({ length: count }, (_, i) => ({
      index: i,
      key: i,
      start: i * estimateSize(i),
      size: estimateSize(i),
      lane: 0,
    }));
    return {
      getTotalSize: () => count * estimateSize(0),
      getVirtualItems: () => rows,
      measureElement: () => undefined,
    };
  },
}));

import { FolderTreePane } from "../FolderTreePane";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";

const driveExpKey = (drive: string) => `tree:expanded:${drive}`;
const driveFilterKey = (drive: string) => `tree:typeFilter:${drive}`;

function dragDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (key: string, value: string) => {
      store.set(key, value);
    },
    getData: (key: string) => store.get(key) ?? "",
    effectAllowed: "uninitialized",
    dropEffect: "none",
    types: [],
  } as unknown as DataTransfer;
}

beforeEach(() => {
  mockGetFolderTree.mockReset();
  mockRenameFolder.mockReset().mockResolvedValue({});
  mockRenameFile.mockReset().mockResolvedValue({});
  localStorage.removeItem(driveExpKey("work"));
  localStorage.removeItem(driveFilterKey("work"));
});

afterEach(() => {
  // Unmount any rendered components before vi.restoreAllMocks so a
  // pending debounce timer cannot fire after the api mock has been
  // wiped (which would crash on the next fetchPath round-trip with
  // a "Cannot read .then of undefined" error). Spec 2026-05-09: the
  // tree filter triggers a flat-mode refetch when text becomes
  // non-empty, so leftover timers now reach the api layer where they
  // didn't before.
  cleanup();
  vi.restoreAllMocks();
  localStorage.removeItem(driveExpKey("work"));
  localStorage.removeItem(driveFilterKey("work"));
});

describe("FolderTreePane", () => {
  it("loads root and renders folder names", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "folder", name: "Q1", path: "Q1", file_count: 3, has_children: true },
      { kind: "folder", name: "Q2", path: "Q2", file_count: 0, has_children: false },
      { kind: "file", name: "readme.md", path: "readme.md", file_id: "f1", file_type: "document", mime_type: "text/markdown" },
    ]);

    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });

  it("row click selects a folder but does NOT expand it", async () => {
    // Spec 2026-05-09-tree-pane-separated-interaction.md: row click =
    // selection only. Expansion is the chevron's exclusive job.
    mockGetFolderTree.mockImplementation((_drive: string, params: { root?: string }) => {
      if (params.root === "" || params.root === undefined) {
        return Promise.resolve([
          { kind: "folder", name: "Q1", path: "Q1", file_count: 3, has_children: true },
        ]);
      }
      if (params.root === "Q1") {
        return Promise.resolve([
          { kind: "file", name: "a.md", path: "Q1/a.md", file_id: "fa", file_type: "document", mime_type: "text/markdown" },
        ]);
      }
      return Promise.resolve([]);
    });

    const onSelectFolder = vi.fn();
    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={onSelectFolder}
        onSelectFile={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Q1"));
    expect(onSelectFolder).toHaveBeenCalledWith("Q1");

    // Row click MUST NOT trigger child loading — the child fetch only
    // runs when the chevron toggles expansion.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();
  });

  it("chevron click expands folder and loads children, without selecting", async () => {
    mockGetFolderTree.mockImplementation((_drive: string, params: { root?: string }) => {
      if (params.root === "" || params.root === undefined) {
        return Promise.resolve([
          { kind: "folder", name: "Q1", path: "Q1", file_count: 3, has_children: true },
        ]);
      }
      if (params.root === "Q1") {
        return Promise.resolve([
          { kind: "file", name: "a.md", path: "Q1/a.md", file_id: "fa", file_type: "document", mime_type: "text/markdown" },
        ]);
      }
      return Promise.resolve([]);
    });

    const onSelectFolder = vi.fn();
    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={onSelectFolder}
        onSelectFile={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());

    // Chevron carries the i18n aria-label "expand" / "collapse" /
    // tree.expand / 展開. Pick whichever matches.
    const chevron = screen.getByRole("button", {
      name: /^expand$|tree\.expand|展開/i,
    });
    fireEvent.click(chevron);

    // Selection must NOT have changed — the chevron is expansion-only.
    expect(onSelectFolder).not.toHaveBeenCalled();
    // Children must now load.
    await waitFor(() => expect(screen.getByText("a.md")).toBeInTheDocument());
  });

  it("file click invokes onSelectFile with file_id and path", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "file", name: "doc.md", path: "doc.md", file_id: "fid42", file_type: "document", mime_type: "text/markdown" },
    ]);

    const onSelectFile = vi.fn();
    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={onSelectFile}
      />,
    );

    await waitFor(() => expect(screen.getByText("doc.md")).toBeInTheDocument());

    fireEvent.click(screen.getByText("doc.md"));
    expect(onSelectFile).toHaveBeenCalledWith("fid42", "doc.md");
  });

  it("renders empty state when root has no children", async () => {
    mockGetFolderTree.mockResolvedValue([]);

    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("No files in this folder")).toBeInTheDocument());
  });

  it("changing type filter triggers refetch", async () => {
    mockGetFolderTree.mockResolvedValue([]);

    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    await waitFor(() => expect(mockGetFolderTree).toHaveBeenCalledTimes(1));

    // The type filter is now opened via the funnel icon (chip inline UI).
    const trigger = screen.getByRole("button", {
      name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
    });
    fireEvent.click(trigger);
    const markdownItem = await screen.findByRole("menuitem", { name: /markdown/i });
    fireEvent.click(markdownItem);

    await waitFor(() => expect(mockGetFolderTree).toHaveBeenCalledTimes(2));
    expect(mockGetFolderTree).toHaveBeenLastCalledWith(
      "work",
      expect.objectContaining({ type_filter: "markdown" }),
      expect.any(Object),
    );
  });

  it("renders the root drop band as an overlay during tree-row drag", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "folder", name: "Q1", path: "Q1", file_count: 3, has_children: true },
      { kind: "folder", name: "Q2", path: "Q2", file_count: 0, has_children: false },
    ]);

    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());

    fireEvent.dragStart(screen.getByText("Q1"), {
      dataTransfer: dragDataTransfer(),
    });

    const rootDropBand = await screen.findByLabelText(
      /drop here to move to drive root|tree\.dropToRoot|ここにドロップしてドライブルートへ移動/i,
    );
    expect(rootDropBand.className).toMatch(/\babsolute\b/);
    expect(rootDropBand.className).toMatch(/\bz-20\b/);
  });
});

/**
 * Phase 4 — tree filter (text + type) tests.
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §3.
 *
 * RED phase — these assertions exercise behavior that ships with the
 * <FilterField> integration (phase 4.6). They are expected to fail until
 * then.
 */
describe("FolderTreePane filter (Phase 4)", () => {
  it("renders the FilterField placeholder in place of TypeFilterChips", async () => {
    mockGetFolderTree.mockResolvedValue([]);

    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    // The new FilterField has a text input with placeholder coming from
    // the `filter.placeholder.tree` namespace; tolerate the literal,
    // the i18n key fallback, or the JA copy.
    const input = await screen.findByPlaceholderText(
      /filter by name|filter\.placeholder\.tree|名前で絞り込み/i,
    );
    expect(input).toBeInTheDocument();
  });

  it("dims ancestor nodes when filter is active (data-state='ancestor')", async () => {
    // Filter ON loads the whole tree flat — return a tree where only a leaf matches.
    mockGetFolderTree.mockResolvedValue([
      { kind: "folder", name: "Knowledge", path: "Knowledge", file_count: 0, has_children: true },
      { kind: "folder", name: "docs", path: "Knowledge/docs", file_count: 0, has_children: true },
      { kind: "folder", name: "specs", path: "Knowledge/docs/specs", file_count: 1, has_children: true },
      { kind: "file", name: "spec1.md", path: "Knowledge/docs/specs/spec1.md", file_id: "f1", file_type: "document", mime_type: "text/markdown" },
      { kind: "file", name: "unrelated.md", path: "Knowledge/unrelated.md", file_id: "f2", file_type: "document", mime_type: "text/markdown" },
    ]);

    const { container } = render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText(
      /filter by name|filter\.placeholder\.tree|名前で絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "spec1" } });

    await waitFor(() => {
      const ancestors = container.querySelectorAll('[data-state="ancestor"]');
      expect(ancestors.length).toBeGreaterThan(0);
    });
  });

  it("cascades visibility when a folder name matches (descendants visible)", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "folder", name: "specs", path: "specs", file_count: 1, has_children: true },
      { kind: "file", name: "child.md", path: "specs/child.md", file_id: "fc", file_type: "document", mime_type: "text/markdown" },
      { kind: "file", name: "other.md", path: "other.md", file_id: "fo", file_type: "document", mime_type: "text/markdown" },
    ]);

    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText(
      /filter by name|filter\.placeholder\.tree|名前で絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "specs" } });

    await waitFor(() => {
      expect(screen.getByText("specs")).toBeInTheDocument();
      // descendant is visible because parent matched
      expect(screen.getByText("child.md")).toBeInTheDocument();
    });
    // unrelated sibling file is hidden
    expect(screen.queryByText("other.md")).not.toBeInTheDocument();
  });

  it("shows the empty-filter UI with a 'clear' action when no node matches", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "file", name: "alpha.md", path: "alpha.md", file_id: "fa", file_type: "document", mime_type: "text/markdown" },
    ]);

    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText(
      /filter by name|filter\.placeholder\.tree|名前で絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "nothingmatches" } });

    // Empty state for tree — copy may be EN/JA/key fallback.
    await waitFor(() => {
      expect(
        screen.getByText(
          /no matching files or folders|filter\.empty\.tree|該当するファイル・フォルダはありません/i,
        ),
      ).toBeInTheDocument();
    });
    const clearBtn = screen.getByRole("button", {
      name: /clear filters|filter\.clear|フィルタを解除/i,
    });
    expect(clearBtn).toBeInTheDocument();
  });

  it("empty-state clear button restores the unfiltered tree", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "file", name: "alpha.md", path: "alpha.md", file_id: "fa", file_type: "document", mime_type: "text/markdown" },
      { kind: "file", name: "beta.md", path: "beta.md", file_id: "fb", file_type: "document", mime_type: "text/markdown" },
    ]);

    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    const input = await screen.findByPlaceholderText(
      /filter by name|filter\.placeholder\.tree|名前で絞り込み/i,
    );
    // Filter to a non-matching string so the empty-state UI (which now
    // owns the "Clear filters" button per spec §3.8 / H1) appears.
    fireEvent.change(input, { target: { value: "zzz-no-match" } });

    const clearBtn = await screen.findByRole("button", {
      name: /clear filters|filter\.clear|解除$/i,
    });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText("alpha.md")).toBeInTheDocument();
      expect(screen.getByText("beta.md")).toBeInTheDocument();
    });
  });
});

/**
 * Spring-loaded drag — spec 2026-08-21-inline-rename-and-spring-loaded-drag §6.
 */
describe("FolderTreePane spring-loaded expansion", () => {
  function mockTree() {
    mockGetFolderTree.mockImplementation(
      (_drive: string, params: { root?: string }) => {
        if (params.root === "" || params.root === undefined) {
          return Promise.resolve([
            { kind: "folder", name: "Q1", path: "Q1", file_count: 3, has_children: true },
            { kind: "folder", name: "Q2", path: "Q2", file_count: 1, has_children: false },
          ]);
        }
        if (params.root === "Q1") {
          return Promise.resolve([
            { kind: "file", name: "inside.md", path: "Q1/inside.md", file_id: "fa", file_type: "document", mime_type: "text/markdown" },
          ]);
        }
        return Promise.resolve([]);
      },
    );
  }

  async function renderAndStartDrag() {
    mockTree();
    render(
      <FolderTreePane
        drive="work"
        selectedPath={null}
        onSelectFolder={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    fireEvent.dragStart(screen.getByText("Q2"), { dataTransfer: dragDataTransfer() });
    return screen.getByText("Q1").closest("div[draggable]") as HTMLElement;
  }

  it("expands a folder the drag has dwelt on", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const q1Row = await renderAndStartDrag();
      fireEvent.dragEnter(q1Row, { dataTransfer: dragDataTransfer() });

      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      await waitFor(() => expect(screen.getByText("inside.md")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not expand a folder the drag only passes over", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const q1Row = await renderAndStartDrag();
      fireEvent.dragEnter(q1Row, { dataTransfer: dragDataTransfer() });
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      fireEvent.dragLeave(q1Row, { dataTransfer: dragDataTransfer() });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      expect(screen.queryByText("inside.md")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("collapses the branch again when the drag ends without dropping into it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const q1Row = await renderAndStartDrag();
      fireEvent.dragEnter(q1Row, { dataTransfer: dragDataTransfer() });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      await waitFor(() => expect(screen.getByText("inside.md")).toBeInTheDocument());

      fireEvent.dragEnd(screen.getByText("Q2"));

      await waitFor(() =>
        expect(screen.queryByText("inside.md")).not.toBeInTheDocument(),
      );
      expect(localStorage.getItem(driveExpKey("work")) ?? "[]").not.toContain("Q1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("spring-loads for a drag that started in the other pane", async () => {
    // A file card dragged from the right pane never sets this instance's
    // own drag state, but its dragenter still lands on tree rows. The
    // shared window signal is what makes the dwell count.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockTree();
      render(
        <FolderTreePane
          drive="work"
          selectedPath={null}
          onSelectFolder={vi.fn()}
          onSelectFile={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());

      act(() => {
        window.dispatchEvent(new Event("loft-internal-drag-start"));
      });
      const q1Row = screen.getByText("Q1").closest("div[draggable]") as HTMLElement;
      fireEvent.dragEnter(q1Row, { dataTransfer: dragDataTransfer() });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      await waitFor(() => expect(screen.getByText("inside.md")).toBeInTheDocument());

      act(() => {
        window.dispatchEvent(new Event("loft-internal-drag-end"));
      });
      await waitFor(() =>
        expect(screen.queryByText("inside.md")).not.toBeInTheDocument(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a branch the user had already opened alone", async () => {
    // Only branches this drag opened are tracked, so the user's own
    // expansion state survives a drag that passes over it.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      localStorage.setItem(driveExpKey("work"), JSON.stringify(["Q1"]));
      mockTree();
      render(
        <FolderTreePane
          drive="work"
          selectedPath={null}
          onSelectFolder={vi.fn()}
          onSelectFile={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText("inside.md")).toBeInTheDocument());

      fireEvent.dragStart(screen.getByText("Q2"), { dataTransfer: dragDataTransfer() });
      const q1Row = screen.getByText("Q1").closest("div[draggable]") as HTMLElement;
      fireEvent.dragEnter(q1Row, { dataTransfer: dragDataTransfer() });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      fireEvent.dragEnd(screen.getByText("Q2"));

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      expect(screen.getByText("inside.md")).toBeInTheDocument();
      expect(localStorage.getItem(driveExpKey("work"))).toContain("Q1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the branch open when the drop lands inside it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const q1Row = await renderAndStartDrag();
      fireEvent.dragEnter(q1Row, { dataTransfer: dragDataTransfer() });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      await waitFor(() => expect(screen.getByText("inside.md")).toBeInTheDocument());

      await act(async () => {
        fireEvent.drop(q1Row, { dataTransfer: dragDataTransfer() });
      });
      fireEvent.dragEnd(screen.getByText("Q2"));

      await waitFor(() => expect(screen.getByText("inside.md")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Inline rename — spec 2026-08-21-inline-rename-and-spring-loaded-drag §3.
 */
describe("FolderTreePane inline rename", () => {
  function mockTree() {
    mockGetFolderTree.mockImplementation(
      (_drive: string, params: { root?: string }) => {
        if (params.root === "" || params.root === undefined) {
          return Promise.resolve([
            { kind: "folder", name: "Notes", path: "Notes", file_count: 2, has_children: false },
            { kind: "file", name: "todo.md", path: "todo.md", file_id: "f1", file_type: "document", mime_type: "text/markdown" },
          ]);
        }
        return Promise.resolve([]);
      },
    );
  }

  async function renderPane() {
    mockTree();
    // AppShell provides this in the real app; F2 is registered through it.
    render(
      <ShortcutsProvider>
        <FolderTreePane
          drive="work"
          selectedPath={null}
          onSelectFolder={vi.fn()}
          onSelectFile={vi.fn()}
        />
      </ShortcutsProvider>,
    );
    await waitFor(() => expect(screen.getByText("Notes")).toBeInTheDocument());
  }

  function rowFor(name: string): HTMLElement {
    return screen.getByText(name).closest("div[draggable]") as HTMLElement;
  }

  async function openRenameFromContextMenu(name: string) {
    fireEvent.contextMenu(rowFor(name));
    const item = await screen.findByText(/^Rename$/i);
    fireEvent.click(item);
  }

  it("edits the row in place instead of opening the rename dialog", async () => {
    await renderPane();
    await openRenameFromContextMenu("Notes");

    const input = (await screen.findByRole("textbox", {
      name: /new name/i,
    })) as HTMLInputElement;
    expect(input.value).toBe("Notes");
    // The dialog heading must not be on screen.
    expect(screen.queryByRole("heading", { name: /^Rename$/i })).not.toBeInTheDocument();
  });

  it("renames a folder through the folder API", async () => {
    await renderPane();
    await openRenameFromContextMenu("Notes");
    const input = await screen.findByRole("textbox", { name: /new name/i });

    fireEvent.change(input, { target: { value: "Archive" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(mockRenameFolder).toHaveBeenCalledWith("work", "Notes", "Archive");
  });

  it("renames a file through the file API, by id", async () => {
    await renderPane();
    await openRenameFromContextMenu("todo.md");
    const input = await screen.findByRole("textbox", { name: /new name/i });

    fireEvent.change(input, { target: { value: "done.md" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(mockRenameFile).toHaveBeenCalledWith("f1", "done.md");
  });

  it("starts editing the focused row on F2", async () => {
    await renderPane();
    const label = screen.getByText("Notes").closest("button") as HTMLElement;
    await act(async () => {
      label.focus();
    });

    fireEvent.keyDown(document, { key: "F2" });

    expect(
      await screen.findByRole("textbox", { name: /new name/i }),
    ).toBeInTheDocument();
  });

  it("does nothing on F2 when no row has focus", async () => {
    await renderPane();
    fireEvent.keyDown(document, { key: "F2" });
    expect(screen.queryByRole("textbox", { name: /new name/i })).not.toBeInTheDocument();
  });

  it("stays off the shortcut stack entirely until a row has focus", async () => {
    // Not merely a no-op handler: the context must be absent, or it would
    // sit on top of the right pane's own F2 context and swallow the key
    // there. The cheat sheet is the observable form of the stack.
    await renderPane();
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.queryByText("Folder tree")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    await act(async () => {
      (screen.getByText("Notes").closest("button") as HTMLElement).focus();
    });
    fireEvent.keyDown(document, { key: "?" });
    expect(await screen.findByText("Folder tree")).toBeInTheDocument();
  });

  it("hands focus back to the row when the edit is abandoned", async () => {
    // F2 is a keyboard entry point; dropping focus to <body> on every
    // rename would lose the user's place in the tree.
    await renderPane();
    const label = screen.getByText("Notes").closest("button") as HTMLElement;
    // Async act: focusing schedules setFocusedPath -> useShortcuts push ->
    // setStack -> the provider's stackRef sync. The synchronous form does
    // not reliably drain that cascade under load, and F2 dispatched before
    // it lands finds no context.
    await act(async () => {
      label.focus();
    });
    fireEvent.keyDown(document, { key: "F2" });
    const input = await screen.findByRole("textbox", { name: /new name/i });

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByText("Notes").closest("button"),
      ),
    );
  });

  it("hands focus to the renamed row once the list comes back", async () => {
    await renderPane();
    await openRenameFromContextMenu("Notes");
    const input = await screen.findByRole("textbox", { name: /new name/i });

    // The refresh that follows the rename returns the new name.
    mockGetFolderTree.mockImplementation(() =>
      Promise.resolve([
        { kind: "folder", name: "Archive", path: "Archive", file_count: 2, has_children: false },
      ]),
    );
    fireEvent.change(input, { target: { value: "Archive" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByText("Archive").closest("button"),
      ),
    );
  });

  it("leaves edit mode on Escape without calling the API", async () => {
    await renderPane();
    await openRenameFromContextMenu("Notes");
    const input = await screen.findByRole("textbox", { name: /new name/i });

    fireEvent.change(input, { target: { value: "Archive" } });
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: /new name/i })).not.toBeInTheDocument(),
    );
    expect(mockRenameFolder).not.toHaveBeenCalled();
  });
});
