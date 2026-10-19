import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { accentFills } from "@/__tests__/helpers/accentFills";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const slots = { has: true, loading: false };
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    hasSlot: () => slots.has,
    loading: slots.loading,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("../DrivesSection", () => ({ DrivesSection: () => null }));
vi.mock("../PasswordsSection", () => ({ PasswordsSection: () => null }));
vi.mock("../AddonPolicySection", () => ({ AddonPolicySection: () => null }));

import AdminSettingsPage from "../page";

afterEach(() => {
  slots.has = true;
  slots.loading = false;
  cleanup();
});

describe("/admin/settings", () => {
  it("heads the page through PageHeader", () => {
    render(<AdminSettingsPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe("settings.title");
  });

  it("wires each tab to a panel that is really there", () => {
    const { container } = render(<AdminSettingsPage />);
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      const id = tab.getAttribute("aria-controls");
      expect(id).toBeTruthy();
      const panel = container.querySelector(`#${id}`);
      expect(panel).not.toBeNull();
      expect(panel!.getAttribute("role")).toBe("tabpanel");
      expect(panel!.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(tab.id).toBeTruthy();
    }
  });

  it("moves the selection, and the panel with it", () => {
    const { container } = render(<AdminSettingsPage />);
    const [system, intelligence] = screen.getAllByRole("tab");
    expect(system!.getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector(`#${system!.getAttribute("aria-controls")}`)!.className,
    ).not.toContain("hidden");

    fireEvent.click(intelligence!);
    expect(intelligence!.getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector(
        `#${intelligence!.getAttribute("aria-controls")}`,
      )!.className,
    ).not.toContain("hidden");
    expect(
      container.querySelector(`#${system!.getAttribute("aria-controls")}`)!.className,
    ).toContain("hidden");
  });

  /**
   * One tab is not a choice. With the intelligence addon absent the row is
   * not drawn at all — a single tab, permanently selected, is chrome that
   * asks to be read and then says nothing.
   */
  it("draws no tab row when there is only one section, and no orphan panel", () => {
    slots.has = false;
    const { container } = render(<AdminSettingsPage />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    // And no `tabpanel` either: the role's whole meaning is "the tab above
    // swapped me in", so with no tab above it is a plain div holding the
    // page's content.
    expect(screen.queryAllByRole("tabpanel")).toHaveLength(0);
    const panel = container.querySelector("#settings-panel-system")!;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute("role")).toBeNull();
    expect(panel.getAttribute("aria-labelledby")).toBeNull();
  });

  it("adds no accent fill of its own", () => {
    const { container } = render(<AdminSettingsPage />);
    expect(accentFills(container)).toEqual([]);
    const [, intelligence] = screen.getAllByRole("tab");
    fireEvent.click(intelligence!);
    expect(accentFills(container)).toEqual([]);
  });
});
