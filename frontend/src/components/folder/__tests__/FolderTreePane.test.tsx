import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFolderTree = vi.fn();
vi.mock("@/lib/api", () => ({
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
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

const driveExpKey = (drive: string) => `tree:expanded:${drive}`;
const driveFilterKey = (drive: string) => `tree:typeFilter:${drive}`;

beforeEach(() => {
  mockGetFolderTree.mockReset();
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
