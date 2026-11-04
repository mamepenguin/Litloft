/**
 * SPEC-CORE-032 I12 — the count in the sidebar belongs to the drive the
 * viewer is standing in, not to the drives they could switch to.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import type { WebSocketEvent } from "@/types";
import { Sidebar } from "../../Sidebar";

const DRIVE = "main";
const OTHER = "other";
const BASE = `/drive/${DRIVE}`;

let pathname = BASE;
let search = new URLSearchParams();
let currentDrive: string | null = DRIVE;
let count = 0;
let lastEvent: WebSocketEvent | null = null;
let eventSeq = 0;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
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
  useCurrentDrive: () => currentDrive,
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({ smartFolders: [], update: vi.fn(), remove: vi.fn() }),
}));

const fetchSpy = vi.fn();

function answer(url: string): unknown {
  if (url.includes("/inbox/count")) return { open: count };
  if (url.endsWith("/api/auth/status")) {
    return { unlocked_groups: [], has_protected_drives: false, is_admin: false };
  }
  if (url.includes("/summary")) {
    return { name: DRIVE, trash_count: 0, missing_count: 0 };
  }
  if (url.includes("/tags")) return [];
  return [];
}

function installFetch() {
  fetchSpy.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    return Promise.resolve({
      ok: true,
      json: async () => answer(url),
    } as Response);
  });
  vi.stubGlobal("fetch", fetchSpy);
}

function inboxRow(): HTMLAnchorElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLAnchorElement>("nav a")).find(
      (a) => a.getAttribute("href") === `${BASE}?view=inbox`,
    ) ?? null
  );
}

function rowText(row: Element | null): string {
  return (row?.textContent ?? "").replace(/\s+/g, "");
}

const inboxCountCalls = () =>
  fetchSpy.mock.calls.filter(([url]) => String(url).includes("/inbox/count"));

function renderSidebar() {
  return render(
    <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
      <Sidebar />
    </WebSocketContext.Provider>,
  );
}

function emit(event: string, data: Record<string, unknown>) {
  eventSeq += 1;
  lastEvent = { event, data, seq: eventSeq } as WebSocketEvent;
}

beforeEach(() => {
  pathname = BASE;
  search = new URLSearchParams();
  currentDrive = DRIVE;
  count = 0;
  lastEvent = null;
  eventSeq = 0;
  fetchSpy.mockReset();
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-032 I12 the inbox row in the sidebar", () => {
  it("SPEC-CORE-032 I12 sits directly under Home and above Library", () => {
    renderSidebar();
    const hrefs = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("nav a"),
    ).map((a) => a.getAttribute("href"));
    const home = hrefs.indexOf(`${BASE}?view=home`);
    const inbox = hrefs.indexOf(`${BASE}?view=inbox`);
    const library = hrefs.indexOf(BASE);
    expect(inbox).toBeGreaterThanOrEqual(0);
    expect(home).toBeGreaterThanOrEqual(0);
    expect(library).toBeGreaterThanOrEqual(0);
    expect(inbox).toBe(home + 1);
    expect(inbox).toBeLessThan(library);
  });

  it("SPEC-CORE-032 I12 is named Inbox and drawn with the inbox mark", () => {
    renderSidebar();
    const row = inboxRow();
    expect(rowText(row)).toContain("Inbox");
    expect(row?.querySelector("svg.lucide-inbox")).not.toBeNull();
  });

  it.each([
    [0, "Inbox"],
    [1, "Inbox1"],
    [42, "Inbox42"],
    [99, "Inbox99"],
    [100, "Inbox99+"],
    [2140, "Inbox99+"],
  ])("SPEC-CORE-032 I12 shows %i as %s", async (open, text) => {
    count = open;
    renderSidebar();
    await act(async () => {});
    expect(rowText(inboxRow())).toBe(text);
  });

  it("SPEC-CORE-032 I12 asks the current drive for its count", async () => {
    count = 3;
    renderSidebar();
    await waitFor(() => expect(rowText(inboxRow())).toBe("Inbox3"));
    const urls = inboxCountCalls().map(([url]) => String(url));
    expect(urls.every((url) => url.includes(encodeURIComponent(DRIVE)))).toBe(
      true,
    );
    expect(urls.some((url) => url.includes(encodeURIComponent(OTHER)))).toBe(
      false,
    );
  });

  it("SPEC-CORE-032 I12 asks the new drive when the drive changes", async () => {
    const view = renderSidebar();
    await waitFor(() => expect(inboxCountCalls().length).toBeGreaterThan(0));
    const before = inboxCountCalls().length;

    currentDrive = OTHER;
    count = 7;
    view.rerender(
      <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
        <Sidebar />
      </WebSocketContext.Provider>,
    );

    await waitFor(() =>
      expect(
        inboxCountCalls()
          .slice(before)
          .some(([url]) => String(url).includes(encodeURIComponent(OTHER))),
      ).toBe(true),
    );
  });

  it.each(["inbox.updated", "drive.structure_changed"])(
    "SPEC-CORE-032 I12 asks again on %s for the current drive",
    async (event) => {
      count = 1;
      const view = renderSidebar();
      await waitFor(() => expect(rowText(inboxRow())).toBe("Inbox1"));
      const before = inboxCountCalls().length;

      count = 2;
      emit(event, { drive: DRIVE });
      view.rerender(
        <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
          <Sidebar />
        </WebSocketContext.Provider>,
      );

      await waitFor(() => expect(rowText(inboxRow())).toBe("Inbox2"));
      expect(inboxCountCalls().length).toBeGreaterThan(before);
    },
  );

  it("SPEC-CORE-032 I12 ignores another drive's event", async () => {
    count = 1;
    const view = renderSidebar();
    await waitFor(() => expect(rowText(inboxRow())).toBe("Inbox1"));
    const before = inboxCountCalls().length;

    count = 9;
    emit("inbox.updated", { drive: OTHER });
    view.rerender(
      <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
        <Sidebar />
      </WebSocketContext.Provider>,
    );
    await act(async () => {});
    expect(inboxCountCalls().length).toBe(before);
    expect(rowText(inboxRow())).toBe("Inbox1");
  });

  it("SPEC-CORE-032 I12 lights only the inbox row on ?view=inbox", () => {
    search = new URLSearchParams({ view: "inbox" });
    renderSidebar();
    const lit = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("nav a"),
    )
      .filter((a) => a.className.split(/\s+/).includes("bg-bg-elevated"))
      .map((a) => a.getAttribute("href"));
    expect(lit).toEqual([`${BASE}?view=inbox`]);
  });
});
