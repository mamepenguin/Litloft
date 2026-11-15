/**
 * SPEC-CORE-108 — the Smart Collection dialogs opened from the sidebar are
 * not contained by its transformed `aside`.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { SmartFolder } from "@/types/smartFolder";
import { Sidebar } from "../../Sidebar";

const SMART_FOLDER: SmartFolder = {
  id: "sf1",
  drive: "main",
  name: "Recent videos",
  query: "video",
  file_type: "video",
  sort_by: null,
  sort_order: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: null,
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("../../SidebarProvider", () => ({
  useSidebar: () => ({
    isOpen: true,
    isOverlay: false,
    close: vi.fn(),
    refreshKey: 0,
  }),
}));

vi.mock("../../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
    catalogueDrive: null,
  }),
}));

vi.mock("../../AddonSlot", () => ({ AddonSlot: () => null }));

vi.mock("../../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("@/components/sidebar/useSidebarData", () => ({
  useSidebarData: () => ({
    drives: [],
    tags: null,
    pins: [],
    collectionList: [],
    setCollectionList: vi.fn(),
    authStatus: null,
    driveSummary: null,
  }),
}));

vi.mock("@/hooks/useInboxCount", () => ({ useInboxCount: () => 0 }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({
    smartFolders: [SMART_FOLDER],
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));

function dialogRootFor(headingName: string): HTMLElement {
  const root = screen
    .getByRole("heading", { name: headingName })
    .closest(".fixed.inset-0");
  if (!(root instanceof HTMLElement)) {
    throw new Error(`No dialog root for ${headingName}`);
  }
  return root;
}

describe("SPEC-CORE-108 Smart Collection dialogs in the sidebar", () => {
  it("SPEC-CORE-108 draws the rename dialog and the delete confirmation outside the sidebar aside", async () => {
    render(<Sidebar />);
    const aside = document.querySelector("aside");
    expect(aside).not.toBeNull();

    fireEvent.contextMenu(screen.getByText("Recent videos"));
    fireEvent.click(screen.getByText("Rename"));
    await screen.findByRole("heading", { name: "Rename Smart Collection" });
    expect(aside!.contains(dialogRootFor("Rename Smart Collection"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.contextMenu(screen.getByText("Recent videos"));
    fireEvent.click(screen.getByText("Delete"));
    await screen.findByRole("heading", { name: "Delete Smart Collection" });
    expect(aside!.contains(dialogRootFor("Delete Smart Collection"))).toBe(false);
  });
});
