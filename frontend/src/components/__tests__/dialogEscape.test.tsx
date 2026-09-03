/**
 * Escape closes a dialog whose own field has focus.
 *
 * Every dialog here registered `{ key: "escape" }` on the shortcut
 * stack and looked correct at the call site. `ShortcutsProvider`
 * classifies a focused `INPUT` as "editing", and a shortcut that
 * leaves `editingOnly` unset fires *only when nothing is being
 * edited* — which, in a dialog that focuses its own field on open, is
 * never. So Escape was bound and dead, with nothing in the source
 * saying so.
 *
 * The press therefore has to come from inside the field. Firing it at
 * `document.body` passes with the flag missing and proves nothing,
 * which is why the older tests did not catch this.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ShortcutsProvider } from "../ShortcutsProvider";
import { RenameDialog } from "../RenameDialog";
import { NameInputDialog } from "../NameInputDialog";
import { BatchRenameDialog } from "../BatchRenameDialog";
import { FileSaveDialog } from "../FileSaveDialog";

vi.mock("@/lib/api", () => ({
  getFolders: vi.fn(async () => []),
  getFolderTree: vi.fn(async () => []),
}));

function withStack(ui: React.ReactElement) {
  return render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
}

/**
 * Focus the dialog's first field and press Escape there. Returns false
 * when the dialog has no field, so a caller cannot silently degrade
 * into the weaker `document.body` press.
 */
function escapeFromTheField(): boolean {
  const field = document.querySelector<HTMLElement>("input, textarea");
  if (!field) return false;
  act(() => field.focus());
  expect(document.activeElement).toBe(field);
  fireEvent.keyDown(field, { key: "Escape" });
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("RenameDialog", () => {
  it("cancels on Escape from the name field", () => {
    const onCancel = vi.fn();
    withStack(
      <RenameDialog
        open
        currentName="notes.md"
        onRename={vi.fn()}
        onCancel={onCancel}
      />,
    );
    act(() => vi.advanceTimersByTime(10)); // the focus is queued on a timeout
    expect(escapeFromTheField()).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("NameInputDialog", () => {
  it("cancels on Escape from the name field", () => {
    const onCancel = vi.fn();
    withStack(
      <NameInputDialog
        open
        title="New folder"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    act(() => vi.advanceTimersByTime(10));
    expect(escapeFromTheField()).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("BatchRenameDialog", () => {
  it("cancels on Escape from a pattern field", () => {
    const onCancel = vi.fn();
    withStack(
      <BatchRenameDialog
        open
        files={[{ id: "f1", filename: "photo_a.jpg" }]}
        onComplete={vi.fn()}
        onCancel={onCancel}
      />,
    );
    expect(escapeFromTheField()).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("FileSaveDialog", () => {
  it("cancels on Escape from the filename field", () => {
    const onCancel = vi.fn();
    withStack(
      <FileSaveDialog
        open
        title="Save note"
        drive="notes"
        defaultFilename="draft.md"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    act(() => vi.advanceTimersByTime(10));
    expect(escapeFromTheField()).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not answer Escape while it is closed", () => {
    const onCancel = vi.fn();
    withStack(
      <FileSaveDialog
        open={false}
        title="Save note"
        drive="notes"
        defaultFilename="draft.md"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
