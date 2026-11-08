/**
 * SPEC-CORE-059 I13 — the Reading row sits after Video and before the addon
 * rows, and is selected only on the Reading routes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { Sidebar } from "../../Sidebar";

const DRIVE = "main";
const BASE = `/drive/${DRIVE}`;
const VIDEO = `${BASE}/apps/video`;
const READING = `${BASE}/apps/reading`;

let pathname = BASE;
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("../../SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: true, isOverlay: false, close: vi.fn(), refreshKey: 0 }),
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

vi.mock("../AddonNavRows", () => ({
  AddonNavRows: () => <a href="/addon-marker">addon</a>,
}));

vi.mock("../../CurrentDriveProvider", () => ({
  useCurrentDrive: () => DRIVE,
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({ smartFolders: [], update: vi.fn(), remove: vi.fn() }),
}));

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith("/api/auth/status")
        ? { unlocked_groups: [], has_protected_drives: false, is_admin: false }
        : url.includes("/summary")
          ? { name: DRIVE, trash_count: 0, missing_count: 0 }
          : url.includes("/inbox/count")
            ? { open: 0 }
            : [];
      return Promise.resolve({ ok: true, json: async () => payload } as Response);
    }),
  );
}

function renderSidebar() {
  return render(
    <WebSocketContext.Provider value={{ lastEvent: null, connected: true }}>
      <Sidebar />
    </WebSocketContext.Provider>,
  );
}

function links(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("nav a"));
}

function row(href: string): HTMLAnchorElement | undefined {
  return links().find((a) => a.getAttribute("href") === href);
}

function classesAt(path: string, href: string): string {
  pathname = path;
  const { unmount } = renderSidebar();
  const cls = row(href)?.className ?? "";
  unmount();
  return cls;
}

beforeEach(() => {
  pathname = BASE;
  search = new URLSearchParams();
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-059 I13 the Reading row", () => {
  it("SPEC-CORE-059 links to the reading app route", () => {
    renderSidebar();

    expect(row(READING)).toBeDefined();
    expect(row(READING)!.textContent).toContain("Reading");
  });

  it("SPEC-CORE-059 sits directly after Video and before the addon rows", () => {
    renderSidebar();

    const hrefs = links().map((a) => a.getAttribute("href"));
    const video = hrefs.indexOf(VIDEO);
    const reading = hrefs.indexOf(READING);
    const addon = hrefs.indexOf("/addon-marker");
    expect(video).toBeGreaterThanOrEqual(0);
    expect(reading).toBe(video + 1);
    expect(addon).toBeGreaterThan(reading);
  });

  it("SPEC-CORE-059 is selected on the reading routes and nowhere else", () => {
    const idle = classesAt(BASE, READING);

    expect(classesAt(READING, READING)).not.toBe(idle);
    expect(classesAt(`${READING}/shelf`, READING)).toBe(classesAt(READING, READING));
    expect(classesAt(VIDEO, READING)).toBe(idle);
    expect(classesAt(`${BASE}/search`, READING)).toBe(idle);
  });

  it("SPEC-CORE-059 leaves Library and Video unselected on the reading routes", () => {
    expect(classesAt(READING, BASE)).not.toBe(classesAt(BASE, BASE));
    expect(classesAt(READING, VIDEO)).toBe(classesAt(BASE, VIDEO));
  });
});
