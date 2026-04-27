import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageSection } from "../LanguageSection";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: refreshMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/settings",
}));

beforeEach(() => {
  refreshMock.mockClear();
  // Reset cookie state
  document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
});

describe("LanguageSection", () => {
  it("renders both language options with native labels", () => {
    render(<LanguageSection />);
    expect(screen.getByRole("button", { name: "日本語" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  });

  it("writes NEXT_LOCALE cookie and refreshes router when switching to English", () => {
    render(<LanguageSection />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(document.cookie).toContain("NEXT_LOCALE=en");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("marks the current locale (ja from setup mock) as pressed", () => {
    render(<LanguageSection />);
    const ja = screen.getByRole("button", { name: "日本語" });
    const en = screen.getByRole("button", { name: "English" });
    const isActive = (el: HTMLElement) =>
      el.getAttribute("aria-pressed") === "true" ||
      el.getAttribute("aria-checked") === "true";
    expect(isActive(ja)).toBe(true);
    expect(isActive(en)).toBe(false);
  });

  it("does not refresh when clicking the already-active locale", () => {
    render(<LanguageSection />);
    fireEvent.click(screen.getByRole("button", { name: "日本語" }));
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
