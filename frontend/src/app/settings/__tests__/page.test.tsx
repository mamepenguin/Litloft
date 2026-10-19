import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { accentFills } from "@/__tests__/helpers/accentFills";
import SettingsPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/settings",
}));

const mockProfile = { nickname: null as string | null };
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({
    nickname: mockProfile.nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme: vi.fn(),
  }),
}));

afterEach(() => {
  mockProfile.nickname = null;
  cleanup();
});

describe("SettingsPage (/settings)", () => {
  /**
   * `accentFills` reads class lists, so it counts Save while it is disabled
   * too, where `disabled:bg-sand` actually wins at runtime.
   */
  it("spends one accent fill on the nickname form's Save", () => {
    const { container } = render(<SettingsPage />);
    expect(accentFills(container)).toHaveLength(1);
    const fills = accentFills(container);
    expect(fills[0]!.tagName).toBe("BUTTON");
    expect(fills[0]!.textContent).toBe("Save");
  });

  it("spends one on the avatar once a nickname is set, and nothing else", () => {
    mockProfile.nickname = "Aki";
    const { container } = render(<SettingsPage />);
    expect(accentFills(container)).toHaveLength(1);
    const fills = accentFills(container);
    expect(fills[0]!.className).toContain("rounded-full");
    // The pickers are on screen in this state and spend nothing: their
    // selected buttons carry `border-accent`, which is not a fill.
    expect(screen.getByRole("button", { name: "System" }).className).toContain(
      "border-accent",
    );
  });

  it("renders the page title from settings.title", () => {
    render(<SettingsPage />);
    // en: "Settings"
    expect(
      screen.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("renders the Profile section heading", () => {
    render(<SettingsPage />);
    // en: "Profile"
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
  });

  /**
   * Row labels rather than headings: a heading level is a claim about
   * document structure, and three settings are not three sections.
   */
  it("gathers the three preferences into one card, in order", () => {
    const { container } = render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: "Display and behaviour" }),
    ).toBeInTheDocument();
    for (const gone of ["Appearance", "Language", "Sidebar order"]) {
      expect(screen.queryByRole("heading", { name: gone })).toBeNull();
    }
    const card = container.querySelector("#settings-preferences-title")!
      .parentElement!;
    const labels = Array.from(card.querySelectorAll(".divide-y > div > span"))
      .map((s) => s.textContent);
    expect(labels).toEqual(["Appearance", "Language", "Sidebar order"]);
  });

  /**
   * Without the group, a reader tabbing into the theme picker hears
   * "System / Light / Dark" and nothing that says which setting they belong
   * to.
   */
  it("names each row's controls with that row's label", () => {
    render(<SettingsPage />);
    const groups = screen.getAllByRole("group");
    expect(groups.map((g) => g.textContent?.startsWith("Appearance"))).toContain(
      true,
    );
    for (const [label, control] of [
      ["Appearance", "System"],
      ["Language", "English"],
      ["Sidebar order", "Reset order"],
    ]) {
      const group = groups.find((g) =>
        (g.textContent ?? "").startsWith(label!),
      );
      expect(group, `no group named ${label}`).toBeDefined();
      // The name comes from the row's own label element, by id.
      const named = document.getElementById(
        group!.getAttribute("aria-labelledby")!,
      );
      expect(named?.textContent).toBe(label);
      expect(
        within(group!).getByRole("button", { name: control! }),
      ).toBeInTheDocument();
    }
  });

  it("draws three cards, not five", () => {
    const { container } = render(<SettingsPage />);
    expect(container.querySelectorAll("section")).toHaveLength(3);
  });
});
