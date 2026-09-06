import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FolderContextMenu } from "../FolderContextMenu";
import type { Folder } from "@/types";

vi.mock("@/lib/api", () => ({
  renameFolder: vi.fn(),
  moveFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

vi.mock("../RenameDialog", () => ({
  RenameDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="rename-dialog" /> : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="move-dialog" /> : null,
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="confirm-dialog" /> : null,
}));

const folder: Folder = {
  name: "Travel Photos",
  path: "Travel Photos",
  file_count: 12,
  kind_counts: {},
  dominant_kind: null,
};

function makeProps(overrides: Partial<React.ComponentProps<typeof FolderContextMenu>> = {}) {
  return {
    open: true,
    position: { x: 100, y: 100 },
    target: folder,
    drive: "main",
    isPinned: false,
    onTogglePin: vi.fn(),
    onUpdate: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("FolderContextMenu", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<FolderContextMenu {...makeProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when target is null", () => {
    const { container } = render(<FolderContextMenu {...makeProps({ target: null })} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Pin item when not pinned", () => {
    render(<FolderContextMenu {...makeProps({ isPinned: false })} />);
    expect(screen.getByText("Pin")).toBeInTheDocument();
    expect(screen.queryByText("Unpin")).not.toBeInTheDocument();
  });

  it("renders Unpin item when pinned", () => {
    render(<FolderContextMenu {...makeProps({ isPinned: true })} />);
    expect(screen.getByText("Unpin")).toBeInTheDocument();
    expect(screen.queryByText("Pin")).not.toBeInTheDocument();
  });

  it("renders Rename / Move / Delete items", () => {
    render(<FolderContextMenu {...makeProps()} />);
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Move")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("does not render any dialog initially", () => {
    render(<FolderContextMenu {...makeProps()} />);
    expect(screen.queryByTestId("rename-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("opens rename dialog when Rename clicked", async () => {
    render(<FolderContextMenu {...makeProps()} />);
    fireEvent.click(screen.getByText("Rename"));
    await waitFor(() => {
      expect(screen.getByTestId("rename-dialog")).toBeInTheDocument();
    });
  });

  it("opens move dialog when Move clicked", async () => {
    render(<FolderContextMenu {...makeProps()} />);
    fireEvent.click(screen.getByText("Move"));
    await waitFor(() => {
      expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
    });
  });

  it("opens confirm dialog when Delete clicked", async () => {
    render(<FolderContextMenu {...makeProps()} />);
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
  });

  it("calls onTogglePin when Pin clicked", async () => {
    const onTogglePin = vi.fn();
    render(<FolderContextMenu {...makeProps({ onTogglePin })} />);
    fireEvent.click(screen.getByText("Pin"));
    await waitFor(() => {
      expect(onTogglePin).toHaveBeenCalledTimes(1);
    });
  });

  it("hides Pin item when onTogglePin is undefined", () => {
    render(<FolderContextMenu {...makeProps({ onTogglePin: undefined })} />);
    expect(screen.queryByText("Pin")).not.toBeInTheDocument();
    expect(screen.queryByText("Unpin")).not.toBeInTheDocument();
  });

  describe("opt-in tree-pane items", () => {
    it("does not render Open / New file here / New folder here by default", () => {
      render(<FolderContextMenu {...makeProps()} />);
      expect(screen.queryByText("Open")).not.toBeInTheDocument();
      expect(screen.queryByText("New file here")).not.toBeInTheDocument();
      expect(screen.queryByText("New folder here")).not.toBeInTheDocument();
    });

    it("renders Open and dispatches when clicked", async () => {
      const onOpen = vi.fn();
      render(<FolderContextMenu {...makeProps({ onOpen })} />);
      fireEvent.click(screen.getByText("Open"));
      await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    });

    it("renders New file here and dispatches when clicked", async () => {
      const onCreateFileHere = vi.fn();
      render(<FolderContextMenu {...makeProps({ onCreateFileHere })} />);
      fireEvent.click(screen.getByText("New file here"));
      await waitFor(() =>
        expect(onCreateFileHere).toHaveBeenCalledTimes(1),
      );
    });

    it("renders New folder here and opens an inline name dialog", async () => {
      const onCreateFolderHere = vi.fn();
      render(
        <FolderContextMenu {...makeProps({ onCreateFolderHere })} />,
      );
      fireEvent.click(screen.getByText("New folder here"));
      // The component opens a NameInputDialog; we don't assert internals,
      // only that the click is wired (the dialog itself is unit-tested
      // separately).
      await waitFor(() => {
        expect(
          screen.getByText(/New folder|newFolderTitle|新規フォルダ/),
        ).toBeInTheDocument();
      });
    });
  });
});
