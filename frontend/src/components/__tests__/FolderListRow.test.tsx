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

  /**
   * Right-click and long-press are the only other ways to those actions,
   * and a keyboard has neither. A column of rows showing a `⋮` on every
   * file and none on the folders reads as the folder being a different
   * kind of thing rather than as an omission.
   */
  describe("the actions button", () => {
    it("opens the same menu the right-click opens", () => {
      const onContextMenu = vi.fn();
      render(
        <FolderListRow
          folder={folder()}
          driveName="main"
          onContextMenu={onContextMenu}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /Actions for travel/i }));
      expect(onContextMenu).toHaveBeenCalledTimes(1);
    });

    it("names the folder it acts on", () => {
      // Repeated icon-only controls need an entity-specific name — a
      // column of "Actions" tells a screen reader nothing about which row.
      render(
        <FolderListRow folder={folder({ name: "kyoto" })} driveName="main" onContextMenu={vi.fn()} />,
      );
      expect(screen.getByRole("button", { name: "Actions for kyoto" })).toBeInTheDocument();
    });

    it("anchors the menu to itself when there is no pointer", () => {
      // Enter and Space produce a click with `clientX/clientY` of 0, which
      // would clamp the menu to the top-left of the window, rows away from
      // the folder it belongs to.
      const onContextMenu = vi.fn();
      render(
        <FolderListRow folder={folder()} driveName="main" onContextMenu={onContextMenu} />,
      );
      const button = screen.getByRole("button", { name: /Actions for travel/i });
      // jsdom lays nothing out, so every rect is zeros and "not 0" would
      // be a claim about jsdom rather than about the anchoring. Give the
      // button a box and check the menu is put against *that* box.
      button.getBoundingClientRect = () =>
        ({ left: 120, bottom: 340 }) as DOMRect;
      fireEvent.click(button, { clientX: 0, clientY: 0 });

      const event = onContextMenu.mock.calls[0][0];
      expect(event.clientX).toBe(120);
      expect(event.clientY).toBe(340);
    });

    it("is not drawn where the host has no menu to open", () => {
      render(<FolderListRow folder={folder()} driveName="main" />);
      expect(screen.queryByRole("button", { name: /Actions for/i })).toBeNull();
    });

    it("holds its place rather than appearing on hover", () => {
      // Revealing it on hover reflows the row under the pointer. It shows
      // on focus for the keyboard and stays put on touch.
      render(
        <FolderListRow folder={folder()} driveName="main" onContextMenu={vi.fn()} />,
      );
      const cls = screen
        .getByRole("button", { name: /Actions for travel/i })
        .className.split(/\s+/);
      expect(cls).toContain("opacity-0");
      expect(cls).toContain("focus-visible:opacity-100");
      expect(cls).toContain("pointer-coarse:opacity-100");
    });
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
