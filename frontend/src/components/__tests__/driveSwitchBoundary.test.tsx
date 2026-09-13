/**
 * AC 13 — switching drives lands on the target drive's home, and carries
 * nothing across the boundary.
 *
 * Spec 2026-09-12-purpose-oriented-navigation §16. The thing that would
 * break it is not a typo in one href: it is a future switcher that
 * builds its destination from where you are standing, so that leaving
 * `/drive/a/recipes?tag=soup` lands on `/drive/b/recipes?tag=soup` — a
 * folder that may not exist in the other drive, or a filter that means
 * something else there. A drive is a security boundary
 * (`.claude/rules/design-decisions.md`), and carrying a path across one
 * is how a reader ends up looking at a 404 and wondering what they lost.
 *
 * **So the population is the places you can be switching *from*.** Each
 * is declared with the destination it must produce, and the destination
 * is the same for all of them — which is the point, and is why the
 * origins are enumerated rather than one being taken as representative.
 * Asserting a single href from a single location cannot see a switcher
 * that started reading `usePathname`.
 *
 * It is measured through `Sidebar`, not through `SidebarDriveSwitcher`
 * directly, because the component takes no pathname today: the thing
 * that must not happen is a prop appearing that feeds it one.
 *
 * **"Where you are" has two doors, and both are driven here.** The
 * router hooks are stood in for, and the document's own URL is moved
 * with `history.replaceState`. A change that reached for
 * `window.location.search` instead of `useSearchParams` would otherwise
 * be invisible — measured: it was, before this was added.
 *
 * Not held here: that the navigation actually occurs, or what the target
 * drive renders — jsdom follows no links
 * (`.claude/rules/review-workflow.md`, "What a test here cannot hold").
 * `useFolderFiles.test.ts` holds what the Library root asks the API for.
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
 * Where a reader can be standing when they switch, declared per case.
 *
 * Each is a real shape the app produces: a drive home, a folder, a
 * folder under a tag filter, a cross-folder view, the Library root, and
 * an addon page. A `?view=` or a `?tag=` is exactly the sort of thing a
 * "keep the reader's context" change would try to preserve.
 */
const ORIGINS: [string, string, string][] = [
  ["the drive home", `/drive/${encodeURIComponent(HERE)}`, ""],
  ["a folder", `/drive/${encodeURIComponent(HERE)}/recipes/soup`, ""],
  ["a folder under a tag", `/drive/${encodeURIComponent(HERE)}/recipes`, "tag=soup"],
  ["the Library root", `/drive/${encodeURIComponent(HERE)}`, "view=library"],
  ["a cross-folder view", `/drive/${encodeURIComponent(HERE)}`, "view=favorites"],
  ["an addon page", `/drive/${encodeURIComponent(HERE)}/addons/knowledge`, ""],
];

/** The one destination every origin must produce. */
const TARGET_HOME = `/drive/${encodeURIComponent(THERE)}`;

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
    // Without this, a switcher that stopped rendering the other drive
    // would make every case above fail loudly rather than silently — but
    // a `queryBy`-shaped rewrite of them would not, and this states the
    // population separately either way.
    openTheSwitcher();
    expect(screen.getByRole("link", { name: THERE })).not.toBeNull();
  });
});
