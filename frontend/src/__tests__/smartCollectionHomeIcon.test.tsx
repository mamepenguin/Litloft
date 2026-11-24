/**
 * SPEC-CORE-106 step 3 (I1, icon half): a Smart Collection's Home shortcut is
 * drawn with lucide ListFilter. Driven through `DriveHome`, with the shortcuts
 * answered at `fetch`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { Library, ListFilter } from "lucide-react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import type { WatchHistoryItem } from "@/types";

const DRIVE = "main";

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "Alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
  ProfileProvider: ({ children }: { children: React.ReactNode }) => children,
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

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: DRIVE,
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams("view=home"),
  usePathname: () => `/drive/${DRIVE}`,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: () => Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 12 } }),
  getWatchHistory: () => Promise.resolve([] as WatchHistoryItem[]),
  getInboxCount: () => Promise.resolve(0),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DriveHome } from "@/components/DriveHome";

const SHORTCUTS = [
  { kind: "smart_folder", id: "sf0000000001", name: "Lectures", query: "lecture", file_type: "video" },
  { kind: "collection", id: "col000000001", name: "Reading list", query: null, file_type: null },
];

const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/\/api\/drives\/[^/]+\/home-shortcuts$/.test(new URL(url, "http://x").pathname)) {
    return new Response(JSON.stringify(SHORTCUTS), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  throw new TypeError(`unexpected fetch ${url}`);
});

const iconOf = (el: Element) =>
  (el.querySelector("svg")?.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((c) => c.startsWith("lucide-") && c !== "lucide-icon");

function iconClass(Icon: typeof ListFilter): string[] {
  const { container, unmount } = render(<Icon />);
  const classes = iconOf(container);
  unmount();
  return classes;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-106 I1 the Home shortcut of a Smart Collection", () => {
  it("SPEC-CORE-106 I1 draws ListFilter for a Smart Collection and Library for a collection", async () => {
    const listFilter = iconClass(ListFilter);
    const library = iconClass(Library);
    render(
      <WebSocketContext.Provider value={{ lastEvent: null, connected: true }}>
        <DriveHome driveName={DRIVE} />
      </WebSocketContext.Provider>,
    );
    const nav = await screen.findByRole("navigation", { name: "Apps" });
    const smart = await within(nav).findByRole("link", { name: "Lectures" });
    const collection = within(nav).getByRole("link", { name: "Reading list" });

    expect(listFilter).toHaveLength(1);
    await waitFor(() => expect(iconOf(smart)).toEqual(listFilter));
    expect(iconOf(collection)).toEqual(library);
  });
});
