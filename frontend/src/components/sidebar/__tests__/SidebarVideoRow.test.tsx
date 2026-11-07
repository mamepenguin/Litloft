/**
 * SPEC-CORE-054 I11 — the Video row sits after Library and before the addon
 * rows, and is selected only on the app routes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { Sidebar } from "../../Sidebar";

const DRIVE = "main";
const BASE = `/drive/${DRIVE}`;
const VIDEO = `${BASE}/apps/video`;

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

describe("SPEC-CORE-054 I11 the Video row", () => {
  it("SPEC-CORE-054 links to the video app route", () => {
    renderSidebar();

    expect(row(VIDEO)).toBeDefined();
    expect(row(VIDEO)!.textContent).toContain("Video");
  });

  it("SPEC-CORE-054 sits after Library and before the addon rows", () => {
    renderSidebar();

    const hrefs = links().map((a) => a.getAttribute("href"));
    const library = hrefs.indexOf(BASE);
    const video = hrefs.indexOf(VIDEO);
    const addon = hrefs.indexOf("/addon-marker");
    expect(library).toBeGreaterThanOrEqual(0);
    expect(video).toBeGreaterThan(library);
    expect(addon).toBeGreaterThan(video);
  });

  it("SPEC-CORE-054 is selected on the app routes and nowhere else", () => {
    const idle = classesAt(BASE, VIDEO);

    expect(classesAt(VIDEO, VIDEO)).not.toBe(idle);
    expect(classesAt(`${VIDEO}/shelf`, VIDEO)).toBe(classesAt(VIDEO, VIDEO));
    expect(classesAt(`${BASE}/search`, VIDEO)).toBe(idle);
    expect(classesAt(`${BASE}/collections/c1`, VIDEO)).toBe(idle);
  });

  it("SPEC-CORE-054 leaves Library unselected on the app routes", () => {
    const libraryAtHome = classesAt(BASE, BASE);

    expect(classesAt(VIDEO, BASE)).not.toBe(libraryAtHome);
  });
});
