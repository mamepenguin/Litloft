import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("expanding a folder loads its children", async () => {
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

    fireEvent.click(screen.getByText("Markdown"));

    await waitFor(() => expect(mockGetFolderTree).toHaveBeenCalledTimes(2));
    expect(mockGetFolderTree).toHaveBeenLastCalledWith(
      "work",
      expect.objectContaining({ type_filter: "markdown" }),
      expect.any(Object),
    );
  });
});
