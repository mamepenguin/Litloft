/**
 * SPEC-CORE-157 I8: the per-action callbacks of FileContextMenu. Each dialog is stubbed with
 * a button that submits it, so a request's outcome is the only thing a case varies.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";

import { FileContextMenu } from "../FileContextMenu";
import type { FileItem } from "@/types";

const renameFile = vi.fn();
const moveFile = vi.fn();
const deleteFile = vi.fn();

vi.mock("@/lib/api", () => ({
  renameFile: (...args: unknown[]) => renameFile(...args),
  moveFile: (...args: unknown[]) => moveFile(...args),
  deleteFile: (...args: unknown[]) => deleteFile(...args),
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
}));

vi.mock("../RenameDialog", () => ({
  RenameDialog: ({ open, onRename }: { open: boolean; onRename: (name: string) => unknown }) =>
    open ? (
      <div data-testid="rename-dialog">
        <button onClick={() => void onRename("renamed.mp4")}>submit-rename</button>
      </div>
    ) : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open, onMove }: { open: boolean; onMove: (path: string) => unknown }) =>
    open ? (
      <div data-testid="move-dialog">
        <button onClick={() => void onMove("elsewhere")}>submit-move</button>
      </div>
    ) : null,
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => unknown }) =>
    open
      ? createPortal(
          <div data-testid="confirm-dialog">
            <button onClick={() => void onConfirm()}>submit-trash</button>
          </div>,
          document.body,
        )
      : null,
}));

vi.mock("../CollectionPicker", () => ({ CollectionPicker: () => null }));

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("../ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const file: FileItem = {
  image_width: null,
  image_height: null,
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
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-03-20T10:00:00",
  updated_at: "2026-03-20T10:00:00",
  modified_at: null,
};

type Props = ComponentProps<typeof FileContextMenu>;
type Callbacks = { onTrashed: ReturnType<typeof vi.fn>; onRenamed: ReturnType<typeof vi.fn>; onMoved: ReturnType<typeof vi.fn> };

function callbacks(): Callbacks {
  return { onTrashed: vi.fn(), onRenamed: vi.fn(), onMoved: vi.fn() };
}

function mount(cb: Callbacks, onUpdate = vi.fn()) {
  const props: Props = {
    open: true,
    position: { x: 10, y: 10 },
    target: file,
    onClose: vi.fn(),
    onUpdate,
    ...cb,
  };
  render(<FileContextMenu {...props} />);
  return { onUpdate };
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function chooseRow(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
  });
  await settle();
}

async function submit(label: string) {
  const button = await screen.findByText(label);
  await act(async () => {
    fireEvent.click(button);
  });
  await settle();
}

const ACTIONS = [
  { row: "Rename", submit: "submit-rename", dialog: "rename-dialog", request: renameFile, callback: "onRenamed" as const, answer: () => ({ ...file, filename: "renamed.mp4" }) },
  { row: "Move", submit: "submit-move", dialog: "move-dialog", request: moveFile, callback: "onMoved" as const, answer: () => ({ ...file, folder_path: "elsewhere" }) },
  { row: "Move to Trash", submit: "submit-trash", dialog: "confirm-dialog", request: deleteFile, callback: "onTrashed" as const, answer: () => undefined },
];

beforeEach(() => {
  renameFile.mockReset();
  moveFile.mockReset();
  deleteFile.mockReset();
});

describe("SPEC-CORE-157 I8 FileContextMenu's per-action callbacks", () => {
  it.each(ACTIONS)(
    "SPEC-CORE-157 I8 after a successful $row, $callback is called once with the file, before onUpdate, and no other callback is",
    async (action) => {
      action.request.mockResolvedValue(action.answer());
      const cb = callbacks();
      const { onUpdate } = mount(cb);

      await chooseRow(action.row);
      await submit(action.submit);

      expect(cb[action.callback]).toHaveBeenCalledTimes(1);
      expect(cb[action.callback].mock.calls[0][0]).toMatchObject({ id: file.id });
      expect(onUpdate).toHaveBeenCalled();
      expect(cb[action.callback].mock.invocationCallOrder[0]).toBeLessThan(
        onUpdate.mock.invocationCallOrder[0],
      );
      for (const other of ACTIONS.filter((a) => a.callback !== action.callback)) {
        expect(cb[other.callback]).not.toHaveBeenCalled();
      }
    },
  );

  it.each(ACTIONS)(
    "SPEC-CORE-157 I6 I8 a failed $row calls no callback and keeps its dialog open; the retry that succeeds calls $callback exactly once",
    async (action) => {
      action.request.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(action.answer());
      const cb = callbacks();
      const { onUpdate } = mount(cb);

      await chooseRow(action.row);
      await submit(action.submit);

      expect(cb.onTrashed).not.toHaveBeenCalled();
      expect(cb.onRenamed).not.toHaveBeenCalled();
      expect(cb.onMoved).not.toHaveBeenCalled();
      expect(onUpdate).not.toHaveBeenCalled();
      expect(screen.getByTestId(action.dialog)).toBeInTheDocument();

      await submit(action.submit);

      expect(cb[action.callback]).toHaveBeenCalledTimes(1);
      expect(action.request).toHaveBeenCalledTimes(2);
    },
  );
});

describe("SPEC-CORE-157 I8 FileContextMenu's beforeChange gate", () => {
  it.each(ACTIONS)(
    "SPEC-CORE-157 I8 confirming $row with a gate that does not run sends nothing, calls no callback and keeps the dialog open",
    async (action) => {
      action.request.mockResolvedValue(action.answer());
      const cb = callbacks();
      const beforeChange = vi.fn();
      const onUpdate = vi.fn();
      render(
        <FileContextMenu
          open
          position={{ x: 10, y: 10 }}
          target={file}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          beforeChange={beforeChange}
          {...cb}
        />,
      );

      await chooseRow(action.row);
      await submit(action.submit);

      expect(beforeChange).toHaveBeenCalledTimes(1);
      expect(action.request).not.toHaveBeenCalled();
      expect(cb[action.callback]).not.toHaveBeenCalled();
      expect(onUpdate).not.toHaveBeenCalled();
      expect(screen.getByTestId(action.dialog)).toBeInTheDocument();

      await act(async () => {
        beforeChange.mock.calls[0][0]();
      });
      await settle();

      expect(action.request).toHaveBeenCalledTimes(1);
      expect(cb[action.callback]).toHaveBeenCalledTimes(1);
    },
  );
});
