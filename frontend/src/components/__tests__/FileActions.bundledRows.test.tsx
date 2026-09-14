/**
 * The file `[...]` menu with knowledge's own Create note row, loaded through
 * the real `AddonSlot` from the addon checkout.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { FileActions } from "@/components/FileActions";
import { ShortcutsProvider } from "../ShortcutsProvider";
import type { FileItem } from "@/types";

const SLOT = "file-actions-menu";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const addonLinked = (() => {
  const dir = resolve(SRC, "addons", "knowledge");
  return existsSync(dir) && readdirSync(dir).length > 0;
})();

const ENTRIES = [
  { id: "knowledge-create-note", label: "Create note", priority: 20, addonName: "knowledge" },
];

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: { [SLOT]: ENTRIES },
    loading: false,
    getSlotEntries: (id: string) => (id === SLOT ? ENTRIES : []),
    hasSlot: (id: string) => id === SLOT,
  }),
}));

vi.mock("@/hooks/usePolicy", () => ({
  usePolicy: () => ({ enabled: true, isLoading: false }),
}));

vi.mock("@/components/FolderPicker", () => ({
  FolderPicker: ({ value }: { value: string }) => <output aria-label="destination">{value}</output>,
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const file = {
  id: "file-1",
  filename: "holiday.mkv",
  drive: "main",
  folder_path: "videos",
  file_type: "video",
  mime_type: "video/x-matroska",
  deleted_at: null,
  missing_since: null,
  tags: [],
} as unknown as FileItem;

afterEach(cleanup);

describe.runIf(addonLinked)("the file menu with knowledge's Create note row", () => {
  it("keeps the Create note dialog on screen and editable after the row opens it", async () => {
    render(
      <ShortcutsProvider>
        <FileActions
          file={file}
          addonProps={{ fileId: file.id, drive: file.drive, filename: file.filename }}
        />
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "File actions" }));
    const row = await screen.findByRole("menuitem", { name: "Create note" });

    fireEvent.click(row);

    const dialog = await screen.findByRole("dialog", { name: "Create note" });
    expect(screen.getByRole("menuitem", { name: "Create note" })).toBe(row);

    const name = screen.getByLabelText("Filename") as HTMLInputElement;
    fireEvent.pointerDown(name, { button: 0 });
    fireEvent.change(name, { target: { value: "trip.md" } });

    expect(screen.getByRole("dialog", { name: "Create note" })).toBe(dialog);
    expect((screen.getByLabelText("Filename") as HTMLInputElement).value).toBe("trip.md");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

it("runs, rather than skipping, where the addon checkout is present", () => {
  expect(addonLinked).toBe(true);
});
