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

describe("an IME's Escape", () => {
  it("cancels the conversion without throwing away the dialog", () => {
    // The keystroke that ends a composition reaches the page looking
    // exactly like a bare press: `compositionend` fires first, then
    // `keydown` with `isComposing` already false. Measured in this repo
    // at `lib/ime.ts`.
    //
    // This only became reachable with `editingOnly: false`: before it,
    // Escape in these dialogs never fired in a focused field at all, so
    // cancelling a candidate list was safe by accident. Now it has to
    // be safe on purpose — a Japanese-first app where the dialog's one
    // job is typing a name.
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

    // Mid-conversion.
    fireEvent.keyDown(field, { key: "Escape", isComposing: true });
    expect(onCancel).not.toHaveBeenCalled();

    // The keystroke that ended it, indistinguishable on its own.
    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();

    // And a real one, after the measured grace window.
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
    // The reason the whole change exists. Two listeners answered one
    // press: Escape closed the folder picker *and* threw away the
    // dialog holding it. On the stack the picker pushes later, so it
    // answers first and alone; the dialog answers the press after.
    //
    // Every other test here renders one context. This is the only one
    // that asserts resolution *order*, which is the subject.
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
