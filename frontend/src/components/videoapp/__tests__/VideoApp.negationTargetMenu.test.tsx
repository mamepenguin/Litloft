/**
 * SPEC-CORE-172 sending 9, I17: Video's Target menu offers a Smart Collection
 * whose query holds a `-` or `has:` token through the member path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { invalidateAddonsCache } from "@/lib/addons";
import type { SmartFolder } from "@/types/smartFolder";
import { installWireFetch, json, pagedListing } from "@/__tests__/helpers/wireFetch";
import { VideoApp } from "../VideoApp";

const DRIVE = "main";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ name: "main" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: "main",
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
}));

function smartFolder(id: string, name: string, query: string): SmartFolder {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

const FOLDERS = [
  smartFolder("sf-plain", "Cats", "cats"),
  smartFolder("sf-not-work", "Not work", "-path:Work"),
  smartFolder("sf-untagged", "Untagged", "-has:tag"),
  smartFolder("sf-modified", "Last year", "cats modified:<2025"),
];

beforeEach(() => {
  localStorage.clear();
  invalidateAddonsCache();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
  installWireFetch((call) => {
    const path = call.url.pathname;
    if (path === `/api/drives/${DRIVE}/smart-folders`) return json(FOLDERS);
    if (path === `/api/drives/${DRIVE}/collections`) return json([]);
    if (path === `/api/drives/${DRIVE}/home-shortcuts`) return json([]);
    if (path === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (path === `/api/drives/${DRIVE}/files`) return pagedListing([], call);
    if (path === `/api/drives/${DRIVE}/files/query`) {
      return json({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    }
    if (path === `/api/drives/${DRIVE}/shelves` || path === `/api/drives/${DRIVE}/shelves/query`) {
      return json({ by: "all", base: "", total_shelves: 0, shelves: [] });
    }
    if (path.includes("/tag-counts")) return json([]);
    return json([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-172 sending 9 Video's Target menu counts the member path", () => {
  it("offers the negated and has: folders and keeps a modified: one disabled", async () => {
    render(<VideoApp drive={DRIVE} />);

    fireEvent.click(await screen.findByRole("button", { name: /Target/ }));

    expect(await screen.findByRole("menuitemradio", { name: "Not work" })).not.toBeDisabled();
    expect(screen.getByRole("menuitemradio", { name: "Untagged" })).not.toBeDisabled();
    expect(screen.getByRole("menuitemradio", { name: "Cats" })).not.toBeDisabled();
    expect(screen.getByRole("menuitemradio", { name: "Last year" })).toBeDisabled();
  });
});
