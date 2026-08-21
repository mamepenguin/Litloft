import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { FileSaveDialog } from "../FileSaveDialog";

// FolderPicker fetches on mount; the dialog under test only cares about
// the filename field, so both calls resolve to empty listings.
vi.mock("@/lib/api", () => ({
  getFolders: vi.fn().mockResolvedValue([]),
  getFolderTree: vi.fn().mockResolvedValue([]),
}));

function renderDialog(defaultFilename: string) {
  const utils = render(
    <FileSaveDialog
      open
      title="Save"
      drive="media"
      defaultFilename={defaultFilename}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  const input = utils.container.querySelector<HTMLInputElement>(
    "#file-save-dialog-filename",
  );
  if (!input) throw new Error("filename input not rendered");
  return { ...utils, input };
}

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
