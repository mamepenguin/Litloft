import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    // Clear cookies
    document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
  });

  it("renders with current locale", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText("JA")).toBeInTheDocument();
  });

  it("toggles locale and sets cookie on click", () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.cookie).toContain("NEXT_LOCALE=en");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("has accessible label", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByLabelText("Language: JA")).toBeInTheDocument();
  });
});
