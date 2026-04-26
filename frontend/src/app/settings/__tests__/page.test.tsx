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
    // ja: "設定"
    expect(
      screen.getByRole("heading", { level: 1, name: "設定" }),
    ).toBeInTheDocument();
  });

  it("renders the Profile section heading", () => {
    render(<SettingsPage />);
    // ja: "プロフィール"
    expect(screen.getByRole("heading", { name: "プロフィール" })).toBeInTheDocument();
  });

  it("renders the Appearance section heading", () => {
    render(<SettingsPage />);
    // ja: "表示"
    expect(screen.getByRole("heading", { name: "表示" })).toBeInTheDocument();
  });

  it("renders the Language section heading", () => {
    render(<SettingsPage />);
    // ja: "言語"
    expect(screen.getByRole("heading", { name: "言語" })).toBeInTheDocument();
  });
});
