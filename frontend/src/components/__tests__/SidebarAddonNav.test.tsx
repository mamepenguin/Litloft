import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import { Sidebar } from "../Sidebar";
import type { AddonMeta } from "@/lib/addons";

const DRIVE = "家族ビデオ & co";
const ENCODED = `/drive/${encodeURIComponent(DRIVE)}`;
const PINNED_PATH = "料理";

let pathname = ENCODED;
let search = new URLSearchParams();
let overlay = false;
const mockClose = vi.fn();
let catalogue: Record<string, AddonMeta> = {};
let catalogueDrive: string | null | undefined = DRIVE;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: true, isOverlay: overlay, close: mockClose, refreshKey: 0 }),
}));

vi.mock("../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ addons: catalogue, catalogueDrive, slots: {}, loading: false }),
}));

vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => DRIVE,
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("../sidebar/useSidebarData", () => ({
  useSidebarData: () => ({
    drives: [{ name: DRIVE, file_count: 1 }],
    tags: null,
    pins: [{ path: PINNED_PATH }],
    collectionList: [],
    setCollectionList: vi.fn(),
    authStatus: { is_admin: false },
    driveSummary: { missing_count: 1 },
  }),
}));

vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({ smartFolders: [], update: vi.fn(), remove: vi.fn() }),
}));

function addon(
  navigation: AddonMeta["navigation"],
  extra: Partial<AddonMeta> = {},
): AddonMeta {
  return {
    label: "Product name",
    icon: "package",
    href: "/drive/{drive}/addons/x",
    scope: "drive",
    navigation,
    ...extra,
  };
}

/** Declared out of order, so an unsorted render and a sorted one differ. */
const BUNDLED: Record<string, AddonMeta> = {
  zeta: addon({ label: "Zeta tools", placement: "utility", priority: 5 }),
  knowledge: addon({ label: "Notes", placement: "primary", priority: 20, icon: "notebook-pen" }),
  media_import: addon({ label: "YouTube & Feeds", placement: "sources", priority: 10, icon: "rss" }),
  intelligence: addon({ label: "Ask", placement: "primary", priority: 10, icon: "message-circle-question" }),
  beta: addon({ label: "Beta source", placement: "sources", priority: 10 }),
};

const rowLabels = () =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>("nav a")).map((a) =>
    a.textContent?.replace(/\d+$/, "").trim(),
  );
const navText = () => document.querySelector("nav")?.textContent ?? "";
const addonHref = (name: string) => `${ENCODED}/addons/${name}`;
const rowFor = (name: string) =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>("nav a")).find(
    (a) => a.getAttribute("href") === addonHref(name),
  ) ?? null;
const HIGHLIGHT = "bg-bg-elevated";
const lit = () =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>("nav a"))
    .filter((a) => a.className.split(/\s+/).includes(HIGHLIGHT))
    .map((a) => a.textContent?.replace(/\d+$/, "").trim());

beforeEach(() => {
  pathname = ENCODED;
  search = new URLSearchParams();
  overlay = false;
  mockClose.mockClear();
  catalogue = {};
  catalogueDrive = DRIVE;
});

describe("addon destinations in the sidebar", () => {
  it("places each by its placement and orders it by priority, then name", () => {
    catalogue = BUNDLED;
    render(<Sidebar />);
    expect(rowLabels()).toEqual([
      "Litloft",
      "Home",
      "Library",
      "Ask",
      "Notes",
      "Favorites",
      "Liked",
      "Recently Viewed",
      "Recently Added",
      "All Files",
      "Beta source",
      "YouTube & Feeds",
      PINNED_PATH,
      "Zeta tools",
      "Trash",
      "Missing Files",
    ]);
  });

  it("puts the Sources heading over the source rows only", () => {
    catalogue = BUNDLED;
    render(<Sidebar />);
    const text = navText();
    const at = (needle: string) => {
      const i = text.indexOf(needle);
      expect(i, `${needle} is not on the column`).not.toBe(-1);
      return i;
    };
    expect(at("All Files")).toBeLessThan(at("Sources"));
    expect(at("Sources")).toBeLessThan(at("Beta source"));
    expect(text.split("Sources").length - 1).toBe(1);
  });

  it.each([
    ["no catalogue", {}],
    ["only primary and utility entries", { knowledge: BUNDLED.knowledge, zeta: BUNDLED.zeta }],
  ])("draws no Sources heading with %s", (_, addons) => {
    catalogue = addons;
    render(<Sidebar />);
    expect(navText()).not.toContain("Sources");
  });

  it("keeps every Core row, and draws no addon row, with an empty catalogue", () => {
    catalogue = {};
    render(<Sidebar />);
    expect(rowLabels()).toEqual([
      "Litloft",
      "Home",
      "Library",
      "Favorites",
      "Liked",
      "Recently Viewed",
      "Recently Added",
      "All Files",
      PINNED_PATH,
      "Trash",
      "Missing Files",
    ]);
  });

  it("links to the route Core builds, never the manifest's href", () => {
    catalogue = {
      knowledge: addon(
        { label: "Notes", placement: "primary", priority: 1 },
        { href: "https://elsewhere.example/steal" },
      ),
    };
    render(<Sidebar />);
    expect(rowFor("knowledge")).not.toBeNull();
    const hrefs = Array.from(document.querySelectorAll("nav a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("elsewhere"))).toBe(false);
  });

  it.each<[string, AddonMeta]>([
    ["no navigation", { label: "Knowledge", icon: "notebook-pen", href: "/x", scope: "drive" }],
    ["no href", addon({ label: "Notes", placement: "primary", priority: 1 }, { href: undefined })],
  ])("draws nothing for an addon with %s", (_, meta) => {
    catalogue = { knowledge: meta };
    render(<Sidebar />);
    expect(rowFor("knowledge")).toBeNull();
    expect(navText()).not.toContain("Knowledge");
    expect(navText()).not.toContain("Addons");
  });

  it("names a row by its resolved key, and by its label when the key does not resolve", () => {
    catalogue = {
      knowledge: addon({ label: "Notes", placement: "primary", priority: 1, i18n_key: "knowledge.createNote.button" }),
      intelligence: addon({ label: "Ask", placement: "primary", priority: 2, i18n_key: "intelligence.nav.missing" }),
    };
    render(<Sidebar />);
    expect(rowFor("knowledge")?.textContent).toBe("Create note");
    expect(rowFor("intelligence")?.textContent).toBe("Ask");
    expect(navText()).not.toContain("Product name");
    expect(navText()).not.toContain("intelligence.nav.missing");
  });

  it.each([
    ["an unknown icon", "no-such-icon", "lucide-package"],
    ["no icon", undefined, "lucide-package"],
    ["a known icon", "message-circle-question", "lucide-message-circle-question-mark"],
  ])("draws the row with %s", (_, icon, expected) => {
    catalogue = { intelligence: addon({ label: "Ask", placement: "primary", priority: 1, icon }) };
    render(<Sidebar />);
    const svg = rowFor("intelligence")?.querySelector("svg");
    expect(svg?.getAttribute("class")?.split(/\s+/)).toContain(expected);
  });

  it("draws nothing for another drive's catalogue that has not been replaced yet", () => {
    catalogue = BUNDLED;
    catalogueDrive = "another drive";
    render(<Sidebar />);
    for (const name of Object.keys(BUNDLED)) expect(rowFor(name)).toBeNull();
    expect(navText()).not.toContain("Sources");
  });

  describe("which row is lit", () => {
    it.each([
      ["its own page", "knowledge", "Notes"],
      ["a page under it", "knowledge/some-note", "Notes"],
      ["another addon's page", "intelligence", "Ask"],
    ])("lights one row on %s", (_, route, label) => {
      catalogue = BUNDLED;
      pathname = `${ENCODED}/addons/${route}`;
      render(<Sidebar />);
      expect(lit()).toEqual([label]);
    });

    it("lights a row under it on the decoded path too", () => {
      catalogue = BUNDLED;
      pathname = `/drive/${DRIVE}/addons/knowledge/some-note`;
      render(<Sidebar />);
      expect(lit()).toEqual(["Notes"]);
    });

    it("does not light an addon whose name is a prefix of the page's addon", () => {
      catalogue = BUNDLED;
      pathname = `${ENCODED}/addons/knowledgebase`;
      render(<Sidebar />);
      expect(lit()).not.toContain("Notes");
    });

    it("leaves addon rows unlit on Core pages", () => {
      catalogue = BUNDLED;
      search = new URLSearchParams({ view: "favorites" });
      render(<Sidebar />);
      expect(lit()).toEqual(["Favorites"]);
    });
  });

  it("dismisses an overlay sidebar from an addon row, and leaves an inline one alone", () => {
    catalogue = BUNDLED;
    overlay = true;
    const { unmount } = render(<Sidebar />);
    rowFor("media_import")!.click();
    expect(mockClose).toHaveBeenCalled();
    unmount();

    overlay = false;
    mockClose.mockClear();
    render(<Sidebar />);
    rowFor("media_import")!.click();
    expect(mockClose).not.toHaveBeenCalled();
  });
});
