import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SelectionBar } from "../SelectionBar";

vi.mock("@/lib/api", () => ({
  batchDelete: vi.fn().mockResolvedValue({ deleted: 1, errors: [] }),
  batchMove: vi.fn().mockResolvedValue({ moved: 1, errors: [] }),
  batchTag: vi.fn().mockResolvedValue({ updated: 1, errors: [] }),
  batchRestore: vi.fn().mockResolvedValue({ restored: 1, errors: [] }),
  batchPurge: vi.fn().mockResolvedValue({ purged: 1, errors: [] }),
  batchGetFiles: vi.fn().mockResolvedValue([{ id: "f1", filename: "a.jpg" }]),
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button onClick={onConfirm}>Confirm</button> : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open, onMove }: { open: boolean; onMove: (path: string) => void }) =>
    open ? <button onClick={() => onMove("elsewhere")}>Move here</button> : null,
}));

vi.mock("../BatchRenameDialog", () => ({
  BatchRenameDialog: ({ open, onComplete }: { open: boolean; onComplete: () => void }) =>
    open ? <button onClick={onComplete}>Finish rename</button> : null,
}));

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({ copy: vi.fn(), cut: vi.fn() }),
}));

vi.mock("../CollectionPicker", () => ({ CollectionPicker: () => null }));

const props = {
  count: 1,
  selectedIds: new Set(["f1"]),
  totalCount: 10,
  drive: "photos",
  currentPath: "",
  onSelectAll: vi.fn(),
  onClear: vi.fn(),
  onComplete: vi.fn(),
};

const run: Record<string, () => void> = {
  tag: () => {
    fireEvent.click(screen.getByLabelText("Tagging"));
    fireEvent.change(screen.getByPlaceholderText("tag1, tag2..."), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  },
  rename: () => fireEvent.click(screen.getByLabelText("Rename")),
  move: () => fireEvent.click(screen.getByLabelText("Move")),
  trash: () => fireEvent.click(screen.getByLabelText("Move to Trash")),
  purge: () => fireEvent.click(screen.getByLabelText("Permanently Delete")),
};

const finish: Record<string, (() => Promise<void>) | undefined> = {
  rename: async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Finish rename" }));
  },
  move: async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Move here" }));
  },
  trash: async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
  },
  purge: async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
  },
};

describe("SPEC-CORE-035 I8 / I13 which bulk actions report the files as removed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["tag", false, false],
    ["rename", false, false],
    ["move", false, false],
    ["trash", false, true],
    ["purge", true, true],
  ])("%s reports removed=%s", async (action, isTrashView, removed) => {
    render(<SelectionBar {...props} isTrashView={isTrashView} />);
    run[action]();
    await finish[action]?.();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(props.onComplete.mock.calls[0][0] === true).toBe(removed);
  });
});
