import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FolderListRow } from "../FolderListRow";
import { FileListRow } from "../FileListRow";
import type { FileItem, Folder } from "@/types";

vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ isCut: () => false }),
}));

const folder = (overrides: Partial<Folder> = {}): Folder => ({
  name: "travel",
  path: "travel",
  file_count: 5,
  thumbnail_file_id: null,
  dominant_kind: null,
  ...overrides,
});

const file = (): FileItem => ({
  image_width: null,
  image_height: null,
  id: "f1",
  filename: "clip.mp4",
  title: "clip",
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: true,
  file_size: 1000,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("FolderListRow", () => {
  it("links into the folder, path-encoded", () => {
    render(
      <FolderListRow
        folder={folder({ name: "kyoto 2026", path: "travel/kyoto 2026" })}
        driveName="my drive"
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/drive/my%20drive/travel/kyoto%202026",
    );
  });

  it("shows the folder's size beside its name", () => {
    render(<FolderListRow folder={folder({ file_count: 5 })} driveName="main" />);
    expect(screen.getByText("travel")).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it("takes a drop, like the card does", () => {
    const onDrop = vi.fn();
    const { container } = render(
      <FolderListRow
        folder={folder()}
        driveName="main"
        isDropTarget
        dropTargetProps={{ onDrop }}
      />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("ring-accent");
    fireEvent.drop(row);
    expect(onDrop).toHaveBeenCalled();
  });

  it("is a drag source, and stops being one while it is being renamed", () => {
    const { container, rerender } = render(
      <FolderListRow folder={folder()} driveName="main" draggable />,
    );
    expect(container.firstElementChild).toHaveAttribute("draggable", "true");

    rerender(
      <FolderListRow
        folder={folder()}
        driveName="main"
        draggable
        isEditing
        onRenameCommit={vi.fn()}
        onRenameCancel={vi.fn()}
      />,
    );
    // A text selection inside a draggable ancestor is swallowed by the
    // drag system, so the field would be impossible to select in.
    expect(container.firstElementChild).toHaveAttribute("draggable", "false");
  });

  it("renames in place, with no link around the field", () => {
    render(
      <FolderListRow
        folder={folder()}
        driveName="main"
        isEditing
        onRenameCommit={vi.fn()}
        onRenameCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    // Clicking a text input inside an anchor navigates away.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hands its right-click to the host, which owns the one folder menu", () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <FolderListRow
        folder={folder()}
        driveName="main"
        onContextMenu={onContextMenu}
      />,
    );
    fireEvent.contextMenu(container.firstElementChild as HTMLElement);
    expect(onContextMenu).toHaveBeenCalled();
  });

  /**
   * F-8. jsdom lays nothing out, so this asserts the class both rows
   * carry rather than a measured width — the measured one is in the PR.
   */
  it("caps its contents at the same measure a file row does", () => {
    const { container: folderRow } = render(
      <FolderListRow folder={folder()} driveName="main" />,
    );
    const { container: fileRow } = render(<FileListRow file={file()} />);

    const capped = (root: HTMLElement) =>
      root.querySelectorAll(".max-w-list-row").length;
    expect(capped(folderRow)).toBe(1);
    expect(capped(fileRow)).toBe(1);
  });

  it("caps the contents and not the row, so the whole width stays hoverable", () => {
    const { container } = render(
      <FolderListRow folder={folder()} driveName="main" />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("hover:bg-bg-elevated");
    expect(row.className.split(/\s+/)).not.toContain("max-w-list-row");
  });
});
