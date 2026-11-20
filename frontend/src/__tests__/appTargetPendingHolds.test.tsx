/**
 * SPEC-CORE-154 I4: a pending `?target=` holds even the member evaluation of
 * the Target it names, so no request carries that Target before it is saved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

import { installWireFetch, json, pagedListing, type WireCall } from "@/__tests__/helpers/wireFetch";

const DRIVE = "main";
const TARGET_KEY = `litloft.videoApp.target.${DRIVE}`;

const nav = vi.hoisted(() => ({
  search: new URLSearchParams(),
  pathname: "/drive/main/apps/video",
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
  useParams: () => ({ name: "main" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn() }),
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

const VideoRoute = (await import("@/app/drive/[name]/apps/video/page")).default;

function smartFolder(id: string, name: string, query: string) {
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

const MEMBER = smartFolder("sf-text", "Holiday", "holiday");

const path = (call: WireCall) => call.url.pathname;
const isListing = (call: WireCall) =>
  path(call) === `/api/drives/${DRIVE}/files` ||
  path(call) === `/api/drives/${DRIVE}/files/query`;
const carriesTarget = (call: WireCall) => isListing(call) || path(call).includes("/shelves");

let wire: { calls: WireCall[] };
const released: (() => void)[] = [];
let savedWhenEvaluationAsked: string | null = null;

function held<T>(answer: () => T): () => Promise<T> {
  return () =>
    new Promise<T>((resolve) => {
      released.push(() => resolve(answer()));
    });
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  localStorage.clear();
  nav.search = new URLSearchParams("target=sf-text");
  nav.replace.mockReset();
  nav.replace.mockImplementation((href: string) => {
    nav.search = new URL(href, `http://localhost${nav.pathname}`).searchParams;
  });
  nav.push.mockReset();
  released.length = 0;
  savedWhenEvaluationAsked = null;
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
  wire = installWireFetch((call) => {
    if (path(call) === `/api/drives/${DRIVE}/smart-folders`) return held(() => json([MEMBER]))();
    if (path(call) === `/api/drives/${DRIVE}/collections`) return json([]);
    if (path(call) === "/api/addons/status") return json({ addons: {}, slots: {} });
    if (path(call) === `/api/drives/${DRIVE}/home-shortcuts`) return json([]);
    if (path(call) === `/api/drives/${DRIVE}/files/query`) {
      savedWhenEvaluationAsked ??= localStorage.getItem(TARGET_KEY);
      return pagedListing([], call);
    }
    if (path(call) === `/api/drives/${DRIVE}/files`) return pagedListing([], call);
    if (path(call).includes("/shelves")) return json({ by: "all", base: "", total_shelves: 0, shelves: [] });
    if (path(call).includes("/tag-counts")) return json([]);
    return json([]);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-154 I4 a pending member Target", () => {
  it("holds the member evaluation until the Target is saved, then asks with it", async () => {
    render(<VideoRoute />);

    await waitFor(() => expect(wire.calls.some((c) => path(c).endsWith("/smart-folders"))).toBe(true));
    await settle();
    expect(wire.calls.filter(carriesTarget)).toEqual([]);
    expect(localStorage.getItem(TARGET_KEY)).toBeNull();

    await act(async () => {
      for (const release of released.splice(0)) release();
    });
    await waitFor(() => expect(wire.calls.some((c) => path(c).endsWith("/files/query"))).toBe(true));
    await settle();

    expect(localStorage.getItem(TARGET_KEY)).toBe("sf-text");
    expect(savedWhenEvaluationAsked).toBe("sf-text");
    for (const call of wire.calls.filter(carriesTarget)) {
      expect(call.url.href).not.toContain("sf-text");
      expect(JSON.stringify(call.body ?? "")).not.toContain("sf-text");
    }
  });
});
