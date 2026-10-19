/**
 * The origins are enumerated rather than one taken as representative: a
 * single href from a single location cannot see a switcher that builds its
 * destination from where you are standing. Rendered through `Sidebar`,
 * because what must not happen is a prop appearing that feeds the switcher
 * a pathname, and the document's own URL is moved as well as the router
 * hooks so a switcher reading `window.location` is seen too.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const HERE = "家族ビデオ & co";
const THERE = "旅行 / 2026";

let pathname = `/drive/${encodeURIComponent(HERE)}`;
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: true, isOverlay: false, close: vi.fn(), refreshKey: 0 }),
}));
vi.mock("../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ addons: {}, slots: {}, loading: false }),
}));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => HERE,
  useCurrentFolderPath: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));
vi.mock("../sidebar/useSidebarData", () => ({
  useSidebarData: () => ({
    drives: [
      { name: HERE, file_count: 1 },
      { name: THERE, file_count: 2 },
    ],
    tags: null,
    pins: [],
    collectionList: [],
    setCollectionList: vi.fn(),
    authStatus: { is_admin: false },
    driveSummary: { missing_count: 0 },
  }),
}));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({ smartFolders: [], update: vi.fn(), remove: vi.fn() }),
}));

import { Sidebar } from "../Sidebar";

/**
 * A `?view=` or a `?tag=` is exactly the sort of thing a "keep the
 * reader's context" change would try to preserve.
 */
const ORIGINS: [string, string, string][] = [
  ["the Library root", `/drive/${encodeURIComponent(HERE)}`, ""],
  ["a folder", `/drive/${encodeURIComponent(HERE)}/recipes/soup`, ""],
  ["a folder under a tag", `/drive/${encodeURIComponent(HERE)}/recipes`, "tag=soup"],
  // The switcher's own target carries `view=home`, so standing on one is the
  // state where "preserve what the reader had" and "go to the other drive's
  // Home" produce the same string for the wrong reason.
  ["the drive home", `/drive/${encodeURIComponent(HERE)}`, "view=home"],
  ["the Library alias", `/drive/${encodeURIComponent(HERE)}`, "view=library"],
  ["a cross-folder view", `/drive/${encodeURIComponent(HERE)}`, "view=favorites"],
  ["an addon page", `/drive/${encodeURIComponent(HERE)}/addons/knowledge`, ""],
];

const TARGET_HOME = `/drive/${encodeURIComponent(THERE)}?view=home`;

/** Puts both the router stand-ins and the document's URL at one place. */
function standingAt(from: string, query: string): void {
  pathname = from;
  search = new URLSearchParams(query);
  window.history.replaceState({}, "", query ? `${from}?${query}` : from);
}

function openTheSwitcher(): void {
  render(<Sidebar />);
  const row = screen.getByRole("button", { name: new RegExp(HERE.slice(0, 4)) });
  fireEvent.click(row);
}

describe("switching drives carries nothing across the boundary", () => {
  beforeEach(() => {
    standingAt(`/drive/${encodeURIComponent(HERE)}`, "");
  });

  it.each(ORIGINS)("from %s", (_name, from, query) => {
    standingAt(from, query);
    openTheSwitcher();

    const target = screen.getByRole("link", { name: THERE });
    expect(target.getAttribute("href")).toBe(TARGET_HOME);
  });

  it("the other drive is reachable at all, so the cases above are not vacuous", () => {
    openTheSwitcher();
    expect(screen.getByRole("link", { name: THERE })).not.toBeNull();
  });
});
