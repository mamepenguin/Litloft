/**
 * The press has to come from inside the field: `ShortcutsProvider` treats a
 * focused `INPUT` as "editing", so a press at `document.body` passes even
 * when `editingOnly: false` is missing.
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

describe("an IME's Escape", () => {
  it("cancels the conversion without throwing away the dialog", () => {
    // The keystroke that ends a composition reaches the page looking like a
    // bare press: `compositionend` fires first, then `keydown` with
    // `isComposing` already false.
    const onCancel = vi.fn();
    withStack(
      <RenameDialog
        open
        currentName="notes.md"
        onRename={vi.fn()}
        onCancel={onCancel}
      />,
    );
    act(() => vi.advanceTimersByTime(10));

    const field = document.querySelector<HTMLElement>("input")!;
    act(() => field.focus());

    fireEvent.keyDown(field, { key: "Escape", isComposing: true });
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
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

  it("gives one press to the picker and the next to the dialog", () => {
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

    const trigger = screen.getByRole("button", { name: /Save to:/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    expect(escapeFromTheField()).toBe(true);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(onCancel).not.toHaveBeenCalled();

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
