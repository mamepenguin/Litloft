import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppearanceSection } from "../AppearanceSection";

type Theme = "system" | "light" | "dark";
const themeState: { theme: Theme } = { theme: "system" };
const setThemeMock = vi.fn();

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: themeState.theme,
    setTheme: setThemeMock,
  }),
}));

beforeEach(() => {
  setThemeMock.mockClear();
  themeState.theme = "system";
});

describe("AppearanceSection", () => {
  it("renders three theme options with translated labels", () => {
    render(<AppearanceSection />);
    // ja translations under settings.appearance
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dark" })).toBeInTheDocument();
  });

  it("calls setTheme('light') when light option clicked", () => {
    render(<AppearanceSection />);
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("calls setTheme('dark') when dark option clicked", () => {
    render(<AppearanceSection />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme('system') when system option clicked", () => {
    themeState.theme = "light";
    render(<AppearanceSection />);
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(setThemeMock).toHaveBeenCalledWith("system");
  });

  it("marks the currently selected theme as pressed", () => {
    themeState.theme = "dark";
    render(<AppearanceSection />);
    const dark = screen.getByRole("button", { name: "Dark" });
    const light = screen.getByRole("button", { name: "Light" });
    const system = screen.getByRole("button", { name: "System" });
    // Either aria-pressed or aria-checked must be true on the active option
    const isActive = (el: HTMLElement) =>
      el.getAttribute("aria-pressed") === "true" ||
      el.getAttribute("aria-checked") === "true";
    expect(isActive(dark)).toBe(true);
    expect(isActive(light)).toBe(false);
    expect(isActive(system)).toBe(false);
  });
});
