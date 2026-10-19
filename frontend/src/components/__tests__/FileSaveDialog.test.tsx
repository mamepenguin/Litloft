import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

import { COMPOSITION_GRACE_MS } from "@/lib/ime";

import { FileSaveDialog } from "../FileSaveDialog";

// FolderPicker fetches on mount; the dialog under test only cares about
// the filename field, so both calls resolve to empty listings.
vi.mock("@/lib/api", () => ({
  getFolders: vi.fn().mockResolvedValue([]),
  getFolderTree: vi.fn().mockResolvedValue([]),
}));

function renderDialog(defaultFilename: string) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <FileSaveDialog
      open
      title="Save"
      drive="media"
      defaultFilename={defaultFilename}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  const input = utils.container.querySelector<HTMLInputElement>(
    "#file-save-dialog-filename",
  );
  if (!input) throw new Error("filename input not rendered");
  return { ...utils, input, onConfirm, onCancel };
}

describe("FileSaveDialog IME composition", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function confirmConversion(input: HTMLInputElement, text: string) {
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: text } });
    fireEvent.compositionEnd(input, { data: text });
  }

  it("does not save on the Enter that confirms a conversion", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { input, onConfirm } = renderDialog("untitled.md");
    confirmConversion(input, "日本語.md");
    now.mockReturnValue(1_000_000 + COMPOSITION_GRACE_MS - 1);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(input.value).toBe("日本語.md");
  });

  it("does not save on an Enter the IME still owns", () => {
    const { input, onConfirm } = renderDialog("untitled.md");
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("saves once on an Enter pressed after the grace window", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { input, onConfirm } = renderDialog("untitled.md");
    confirmConversion(input, "日本語.md");
    now.mockReturnValue(1_000_000 + COMPOSITION_GRACE_MS);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({ folder: "", filename: "日本語.md" });
  });
});

describe("FileSaveDialog filename selection", () => {
  it("pre-selects the stem so the extension survives the first keystroke", async () => {
    const { input } = renderDialog("untitled.md");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("untitled".length);
  });

  it("treats only the last dot as the extension boundary", async () => {
    const { input } = renderDialog("archive.tar.gz");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.selectionEnd).toBe("archive.tar".length);
  });

  it("selects the whole name when there is no extension", async () => {
    const { input } = renderDialog("untitled");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("untitled".length);
  });
});
