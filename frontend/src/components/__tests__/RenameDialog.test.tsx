import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { RenameDialog } from "../RenameDialog";
import { ShortcutsProvider } from "../ShortcutsProvider";

function renderDialog(currentName: string, open = true) {
  const onRename = vi.fn();
  const onCancel = vi.fn();
  const ui: ReactNode = (
    <RenameDialog
      open={open}
      currentName={currentName}
      onRename={onRename}
      onCancel={onCancel}
    />
  );
  const utils = render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
  return { ...utils, onRename, onCancel };
}

/**
 * The dialog focuses and selects inside a `setTimeout(0)`, so every
 * assertion about the selection has to wait for that turn.
 */
async function focusedInput(): Promise<HTMLInputElement> {
  const input = screen.getByRole("textbox") as HTMLInputElement;
  await waitFor(() => expect(document.activeElement).toBe(input));
  return input;
}

describe("RenameDialog", () => {
  it("pre-selects the stem so the first keystroke cannot destroy the extension", async () => {
    renderDialog("video.mp4");
    const input = await focusedInput();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("video".length);
  });

  it("selects the whole name when there is no extension", async () => {
    renderDialog("My Folder");
    const input = await focusedInput();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("My Folder".length);
  });

  it("treats only the last dot as the extension boundary", async () => {
    renderDialog("archive.tar.gz");
    const input = await focusedInput();
    expect(input.selectionEnd).toBe("archive.tar".length);
  });

  it("re-selects the stem when reopened with a different name", async () => {
    const { rerender } = renderDialog("first.mp4");
    await focusedInput();

    rerender(
      <ShortcutsProvider>
        <RenameDialog
          open
          currentName="second-file.png"
          onRename={vi.fn()}
          onCancel={vi.fn()}
        />
      </ShortcutsProvider>,
    );

    await waitFor(() => {
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("second-file.png");
      expect(input.selectionEnd).toBe("second-file".length);
    });
  });

  // The confirm button is a `<Button type="submit">` inside a `<form>` after
  // the Phase 3 sweep. Nothing was checking that: turning it back into a
  // plain `type="button"` left every test green, and the user-visible failure
  // is "type a new name, press Change, nothing happens".
  describe("submitting the form", () => {
    it("renames when the confirm button is pressed", async () => {
      const { onRename } = renderDialog("old.md");
      const input = await focusedInput();
      fireEvent.change(input, { target: { value: "new.md" } });
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
      await waitFor(() => expect(onRename).toHaveBeenCalledWith("new.md"));
    });

    it("keeps the confirm button a submit control", async () => {
      renderDialog("old.md");
      expect(
        screen.getByRole("button", { name: "Change" }).getAttribute("type"),
      ).toBe("submit");
    });

    it("stays disabled until the name actually changes", async () => {
      renderDialog("old.md");
      const confirm = screen.getByRole("button", { name: "Change" });
      expect(confirm).toBeDisabled();
      fireEvent.change(await focusedInput(), { target: { value: "new.md" } });
      expect(confirm).not.toBeDisabled();
    });
  });
});
