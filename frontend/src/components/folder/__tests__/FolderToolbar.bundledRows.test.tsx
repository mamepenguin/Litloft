/**
 * The folder toolbar's two menus with the bundled addons' own rows, loaded
 * through the real `AddonSlot` and each addon's real `slots.ts`. Slot
 * declarations come from the addon manifests on disk; media_import declares
 * its slots in Python, so its one entry is written out here.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { FolderToolbar } from "../FolderToolbar";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const REPO = resolve(SRC, "../..");
const BUNDLED = ["intelligence", "knowledge", "media_import"];
const addonsLinked = BUNDLED.every((name) => {
  const dir = resolve(SRC, "addons", name);
  return existsSync(dir) && readdirSync(dir).length > 0;
});

type Entry = { id: string; label: string; priority: number; addonName: string };

const { slots } = vi.hoisted(() => ({ slots: {} as Record<string, Entry[]> }));

function manifestSlots(name: string): Record<string, Omit<Entry, "addonName">[]> {
  const path = resolve(REPO, "addons", name, "manifest.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).slots ?? {} : {};
}

for (const name of ["intelligence", "knowledge"]) {
  for (const [slot, entries] of Object.entries(manifestSlots(name))) {
    slots[slot] = [...(slots[slot] ?? []), ...entries.map((e) => ({ ...e, addonName: name }))];
  }
}
slots["folder-actions-menu"] = [
  ...(slots["folder-actions-menu"] ?? []),
  { id: "media-import-url", label: "Import from URL", priority: 20, addonName: "media_import" },
];

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots,
    loading: false,
    getSlotEntries: (id: string) => slots[id] ?? [],
    hasSlot: (id: string) => (slots[id] ?? []).length > 0,
  }),
}));

vi.mock("@/hooks/usePolicy", () => ({
  usePolicy: () => ({ enabled: true, isLoading: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const AI_ROWS = [
  "Create AI tag candidates…",
  "Create AI summaries…",
  "Create image descriptions…",
];
const ADD_ROWS = [
  "Files",
  "Folder",
  "New Folder",
  "Import from URL",
  "New note",
  "Clip web page",
];

const props = {
  isSpecialView: false,
  isWriteDestination: true,
  tagFilter: null,
  hasPlayableFiles: false,
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 2,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: ["file-1", "file-2"],
  drive: "d",
  folderPath: "recipes",
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
  onScan: vi.fn(),
  onPlayAll: vi.fn(),
  onSetCreatingFolder: vi.fn(),
  onSetNewFolderName: vi.fn(),
  onSetFolderError: vi.fn(),
  onCreateFolder: vi.fn(),
};

const rows = () => screen.getAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");

function renderToolbar(overrides: Partial<typeof props> = {}) {
  render(
    <ShortcutsProvider>
      <FolderToolbar {...props} {...overrides} />
    </ShortcutsProvider>,
  );
}

afterEach(cleanup);

describe.runIf(addonsLinked)("the folder toolbar's menus with the bundled addon rows", () => {
  it("puts the AI actions in the … menu, after its own rows", async () => {
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await waitFor(() => expect(rows().slice(-3)).toEqual(AI_ROWS));
    for (const row of ADD_ROWS) expect(rows()).not.toContain(row);
  });

  it("keeps Add to the rows that put something into the folder", async () => {
    renderToolbar();
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    await waitFor(() => expect(rows()).toEqual(ADD_ROWS));
  });

  it("offers no AI actions where the listing is not a place", async () => {
    renderToolbar({ isWriteDestination: false, isSearch: true });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem", { name: "Selection mode" });
    for (const row of AI_ROWS) expect(rows()).not.toContain(row);
  });
});
