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

vi.mock("../CurrentDriveProvider", () => ({ useCurrentDrive: () => route.drive }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

import { FixedTreeToggle } from "../FixedTreeToggle";

const treeToggle = () => screen.queryByRole("button", { name: /tree/i });

beforeEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
  route.drive = "work";
  route.pathname = "/drive/work";
  route.search = "";
});

describe("the tree toggle beside the menu button", () => {
  it.each([
    ["the drive home", "/drive/work", ""],
    ["the Library root", "/drive/work", "view=library"],
    ["a folder", "/drive/work/videos", ""],
    ["a collection", "/drive/work/collections/c1", ""],
  ])("is offered on %s, where the tree pane mounts", (_name, pathname, search) => {
    route.pathname = pathname;
    route.search = search;
    render(<FixedTreeToggle />);
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
    render(<FixedTreeToggle />);
    expect(treeToggle()).toBeNull();
  });

  // Below `md` an open file hides the pane, and pressing the toggle there
  // would only arm a full-viewport tree for the moment the file closes.
  it.each([
    ["in a folder", "/drive/work/videos", "file=f1"],
    ["at the drive root", "/drive/work", "file=f1"],
  ])("is offered above md only while a file is open %s", (_name, pathname, search) => {
    route.pathname = pathname;
    route.search = search;
    render(<FixedTreeToggle />);
    const classes = treeToggle()!.className.split(/\s+/);
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:flex");
    expect(classes).not.toContain("flex");
  });

  it("is offered at every width while no file is open", () => {
    render(<FixedTreeToggle />);
    const classes = treeToggle()!.className.split(/\s+/);
    expect(classes).toContain("flex");
    expect(classes).not.toContain("hidden");
  });

  it("is not offered outside a drive", () => {
    route.drive = null;
    route.pathname = "/";
    render(<FixedTreeToggle />);
    expect(treeToggle()).toBeNull();
  });

  // The full-screen file page knows its drive but mounts no tree pane.
  it("is not offered on a page outside the drive routes, even with a drive", () => {
    route.pathname = "/files/abc123";
    render(<FixedTreeToggle />);
    expect(treeToggle()).toBeNull();
  });

  // The menu button is `fixed left-3` at the safe-area top + 12, 40px and
  // rounded-2xl; the toggle takes the same box one button to its right.
  it("is the menu button's box, one button to its right, at its top", () => {
    render(<FixedTreeToggle />);
    const button = treeToggle()!;
    const classes = button.className.split(/\s+/);
    for (const c of ["h-10", "w-10", "rounded-2xl"]) expect(classes).toContain(c);
    const slot = button.parentElement as HTMLElement;
    for (const c of ["fixed", "left-[60px]", "z-50"]) expect(slot.className.split(/\s+/)).toContain(c);
    // jsdom reorders the calc, so the two terms are checked, not the string.
    expect(slot.style.top).toContain("safe-area-inset-top");
    expect(slot.style.top).toContain("12px");
  });
});
