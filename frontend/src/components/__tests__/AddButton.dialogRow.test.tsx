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

import { AddButton, ADD_MENU_SLOT } from "@/components/AddButton";
import { ShortcutsProvider } from "../ShortcutsProvider";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const addonLinked = (() => {
  const dir = resolve(SRC, "addons", "knowledge");
  return existsSync(dir) && readdirSync(dir).length > 0;
})();

const ENTRY = { id: "dialog-row", label: "Dialog row", priority: 10, addonName: "knowledge" };

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: { [ADD_MENU_SLOT]: [ENTRY] },
    loading: false,
    getSlotEntries: (id: string) => (id === ADD_MENU_SLOT ? [ENTRY] : []),
    hasSlot: (id: string) => id === ADD_MENU_SLOT,
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
        Import
      </button>
      {open &&
        createPortal(
          <div role="dialog">
            <input aria-label="url" />
          </div>,
          document.body,
        )}
    </>
  );
}

vi.mock("@/addons/knowledge/slots.ts", () => ({
  slotComponents: { "dialog-row": DialogRow },
}));

afterEach(() => {
  cleanup();
  mounts = 0;
});

describe("AddButton with a row that owns its dialog", () => {
  it.runIf(addonLinked)("keeps the row mounted and its dialog on screen once it reports the dialog", async () => {
    render(
      <ShortcutsProvider>
        <AddButton addonProps={{ drive: "d", path: "", surface: "library", fileIds: [] }} />
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    const row = await screen.findByRole("menuitem", { name: "Import" });
    expect(row.dataset.mount).toBe("1");

    fireEvent.click(row);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("menuitem", { name: "Import" }).dataset.mount).toBe("1");

    fireEvent.pointerDown(screen.getByLabelText("url"), { button: 0 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
