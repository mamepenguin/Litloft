import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AppShell } from "../AppShell";

const sidebarState = vi.hoisted(() => ({ isOpen: false, isOverlay: false }));

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
vi.mock("../Sidebar", () => ({ Sidebar: () => <aside /> }));
vi.mock("../Header", () => ({ Header: () => <header /> }));
vi.mock("../CurrentDriveProvider", () => ({ useCurrentDrive: () => "main" }));
vi.mock("../TreeToggle", () => ({
  TreeToggle: ({ drive }: { drive: string }) => <button data-testid="tree-toggle" data-drive={drive} />,
}));
vi.mock("../ShortcutsProvider", () => ({
  ShortcutsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * The hamburger and `TreeToggle` decide which surface names where you are,
 * and one of them holds that job at a time — so both have to show whether
 * they hold it.
 */
describe("the sidebar's menu button", () => {
  const button = () => screen.getByRole("button", { name: /menu/i });
  const activeClasses = ["bg-bg-elevated", "text-text-primary"];

  const renderShell = (isOpen: boolean) => {
    cleanup();
    sidebarState.isOpen = isOpen;
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
  };

  it("is the tree toggle's box", () => {
    renderShell(false);
    const classes = button().className.split(/\s+/);
    for (const c of ["h-10", "w-10", "rounded-2xl"]) expect(classes).toContain(c);
  });

  it("looks pressed while the sidebar is open", () => {
    renderShell(true);
    expect(button()).toHaveAttribute("aria-pressed", "true");
    const classes = button().className.split(/\s+/);
    for (const c of activeClasses) expect(classes).toContain(c);
  });

  it("does not while it is closed", () => {
    renderShell(false);
    expect(button()).toHaveAttribute("aria-pressed", "false");
    // Tokens, not substrings: `hover:bg-bg-elevated` is on the button in
    // both states and contains the resting class as a substring.
    const classes = button().className.split(/\s+/);
    for (const c of activeClasses) expect(classes).not.toContain(c);
    expect(classes).toContain("text-text-muted");
  });

  it("spends no accent on it", () => {
    renderShell(true);
    expect(button().className).not.toMatch(/(^|[\s:])bg-accent/);
  });

  it.each([
    ["closed", false, false],
    ["open beside the page", true, false],
    ["open over the page", true, true],
  ])("keeps the tree toggle beside it while the sidebar is %s", (_name, isOpen, isOverlay) => {
    cleanup();
    sidebarState.isOpen = isOpen;
    sidebarState.isOverlay = isOverlay;
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    const toggle = screen.getByTestId("tree-toggle");
    expect(toggle.getAttribute("data-drive")).toBe("main");
    const row = screen.getByTestId("chrome-buttons");
    expect([...row.children]).toEqual([button(), toggle]);
    for (const c of ["fixed", "left-3", "z-50", "flex", "gap-2"]) {
      expect(row.className.split(/\s+/)).toContain(c);
    }
    // jsdom reorders the calc, so the two terms are checked, not the string.
    expect(row.style.top).toContain("safe-area-inset-top");
    expect(row.style.top).toContain("12px");
  });
});
