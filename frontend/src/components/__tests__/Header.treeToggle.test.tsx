import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { treeEnabledStore } from "@/lib/treeEnabledStore";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

const route = vi.hoisted(() => ({
  drive: "work" as string | null,
  pathname: "/drive/work",
  search: "",
}));
const sidebarState = vi.hoisted(() => ({ isOpen: false, isOverlay: false }));

vi.mock("../GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("../quick-note", () => ({ QuickNote: () => null }));
vi.mock("../CurrentDriveProvider", () => ({ useCurrentDrive: () => route.drive }));
vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: null, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));
vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({
    isOpen: sidebarState.isOpen,
    isOverlay: sidebarState.isOverlay,
    toggle: vi.fn(),
    close: vi.fn(),
    setOverlayMode: vi.fn(),
    refreshKey: 0,
    requestRefresh: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

import { Header } from "../Header";

const treeToggle = () => screen.queryByRole("button", { name: /tree/i });

beforeEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
  route.drive = "work";
  route.pathname = "/drive/work";
  route.search = "";
  sidebarState.isOpen = false;
  sidebarState.isOverlay = false;
});

describe("the tree toggle in the app header", () => {
  it.each([
    ["the drive home", "/drive/work", ""],
    ["the Library root", "/drive/work", "view=library"],
    ["a folder", "/drive/work/videos", ""],
    ["a collection", "/drive/work/collections/c1", ""],
  ])("is offered on %s, where the tree pane mounts", (_name, pathname, search) => {
    route.pathname = pathname;
    route.search = search;
    render(<Header />);
    expect(treeToggle()).not.toBeNull();
  });

  it.each([
    ["an addon page", "/drive/work/addons/knowledge", ""],
    ["Trash", "/drive/work", "view=trash"],
    ["Missing", "/drive/work", "view=missing"],
    ["a cross-folder view", "/drive/work", "view=favorites"],
    ["search", "/drive/work/search", "q=cats"],
  ])("is not offered on %s, which has no tree pane", (_name, pathname, search) => {
    route.pathname = pathname;
    route.search = search;
    render(<Header />);
    expect(treeToggle()).toBeNull();
  });

  it("is not offered outside a drive", () => {
    route.drive = null;
    route.pathname = "/";
    render(<Header />);
    expect(treeToggle()).toBeNull();
  });

  // The full-screen file page knows its drive but mounts no tree pane.
  it("is not offered on a page outside the drive routes, even with a drive", () => {
    route.pathname = "/files/abc123";
    render(<Header />);
    expect(treeToggle()).toBeNull();
  });

  it("leads the header's controls", () => {
    const { container } = render(<Header />);
    const header = container.querySelector("header")!;
    const firstButton = header.querySelector("button");
    expect(firstButton).toBe(treeToggle());
  });

  // The menu button is fixed at top 12 as a 40px rounded-2xl box; matching it
  // is what puts the two on one line.
  it("is the menu button's box, at the menu button's top", () => {
    render(<Header />);
    const button = treeToggle()!;
    const classes = button.className.split(/\s+/);
    for (const c of ["h-10", "w-10", "rounded-2xl"]) expect(classes).toContain(c);
    const slot = button.parentElement!.className.split(/\s+/);
    for (const c of ["self-start", "mt-3"]) expect(slot).toContain(c);
  });

  it.each([
    ["closed", false, false, "ml-11"],
    ["open over the page", true, true, "ml-11"],
    ["open beside the page", true, false, "-ml-1"],
  ])("clears the menu button when the sidebar is %s", (_name, isOpen, isOverlay, margin) => {
    sidebarState.isOpen = isOpen;
    sidebarState.isOverlay = isOverlay;
    render(<Header />);
    const slot = treeToggle()!.parentElement!.className.split(/\s+/);
    expect(slot.filter((c) => /^-?ml-/.test(c))).toEqual([margin]);
  });
});
