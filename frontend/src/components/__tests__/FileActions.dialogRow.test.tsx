/**
 * `AddonSlot` is real here, and the row keeps its dialog in its own state: a
 * row that is unmounted and mounted again loses the dialog, which a slot stand-in
 * holding state outside React cannot show.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { useState } from "react";
import { createPortal } from "react-dom";

import { FileActions } from "@/components/FileActions";
import { ShortcutsProvider } from "../ShortcutsProvider";
import type { FileItem } from "@/types";

const SLOT = "file-actions-menu";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const addonLinked = (() => {
  const dir = resolve(SRC, "addons", "knowledge");
  return existsSync(dir) && readdirSync(dir).length > 0;
})();

const ENTRY = { id: "dialog-row", label: "Dialog row", priority: 10, addonName: "knowledge" };

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: { [SLOT]: [ENTRY] },
    loading: false,
    getSlotEntries: (id: string) => (id === SLOT ? [ENTRY] : []),
    hasSlot: (id: string) => id === SLOT,
  }),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

let mounts = 0;

function DialogRow({ onDialogOpenChange }: { onDialogOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [mountId] = useState(() => ++mounts);
  return (
    <>
      <button
        role="menuitem"
        data-mount={mountId}
        onClick={() => {
          setOpen(true);
          onDialogOpenChange(true);
        }}
      >
        Create note
      </button>
      {open &&
        createPortal(
          <div role="dialog">
            <input aria-label="note title" />
          </div>,
          document.body,
        )}
    </>
  );
}

vi.mock("@/addons/knowledge/slots.ts", () => ({
  slotComponents: { "dialog-row": DialogRow },
}));

const file = {
  id: "file-1",
  filename: "clip.mp4",
  drive: "main",
  folder_path: "videos",
  file_type: "video",
  mime_type: "video/mp4",
  deleted_at: null,
  missing_since: null,
  tags: [],
} as unknown as FileItem;

afterEach(() => {
  cleanup();
  mounts = 0;
});

describe("FileActions with a row that owns its dialog", () => {
  it.runIf(addonLinked)("keeps the row mounted and its dialog on screen once it reports the dialog", async () => {
    render(
      <ShortcutsProvider>
        <FileActions file={file} addonProps={{ fileId: file.id, drive: file.drive }} />
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "File actions" }));
    const row = await screen.findByRole("menuitem", { name: "Create note" });
    expect(row.dataset.mount).toBe("1");

    fireEvent.click(row);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("menuitem", { name: "Create note" }).dataset.mount).toBe("1");

    fireEvent.pointerDown(screen.getByLabelText("note title"), { button: 0 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.runIf(addonLinked)("closes on an outside press again after the menu was closed by its trigger with a dialog up", async () => {
    render(
      <ShortcutsProvider>
        <FileActions file={file} addonProps={{ fileId: file.id, drive: file.drive }} />
      </ShortcutsProvider>,
    );
    const trigger = screen.getByRole("button", { name: "File actions" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Create note" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    await screen.findByRole("menuitem", { name: "Create note" });
    fireEvent.pointerDown(document.body, { button: 0 });
    fireEvent.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it.runIf(addonLinked)("closes on an outside press again after a core item replaced the menu while a dialog was up", async () => {
    render(
      <ShortcutsProvider>
        <FileActions file={file} addonProps={{ fileId: file.id, drive: file.drive }} />
      </ShortcutsProvider>,
    );
    const trigger = screen.getByRole("button", { name: "File actions" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Create note" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Move to Trash"));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    fireEvent.click(trigger);
    await screen.findByRole("menuitem", { name: "Create note" });
    fireEvent.pointerDown(document.body, { button: 0 });
    fireEvent.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs, rather than skipping, where the addon checkout is present", () => {
    expect(addonLinked).toBe(true);
  });
});
