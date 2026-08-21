import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
});
