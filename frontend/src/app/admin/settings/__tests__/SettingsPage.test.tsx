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

  /**
   * `role="tab"` promises a screen reader that activating this swaps a
   * panel in the same view. Without `aria-controls` there is no way to say
   * which panel, and the promise is unkept — so the link between the two
   * is asserted by following it, not by checking the attribute exists.
   */
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
  it("draws no tab row when there is only one section", () => {
    slots.has = false;
    render(<AdminSettingsPage />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    // The panel it would have controlled is still the page's content.
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  /**
   * 裁定 R2, on this page's own chrome — the header, the tab row and the
   * panels — with the sections stubbed out.
   *
   * **What this does not measure**, said plainly because the earlier draft
   * of this comment implied otherwise: the sections are mocked here, so
   * their fills are counted in their own files (`DrivesSection.test.tsx`
   * asserts nothing closed and exactly one with the modal open;
   * `AddonPolicySection.test.tsx` asserts the feature switch is teal).
   * What is left is the chrome, and the chrome is where the regression
   * risk actually is: the tab row this replaced painted its selected tab
   * `bg-accent text-white`, spending the page's one fill on saying which
   * tab you are already looking at.
   *
   * In the running app, at 375 / 400 / 430 / 1512, the visible panel shows
   * zero accent fills. The four that exist in the DOM are the intelligence
   * addon's own settings sections, inside the other tab's `display:none`
   * panel, and belong to that addon's budget.
   */
  it("adds no accent fill of its own", () => {
    const { container } = render(<AdminSettingsPage />);
    expect(accentFills(container)).toEqual([]);
    // The selected tab specifically, since that is what used to carry one.
    const [, intelligence] = screen.getAllByRole("tab");
    fireEvent.click(intelligence!);
    expect(accentFills(container)).toEqual([]);
  });
});
