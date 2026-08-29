import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileContextMenu } from "../FileContextMenu";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  renameFile: vi.fn(() => Promise.resolve({})),
  moveFile: vi.fn(() => Promise.resolve({})),
  deleteFile: vi.fn(() => Promise.resolve()),
  getDownloadUrl: vi.fn((id: string) => `/api/files/${id}/download`),
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

vi.mock("../CollectionPicker", () => ({
  CollectionPicker: ({ open }: { open: boolean }) =>
    open ? <div data-testid="collection-picker" /> : null,
}));

const copyMock = vi.fn();
const cutMock = vi.fn();

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: copyMock,
    cut: cutMock,
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

import { renameFile, moveFile, deleteFile } from "@/lib/api";

const file: FileItem = {
  id: "abc123def456",
  filename: "movie.mp4",
  title: "Movie",
  description: "",
  drive: "main",
  folder_path: "videos",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "/api/files/abc123def456/thumbnail",
  has_thumbnail: true,
  file_size: 1048576,
  duration: 125.5,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-03-20T10:00:00",
  updated_at: "2026-03-20T10:00:00",
};

function makeProps(
  overrides: Partial<React.ComponentProps<typeof FileContextMenu>> = {},
) {
  return {
    open: true,
    position: { x: 100, y: 100 },
    target: file,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
    ...overrides,
  };
}

describe("FileContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Open in new tab", () => {
    it("does not render the item by default", () => {
      render(<FileContextMenu {...makeProps()} />);
      expect(screen.queryByText("Open in new tab")).not.toBeInTheDocument();
    });

    it("renders the item when onOpenInNewTab is provided and dispatches on click", async () => {
      const onOpenInNewTab = vi.fn();
      render(<FileContextMenu {...makeProps({ onOpenInNewTab })} />);
      fireEvent.click(screen.getByText("Open in new tab"));
      await waitFor(() =>
        expect(onOpenInNewTab).toHaveBeenCalledTimes(1),
      );
    });
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <FileContextMenu {...makeProps({ open: false })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when target is null", () => {
    const { container } = render(
      <FileContextMenu {...makeProps({ target: null })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders all default menu items", () => {
    render(<FileContextMenu {...makeProps()} />);
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Add to collection")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Cut")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Move")).toBeInTheDocument();
    expect(screen.getByText("Move to Trash")).toBeInTheDocument();
  });

  it("does not render Remove from history when onRemoveFromHistory is undefined", () => {
    render(<FileContextMenu {...makeProps()} />);
    expect(screen.queryByText("Remove from history")).not.toBeInTheDocument();
  });

  it("renders Remove from history when onRemoveFromHistory is provided", () => {
    render(
      <FileContextMenu
        {...makeProps({ onRemoveFromHistory: vi.fn(() => Promise.resolve()) })}
      />,
    );
    expect(screen.getByText("Remove from history")).toBeInTheDocument();
  });

  it("does not render any dialog initially", () => {
    render(<FileContextMenu {...makeProps()} />);
    expect(screen.queryByTestId("rename-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("move-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("collection-picker")).not.toBeInTheDocument();
  });

  it("opens rename dialog when Rename clicked", async () => {
    render(<FileContextMenu {...makeProps()} />);
    fireEvent.click(screen.getByText("Rename"));
    await waitFor(() => {
      expect(screen.getByTestId("rename-dialog")).toBeInTheDocument();
    });
  });

  it("opens move dialog when Move clicked", async () => {
    render(<FileContextMenu {...makeProps()} />);
    fireEvent.click(screen.getByText("Move"));
    await waitFor(() => {
      expect(screen.getByTestId("move-dialog")).toBeInTheDocument();
    });
  });

  it("opens confirm dialog when Move to Trash clicked", async () => {
    render(<FileContextMenu {...makeProps()} />);
    fireEvent.click(screen.getByText("Move to Trash"));
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
  });

  it("calls onRemoveFromHistory and onClose when Remove from history clicked", async () => {
    const onRemoveFromHistory = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    render(
      <FileContextMenu
        {...makeProps({ onRemoveFromHistory, onClose })}
      />,
    );
    fireEvent.click(screen.getByText("Remove from history"));
    await waitFor(() => {
      expect(onRemoveFromHistory).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("renders nothing when target is null even with onRemoveFromHistory", () => {
    const { container } = render(
      <FileContextMenu
        {...makeProps({
          target: null,
          onRemoveFromHistory: vi.fn(() => Promise.resolve()),
        })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onUpdate after successful rename via RenameDialog", async () => {
    // Re-mock RenameDialog to expose onRename callback
    const RenameDialogModule = await import("../RenameDialog");
    const renameSpy = vi
      .spyOn(RenameDialogModule, "RenameDialog")
      .mockImplementation((props: { open: boolean; onRename: (name: string) => Promise<void> | void }) => {
        if (!props.open) return null;
        return (
          <button
            data-testid="trigger-rename"
            onClick={() => {
              void props.onRename("renamed.mp4");
            }}
          />
        );
      });

    const onUpdate = vi.fn();
    render(<FileContextMenu {...makeProps({ onUpdate })} />);
    fireEvent.click(screen.getByText("Rename"));
    const trigger = await screen.findByTestId("trigger-rename");
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(renameFile).toHaveBeenCalledWith(file.id, "renamed.mp4");
    });
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
    renameSpy.mockRestore();
  });

  it("calls onUpdate after successful move via MoveDialog", async () => {
    const MoveDialogModule = await import("../MoveDialog");
    const moveSpy = vi
      .spyOn(MoveDialogModule, "MoveDialog")
      .mockImplementation((props: { open: boolean; onMove: (path: string) => Promise<void> | void }) => {
        if (!props.open) return null;
        return (
          <button
            data-testid="trigger-move"
            onClick={() => {
              void props.onMove("destination/path");
            }}
          />
        );
      });

    const onUpdate = vi.fn();
    render(<FileContextMenu {...makeProps({ onUpdate })} />);
    fireEvent.click(screen.getByText("Move"));
    const trigger = await screen.findByTestId("trigger-move");
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(moveFile).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
    moveSpy.mockRestore();
  });

  it("calls onUpdate after successful trash via ConfirmDialog", async () => {
    const ConfirmDialogModule = await import("../ConfirmDialog");
    const confirmSpy = vi
      .spyOn(ConfirmDialogModule, "ConfirmDialog")
      .mockImplementation((props: { open: boolean; onConfirm: () => Promise<void> | void }) => {
        if (!props.open) return null;
        return (
          <button
            data-testid="trigger-confirm"
            onClick={() => {
              void props.onConfirm();
            }}
          />
        );
      });

    const onUpdate = vi.fn();
    render(<FileContextMenu {...makeProps({ onUpdate })} />);
    fireEvent.click(screen.getByText("Move to Trash"));
    const trigger = await screen.findByTestId("trigger-confirm");
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(deleteFile).toHaveBeenCalledWith(file.id);
    });
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
    confirmSpy.mockRestore();
  });

  it("calls clipboard.copy when Copy clicked", async () => {
    render(<FileContextMenu {...makeProps()} />);
    fireEvent.click(screen.getByText("Copy"));
    await waitFor(() => {
      expect(copyMock).toHaveBeenCalled();
    });
  });

  it("calls clipboard.cut when Cut clicked", async () => {
    render(<FileContextMenu {...makeProps()} />);
    fireEvent.click(screen.getByText("Cut"));
    await waitFor(() => {
      expect(cutMock).toHaveBeenCalled();
    });
  });
});
