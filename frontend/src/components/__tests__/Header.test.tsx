import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../Header";

vi.mock("../GlobalSearch", () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}));

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
}));

const profileState: { nickname: string | null } = { nickname: null };
const setNicknameMock = vi.fn();
const clearNicknameMock = vi.fn();

vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({
    nickname: profileState.nickname,
    setNickname: setNicknameMock,
    clearNickname: clearNicknameMock,
  }),
}));

beforeEach(() => {
  pushMock.mockClear();
  setNicknameMock.mockClear();
  clearNicknameMock.mockClear();
  profileState.nickname = null;
});

describe("Header", () => {
  it("renders GlobalSearch", () => {
    render(<Header />);
    expect(screen.getByTestId("global-search")).toBeInTheDocument();
  });

  it("does NOT render LanguageSwitcher", () => {
    render(<Header />);
    expect(screen.queryByTestId("language-switcher")).not.toBeInTheDocument();
    // Also check no "Language:" aria-labels (real LanguageSwitcher fingerprint)
    expect(screen.queryByLabelText(/Language:/i)).not.toBeInTheDocument();
  });

  it("does NOT render ThemeToggle", () => {
    render(<Header />);
    expect(screen.queryByTestId("theme-toggle")).not.toBeInTheDocument();
  });

  it("does NOT render the change/clear dropdown when nickname is set", () => {
    profileState.nickname = "Alice";
    render(<Header />);
    const button = screen.getByRole("button", { name: "Alice" });
    fireEvent.click(button);
    // Dropdown items should not appear
    expect(screen.queryByText("Rename")).not.toBeInTheDocument();
    expect(screen.queryByText("Clear profile")).not.toBeInTheDocument();
  });

  it("does NOT render the ProfileSetup modal", () => {
    render(<Header />);
    // ProfileSetup modal contains a heading with profile.setup text
    expect(screen.queryByRole("heading", { name: "Profile Setup" })).not.toBeInTheDocument();
  });

  describe("when nickname is set (avatar mode)", () => {
    beforeEach(() => {
      profileState.nickname = "Alice";
    });

    it("renders avatar button with first initial", () => {
      render(<Header />);
      const button = screen.getByRole("button", { name: "Alice" });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent("A");
    });

    it("navigates to /settings when avatar is clicked", () => {
      render(<Header />);
      const button = screen.getByRole("button", { name: "Alice" });
      fireEvent.click(button);
      expect(pushMock).toHaveBeenCalledWith("/settings");
    });
  });

  describe("when nickname is unset (User icon mode)", () => {
    it("renders a profile button with User icon", () => {
      render(<Header />);
      // profile.setup translation = "Profile Setup"
      const button = screen.getByRole("button", { name: "Profile Setup" });
      expect(button).toBeInTheDocument();
    });

    it("navigates to /settings when User icon is clicked", () => {
      render(<Header />);
      const button = screen.getByRole("button", { name: "Profile Setup" });
      fireEvent.click(button);
      expect(pushMock).toHaveBeenCalledWith("/settings");
    });
  });
});
