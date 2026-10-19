/**
 * The Add menu with the bundled addons' own rows, loaded through the real
 * `AddonSlot` from the addon checkouts. Policy and the folder picker are the
 * stand-ins: the picker shows the folder it was handed, which is the
 * destination under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { AddButton, ADD_MENU_SLOT } from "@/components/AddButton";
import { ShortcutsProvider } from "../ShortcutsProvider";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const addonsLinked = ["knowledge", "media_import"].every((name) => {
  const dir = resolve(SRC, "addons", name);
  return existsSync(dir) && readdirSync(dir).length > 0;
});

const ENTRIES = [
  { id: "media-import-url", label: "Import from URL", priority: 20, addonName: "media_import" },
  { id: "knowledge-new-note", label: "New note", priority: 30, addonName: "knowledge" },
  { id: "knowledge-clip-web-page", label: "Clip web page", priority: 40, addonName: "knowledge" },
];

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: { [ADD_MENU_SLOT]: ENTRIES },
    loading: false,
    getSlotEntries: (id: string) => (id === ADD_MENU_SLOT ? ENTRIES : []),
    hasSlot: (id: string) => id === ADD_MENU_SLOT,
  }),
}));

const policy: Record<string, { enabled: boolean; isLoading: boolean }> = {};
/** Which rows have rendered: a hidden row draws nothing, but it still asks its policy. */
const policyAsked = new Set<string>();
vi.mock("@/hooks/usePolicy", () => ({
  usePolicy: (_drive: string, addon: string, feature: string) => {
    policyAsked.add(`${addon}.${feature}`);
    return policy[`${addon}.${feature}`] ?? { enabled: true, isLoading: false };
  },
}));

vi.mock("@/components/FolderPicker", () => ({
  FolderPicker: ({ value }: { value: string }) => <output aria-label="destination">{value}</output>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const NOTE_ROW = /^new (note|file)$/i;

const rows = () => screen.getAllByRole("menuitem").map((item) => item.textContent?.trim() ?? "");

function renderAdd(context: { path: string; surface: "home" | "library" }, withFolder = true) {
  render(
    <ShortcutsProvider>
      <AddButton
        onCreateFolder={withFolder ? vi.fn() : undefined}
        addonProps={{ drive: "d", fileIds: [], ...context }}
      />
      <p>outside</p>
    </ShortcutsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Add/ }));
}

beforeEach(() => {
  for (const key of Object.keys(policy)) delete policy[key];
  policyAsked.clear();
  localStorage.clear();
});
afterEach(cleanup);

describe.runIf(addonsLinked)("the Add menu with the bundled addon rows", () => {
  it("offers exactly one note row, the addon's, after the core rows", async () => {
    renderAdd({ path: "recipes", surface: "library" });
    await waitFor(() =>
      expect(rows()).toEqual([
        "Files",
        "Folder",
        "New Folder",
        "Import from URL",
        "New note",
        "Clip web page",
      ]),
    );
    expect(rows().filter((r) => NOTE_ROW.test(r))).toHaveLength(1);
  });

  it.each([
    ["knowledge.editor", "New note"],
    ["media_import.url_import", "Import from URL"],
  ])("hides the row once %s settles to off", async (key, label) => {
    policy[key] = { enabled: false, isLoading: false };
    renderAdd({ path: "", surface: "library" });
    const other = label === "New note" ? "Import from URL" : "New note";
    await screen.findByRole("menuitem", { name: other });
    await waitFor(() => expect(policyAsked.has(key)).toBe(true));
    expect(rows()).not.toContain(label);
    expect(rows().filter((r) => NOTE_ROW.test(r))).toHaveLength(label === "New note" ? 0 : 1);
  });

  describe.each([
    ["New note", "New note"],
    ["Import from URL", "Import from URL"],
    ["Clip web page", "Clip web page"],
  ])("the %s row", (label, dialogName) => {
    it("keeps its dialog open, and closes in two Escapes: the dialog, then the menu", async () => {
      renderAdd({ path: "recipes", surface: "library" });
      const row = await screen.findByRole("menuitem", { name: label });
      fireEvent.click(row);

      const dialog = await screen.findByRole("dialog", { name: dialogName });
      expect(row.isConnected).toBe(true);
      expect(screen.getByRole("menuitem", { name: label })).toBe(row);

      fireEvent.pointerDown(dialog, { button: 0 });
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: dialogName })).toBeInTheDocument();

      fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add/ })).toHaveFocus();
    });

    it.each([
      ["Library folder", { path: "recipes/soup", surface: "library" as const }, "recipes/soup"],
      ["Home", { path: "", surface: "home" as const }, ""],
    ])("starts its dialog at the %s", async (_, context, expected) => {
      localStorage.setItem(
        "media_import.last_folder_v1",
        JSON.stringify({ "d|youtube|video": "elsewhere", "d|youtube|channel": "elsewhere" }),
      );
      renderAdd(context, context.surface === "library");
      fireEvent.click(await screen.findByRole("menuitem", { name: label }));
      await screen.findByRole("dialog", { name: dialogName });
      expect(screen.getByLabelText("destination").textContent).toBe(expected);
    });
  });
});

it("runs, rather than skipping, where the addon checkouts are present", () => {
  expect(addonsLinked).toBe(true);
});
