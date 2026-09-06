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
vi.mock("../ShortcutsProvider", () => ({
  ShortcutsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * NAV-2 rule 3. The hamburger and `TreeToggle` decide which surface names
 * where you are, and one of them holds that job at a time — so both have
 * to show whether they hold it. This one said nothing at all: no
 * `aria-pressed`, and the same appearance open or closed.
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
});
