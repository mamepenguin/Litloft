import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { FolderTreeRow, type FlatTreeRow } from "../FolderTreeRow";

vi.mock("@/components/FileTypeIcon", () => ({
  FileTypeIcon: () => null,
}));

const folderRow: FlatTreeRow = {
  node: {
    kind: "folder",
    name: "Notes",
    path: "Notes",
    file_count: 3,
    has_children: true,
  },
  depth: 0,
  isExpanded: false,
  isLoading: false,
};

const fileRow: FlatTreeRow = {
  node: {
    kind: "file",
    name: "README.md",
    path: "Notes/README.md",
    file_id: "f1",
    file_type: "document",
    mime_type: "text/markdown",
  },
  depth: 1,
  isExpanded: false,
  isLoading: false,
};

describe("FolderTreeRow — onContextMenu", () => {
  it("invokes onContextMenu with the row and event when right-clicked on a folder", () => {
    const onContextMenu = vi.fn();
    const { getByText } = render(
      <FolderTreeRow
        row={folderRow}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onContextMenu={onContextMenu}
      />,
    );
    fireEvent.contextMenu(getByText("Notes"));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    const [row] = onContextMenu.mock.calls[0]!;
    expect(row).toBe(folderRow);
  });

  it("invokes onContextMenu with the row and event when right-clicked on a file", () => {
    const onContextMenu = vi.fn();
    const { getByText } = render(
      <FolderTreeRow
        row={fileRow}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onContextMenu={onContextMenu}
      />,
    );
    fireEvent.contextMenu(getByText("README.md"));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    const [row] = onContextMenu.mock.calls[0]!;
    expect(row).toBe(fileRow);
  });

  it("does nothing when onContextMenu is omitted (browser default fires)", () => {
    // No throws; this is a smoke test ensuring the prop is optional.
    const { getByText } = render(
      <FolderTreeRow
        row={folderRow}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    fireEvent.contextMenu(getByText("Notes"));
    // No assertion needed: render and fire without error is sufficient.
  });
});
