import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({
    nickname: null,
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

describe("SettingsPage (/settings)", () => {
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

  it("renders the Appearance section heading", () => {
    render(<SettingsPage />);
    // en: "Appearance"
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
  });

  it("renders the Language section heading", () => {
    render(<SettingsPage />);
    // en: "Language"
    expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();
  });
});
